// Quill — Book generation API.
// Two-step approach that works on Vercel serverless:
//   POST /api/quill/generate — starts generation, returns bookId immediately
//   GET /api/quill/generate?bookId=xxx — returns progress from database
//
// Generation runs synchronously in the POST request. If it times out,
// the client can continue polling GET for status (which reads from DB).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateBook, GenerateBookInput } from "@/lib/generator";
import { LEVELS, SUBJECTS, getLevel } from "@/lib/curriculum";
import { getCurrentUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min on Pro, 60s on Hobby
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: {
    level: string;
    subject: string;
    term: number;
    topics: string[];
    lessons?: number;
    language?: string;
    research?: boolean;
    targetPages?: number;
    useSections?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const levelInfo = getLevel(body.level as never);
    if (!levelInfo) return NextResponse.json({ error: `Unknown level: ${body.level}` }, { status: 400 });

    const subject = SUBJECTS.find((s) => s.id === body.subject);
    if (!subject) return NextResponse.json({ error: `Unknown subject: ${body.subject}` }, { status: 400 });

    const term = ([1, 2, 3].includes(body.term) ? body.term : 1) as 1 | 2 | 3;
    const topics = Array.isArray(body.topics) && body.topics.length > 0
      ? body.topics
      : subject.topics[term].slice(0, 3);

    // Limit to 1 topic for fastest generation
    const limitedTopics = topics.slice(0, 1);

    const input: GenerateBookInput = {
      level: levelInfo,
      subject,
      term,
      topics: limitedTopics,
      lessons: 1,
      language: body.language ?? "english",
      targetPages: body.targetPages,
      useSections: false,
    };

    const userId = await getCurrentUserId(req);

    // Create the book record
    let book;
    try {
      book = await db.book.create({
        data: {
          title: `${subject.name} for ${levelInfo.fullLabel}`,
          subtitle: `Term ${term} • Quill Series`,
          description: `Auto-generated textbook for ${levelInfo.fullLabel}.`,
          level: levelInfo.id,
          subject: subject.id,
          term,
          language: input.language ?? "english",
          status: "generating",
          topics: JSON.stringify(limitedTopics),
          targetPages: body.targetPages ?? null,
          userId,
        },
      });
    } catch (dbErr) {
      console.error("[quill] DB create error:", dbErr);
      return NextResponse.json(
        { error: "Database error. Make sure DATABASE_URL is set correctly." },
        { status: 500 }
      );
    }

    // Generate synchronously — if this times out, the client polls GET for status
    try {
      for await (const ev of generateBook(input, { research: false })) {
        if (ev.type === "book-meta") {
          try {
            await db.book.update({
              where: { id: book.id },
              data: {
                title: ev.book!.title,
                subtitle: ev.book!.subtitle,
                description: ev.book!.description,
              },
            });
          } catch (e) {
            console.error("[quill] book update error:", e);
          }
        } else if (ev.type === "page-done" && ev.page) {
          try {
            await db.page.create({
              data: {
                bookId: book.id,
                pageNumber: ev.pageIndex!,
                type: ev.pageType!,
                title: ev.pageTitle ?? null,
                content: JSON.stringify(ev.page),
              },
            });
          } catch (e) {
            console.error("[quill] page create error:", e);
          }
        } else if (ev.type === "complete") {
          try {
            await db.book.update({ where: { id: book.id }, data: { status: "ready" } });
          } catch (e) {
            console.error("[quill] book status update error:", e);
          }
        }
      }

      // Generation complete — return success
      const finalBook = await db.book.findUnique({
        where: { id: book.id },
        include: { _count: { select: { pages: true } } },
      });
      return NextResponse.json({
        bookId: book.id,
        status: "ready",
        pages: finalBook?._count.pages ?? 0,
        title: finalBook?.title,
      });
    } catch (genErr) {
      const message = genErr instanceof Error ? genErr.message : String(genErr);
      console.error("[quill] generation error:", message);
      try {
        await db.book.update({ where: { id: book.id }, data: { status: "error" } });
      } catch {}
      // Don't return error — return bookId so client can check status
      return NextResponse.json({
        bookId: book.id,
        status: "error",
        error: message,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quill] generate API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — return progress by reading from database
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const bookId = url.searchParams.get("bookId");

  if (bookId) {
    try {
      const book = await db.book.findUnique({
        where: { id: bookId },
        include: { _count: { select: { pages: true } } },
      });

      if (!book) {
        return NextResponse.json({ error: "Book not found" }, { status: 404 });
      }

      return NextResponse.json({
        bookId,
        status: book.status, // "generating" | "ready" | "error"
        pages: book._count.pages,
        title: book.title,
        done: book.status === "ready" || book.status === "error",
        error: book.status === "error" ? "Generation failed" : null,
      });
    } catch (e) {
      console.error("[quill] status check error:", e);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  }

  // Return curriculum data
  return NextResponse.json({
    levels: LEVELS,
    subjects: SUBJECTS.map((s) => ({
      id: s.id,
      name: s.name,
      appliesTo: s.appliesTo,
      topics: s.topics,
    })),
  });
}
