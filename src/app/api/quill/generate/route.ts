// Quill — Book generation API (resumable).
// Works on Vercel Hobby plan (60s limit) by generating in 50-second chunks.
//
// POST /api/quill/generate
//   New: { level, subject, term, topics, ... } → creates book, generates for 50s
//   Resume: { bookId } → loads existing book, generates remaining pages for 50s
//
// GET /api/quill/generate?bookId=xxx → returns progress from database

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateBook, GenerateBookInput, GenerationMode } from "@/lib/generator";
import { LEVELS, SUBJECTS, getLevel } from "@/lib/curriculum";
import { getCurrentUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60; // Works on Hobby plan
export const dynamic = "force-dynamic";

const MAX_GENERATION_TIME_MS = 45000; // 45 seconds — leaves 15s buffer before 60s timeout

export async function POST(req: NextRequest) {
  let body: {
    bookId?: string; // If provided, resume generation
    level?: string;
    subject?: string;
    term?: number;
    topics?: string[];
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
    let bookId: string;
    let input: GenerateBookInput;
    let skipPages: number;

    // RESUME MODE: bookId provided
    if (body.bookId) {
      const existingBook = await db.book.findUnique({
        where: { id: body.bookId },
        include: { _count: { select: { pages: true } } },
      });

      if (!existingBook) {
        return NextResponse.json({ error: "Book not found" }, { status: 404 });
      }

      if (existingBook.status === "ready") {
        return NextResponse.json({
          bookId: existingBook.id,
          status: "ready",
          pages: existingBook._count.pages,
          title: existingBook.title,
        });
      }

      bookId = existingBook.id;

      // Reconstruct the input from the stored book
      const levelInfo = getLevel(existingBook.level as never);
      const subject = SUBJECTS.find((s) => s.id === existingBook.subject);
      if (!levelInfo || !subject) {
        return NextResponse.json({ error: "Invalid book data" }, { status: 400 });
      }

      const topics = existingBook.topics ? JSON.parse(existingBook.topics) : [];
      input = {
        level: levelInfo,
        subject,
        term: existingBook.term as 1 | 2 | 3,
        topics,
        lessons: topics.length,
        language: existingBook.language,
        useSections: false,
      };
      skipPages = existingBook._count.pages; // Skip already-generated pages

      console.log(`[quill] Resuming generation for book ${bookId}, skipping ${skipPages} existing pages`);
    } else {
      // NEW BOOK MODE
      const levelInfo = getLevel((body.level ?? "B3") as never);
      const subject = SUBJECTS.find((s) => s.id === body.subject);
      if (!levelInfo || !subject) {
        return NextResponse.json({ error: "Invalid level or subject" }, { status: 400 });
      }

      const term = ([1, 2, 3].includes(body.term ?? 1) ? body.term : 1) as 1 | 2 | 3;
      const topics = Array.isArray(body.topics) && body.topics.length > 0
        ? body.topics.slice(0, 2) // Max 2 topics
        : subject.topics[term].slice(0, 1);

      input = {
        level: levelInfo,
        subject,
        term,
        topics,
        lessons: topics.length,
        language: body.language ?? "english",
        useSections: false,
      };

      const userId = await getCurrentUserId(req);

      const book = await db.book.create({
        data: {
          title: `${subject.name} for ${levelInfo.fullLabel}`,
          subtitle: `Term ${term} • Quill Series`,
          description: `Auto-generated textbook for ${levelInfo.fullLabel}.`,
          level: levelInfo.id,
          subject: subject.id,
          term,
          language: input.language ?? "english",
          status: "generating",
          topics: JSON.stringify(topics),
          userId,
        },
      });

      bookId = book.id;
      skipPages = 0;
    }

    // Generate pages with a time limit
    const startTime = Date.now();
    let pagesGenerated = 0;
    let currentPageIndex = skipPages;
    let generationComplete = false;
    let errorMessage: string | null = null;

    try {
      for await (const ev of generateBook(input, { research: false, skipPages })) {
        // Check time limit
        if (Date.now() - startTime > MAX_GENERATION_TIME_MS) {
          console.log(`[quill] Time limit reached after ${pagesGenerated} pages, will resume`);
          break;
        }

        if (ev.type === "book-meta") {
          try {
            await db.book.update({
              where: { id: bookId },
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
                bookId,
                pageNumber: currentPageIndex,
                type: ev.pageType!,
                title: ev.pageTitle ?? null,
                content: JSON.stringify(ev.page),
              },
            });
            currentPageIndex++;
            pagesGenerated++;
          } catch (e) {
            // Page might already exist (race condition) — skip
            console.error("[quill] page create error:", e);
          }
        } else if (ev.type === "complete") {
          generationComplete = true;
        }
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[quill] generation error:", errorMessage);
    }

    // If complete or error, update book status
    if (generationComplete) {
      try {
        await db.book.update({ where: { id: bookId }, data: { status: "ready" } });
      } catch {}
    } else if (errorMessage) {
      // Mark as error only if no pages were generated
      const totalPages = await db.page.count({ where: { bookId } });
      if (totalPages === 0) {
        try {
          await db.book.update({ where: { id: bookId }, data: { status: "error" } });
        } catch {}
      }
      // If we have some pages, keep status as "generating" so client can resume
    }

    // Return current status
    const finalBook = await db.book.findUnique({
      where: { id: bookId },
      include: { _count: { select: { pages: true } } },
    });

    const status = generationComplete ? "ready" : (finalBook?.status ?? "generating");
    const pages = finalBook?._count.pages ?? 0;

    return NextResponse.json({
      bookId,
      status,
      pages,
      title: finalBook?.title,
      done: status === "ready",
      resume: !generationComplete && !errorMessage, // Tell client to resume
      error: errorMessage && pages === 0 ? errorMessage : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quill] generate API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — return progress from database
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
        status: book.status,
        pages: book._count.pages,
        title: book.title,
        done: book.status === "ready" || book.status === "error",
      });
    } catch (e) {
      console.error("[quill] status check error:", e);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  }

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
