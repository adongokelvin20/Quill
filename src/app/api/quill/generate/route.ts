// Quill — Book generation API (one page per request).
// Each request generates ONE page and returns immediately.
// This guarantees every request completes in under 10 seconds.
//
// POST /api/quill/generate — creates book + generates first page
// POST /api/quill/generate {bookId} — generates next page
// GET /api/quill/generate?bookId=xxx — returns progress

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateBook, GenerateBookInput } from "@/lib/generator";
import { LEVELS, SUBJECTS, getLevel } from "@/lib/curriculum";
import { getCurrentUserId } from "@/lib/auth";
import { Block, PageContent, makeId } from "@/lib/blocks";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby plan max
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: {
    bookId?: string;
    level?: string;
    subject?: string;
    term?: number;
    topics?: string[];
    lessons?: number;
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
    let bookMeta: { title: string; subtitle: string; description: string } | null = null;

    // RESUME MODE: bookId provided
    if (body.bookId) {
      const existingBook = await db.book.findUnique({
        where: { id: body.bookId },
        include: { pages: { orderBy: { pageNumber: "asc" } } },
      });

      if (!existingBook) {
        return NextResponse.json({ error: "Book not found" }, { status: 404 });
      }

      if (existingBook.status === "ready") {
        return NextResponse.json({
          bookId: existingBook.id,
          status: "ready",
          pages: existingBook.pages.length,
          title: existingBook.title,
          done: true,
        });
      }

      bookId = existingBook.id;

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
      skipPages = existingBook.pages.length;

      console.log(`[quill] Resuming book ${bookId}, generating page ${skipPages + 1}`);
    } else {
      // NEW BOOK MODE
      const levelInfo = getLevel((body.level ?? "B3") as never);
      const subject = SUBJECTS.find((s) => s.id === body.subject);
      if (!levelInfo || !subject) {
        return NextResponse.json({ error: "Invalid level or subject" }, { status: 400 });
      }

      const term = ([1, 2, 3].includes(body.term ?? 1) ? body.term : 1) as 1 | 2 | 3;
      const topics = Array.isArray(body.topics) && body.topics.length > 0
        ? body.topics.slice(0, 5)  // Allow up to 5 topics
        : subject.topics[term].slice(0, 1);

      input = {
        level: levelInfo,
        subject,
        term,
        topics,
        lessons: topics.length,
        language: "english",
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
          language: "english",
          status: "generating",
          topics: JSON.stringify(topics),
          userId,
        },
      });

      bookId = book.id;
      skipPages = 0;

      // Generate book meta (title) — quick LLM call
      try {
        const meta = await generateBookMeta(input);
        bookMeta = meta;
        await db.book.update({
          where: { id: bookId },
          data: { title: meta.title, subtitle: meta.subtitle, description: meta.description },
        });
      } catch {
        // Use default title
      }
    }

    // Generate exactly ONE page
    let generatedPage = false;
    let allDone = false;
    let errorMessage: string | null = null;

    try {
      // Use the generator but only take the first page-done event
      for await (const ev of generateBook(input, { research: false, skipPages })) {
        if (ev.type === "book-meta" && !bookMeta) {
          bookMeta = ev.book!;
          try {
            await db.book.update({
              where: { id: bookId },
              data: { title: bookMeta.title, subtitle: bookMeta.subtitle, description: bookMeta.description },
            });
          } catch {}
        } else if (ev.type === "page-done" && ev.page) {
          // Save this one page
          try {
            await db.page.create({
              data: {
                bookId,
                pageNumber: skipPages,
                type: ev.pageType!,
                title: ev.pageTitle ?? null,
                content: JSON.stringify(ev.page),
              },
            });
            generatedPage = true;
          } catch (e) {
            // Page might already exist
            console.error("[quill] page create error:", e);
          }
          break; // Only generate ONE page per request
        } else if (ev.type === "complete") {
          allDone = true;
        }
      }

      // Check if we've generated all pages
      // Total expected: cover(1) + toc(1) + lessons(topics.length * 3) + glossary(1) + closing(1)
      const totalPages = await db.page.count({ where: { bookId } });
      const expectedPages = 2 + (input.topics.length * 3) + 2; // cover + toc + lessons + glossary + closing
      if (totalPages >= expectedPages || allDone) {
        allDone = true;
        try {
          await db.book.update({ where: { id: bookId }, data: { status: "ready" } });
        } catch {}
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      // Make 429 errors more helpful
      if (errorMessage.includes("429")) {
        errorMessage = "Gemini API quota exceeded. The free tier limits reset daily. To generate more books today, create a new API key from a different Google account at https://aistudio.google.com/apikey and update GEMINI_API_KEY in Vercel Settings.";
      }
      console.error("[quill] page generation error:", errorMessage);
    }

    // Return status
    const finalBook = await db.book.findUnique({
      where: { id: bookId },
      include: { _count: { select: { pages: true } } },
    });

    const status = allDone ? "ready" : (finalBook?.status ?? "generating");
    const pages = finalBook?._count.pages ?? 0;

    return NextResponse.json({
      bookId,
      status,
      pages,
      title: finalBook?.title ?? bookMeta?.title,
      done: status === "ready",
      resume: !allDone, // Tell client to continue
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

// Import for the generator's book meta type
import type { GenerateBookProgress } from "@/lib/generator";
