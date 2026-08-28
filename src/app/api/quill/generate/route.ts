// Quill — Book generation API (non-blocking).
// Starts generation in the background and returns immediately.
// The client polls /api/quill/generate/status?bookId=xxx for progress.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateBook, GenerateBookInput } from "@/lib/generator";
import { LEVELS, SUBJECTS, getLevel } from "@/lib/curriculum";
import { getCurrentUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30; // Quick response — generation runs in background
export const dynamic = "force-dynamic";

// In-memory progress store (per server instance).
// On Vercel, each function instance has its own memory, so we also persist to DB.
const progressStore = new Map<string, { message: string; pages: number; total: number; done: boolean; error: string | null }>();

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

    const input: GenerateBookInput = {
      level: levelInfo,
      subject,
      term,
      topics,
      lessons: body.lessons ?? Math.min(4, topics.length),
      language: body.language ?? "english",
      targetPages: body.targetPages,
      useSections: body.useSections ?? true,
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
          topics: JSON.stringify(topics),
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

    // Initialize progress
    const totalEstimate = 4 + (input.topics.length * 3) + (input.useSections ? Math.ceil(input.topics.length / 3) : 0);
    progressStore.set(book.id, { message: "Starting generation...", pages: 0, total: totalEstimate, done: false, error: null });

    // Start generation in the background (fire and forget — don't await)
    generateBookInBackground(book.id, input, body.research ?? false, progressStore).catch((err) => {
      console.error("[quill] background generation error:", err);
      const prog = progressStore.get(book.id);
      if (prog) {
        prog.done = true;
        prog.error = err instanceof Error ? err.message : String(err);
      }
    });

    // Return immediately with the book ID
    return NextResponse.json({
      bookId: book.id,
      status: "generating",
      message: "Generation started. Poll /api/quill/generate/status?bookId=xxx for progress.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quill] generate API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Background generation function — runs without blocking the response
async function generateBookInBackground(
  bookId: string,
  input: GenerateBookInput,
  research: boolean,
  progressStore: Map<string, { message: string; pages: number; total: number; done: boolean; error: string | null }>
) {
  let pageCount = 0;
  try {
    for await (const ev of generateBook(input, { research })) {
      const prog = progressStore.get(bookId);
      if (!prog) break;

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
      } else if (ev.type === "page-start") {
        prog.message = `Generating page ${pageCount + 1}: ${ev.pageTitle ?? ""}`;
      } else if (ev.type === "page-done" && ev.page) {
        try {
          await db.page.create({
            data: {
              bookId,
              pageNumber: ev.pageIndex!,
              type: ev.pageType!,
              title: ev.pageTitle ?? null,
              content: JSON.stringify(ev.page),
            },
          });
          pageCount++;
          prog.pages = pageCount;
          prog.message = `Completed page ${pageCount}: ${ev.pageTitle ?? ""}`;
        } catch (e) {
          console.error("[quill] page create error:", e);
        }
      } else if (ev.type === "log") {
        prog.message = ev.message ?? "";
      } else if (ev.type === "complete") {
        prog.done = true;
        prog.message = `Complete! ${pageCount} pages generated.`;
        try {
          await db.book.update({ where: { id: bookId }, data: { status: "ready" } });
        } catch (e) {
          console.error("[quill] book status update error:", e);
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quill] background generation error:", message);
    const prog = progressStore.get(bookId);
    if (prog) {
      prog.done = true;
      prog.error = message;
    }
    try {
      await db.book.update({ where: { id: bookId }, data: { status: "error" } });
    } catch (e) {
      // ignore
    }
  }
}

// GET — list levels + subjects
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const bookId = url.searchParams.get("bookId");

  // If bookId is provided, return progress
  if (bookId) {
    const prog = progressStore.get(bookId);
    if (prog) {
      return NextResponse.json({
        bookId,
        message: prog.message,
        pages: prog.pages,
        total: prog.total,
        done: prog.done,
        error: prog.error,
      });
    }
    // Fallback to DB — check book status
    try {
      const book = await db.book.findUnique({ where: { id: bookId }, select: { status: true, _count: { select: { pages: true } } } });
      if (book) {
        return NextResponse.json({
          bookId,
          message: book.status === "ready" ? "Complete" : book.status === "error" ? "Generation failed" : "Generating...",
          pages: book._count.pages,
          total: 0,
          done: book.status === "ready" || book.status === "error",
          error: book.status === "error" ? "Generation failed" : null,
        });
      }
    } catch {
      // DB not available
    }
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  // Otherwise return curriculum data
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
