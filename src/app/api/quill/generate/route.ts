// Quill — Book generation API (synchronous, streaming).
// Generates the book in a single request and streams progress via SSE.
// Uses maxDuration=300 (5 min) on Vercel Pro, or 60s on Hobby.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateBook, GenerateBookInput } from "@/lib/generator";
import { LEVELS, SUBJECTS, getLevel } from "@/lib/curriculum";
import { getCurrentUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;
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

    // Limit to 2 topics max to ensure generation completes within timeout
    const limitedTopics = topics.slice(0, 2);

    const input: GenerateBookInput = {
      level: levelInfo,
      subject,
      term,
      topics: limitedTopics,
      lessons: body.lessons ?? Math.min(2, limitedTopics.length),
      language: body.language ?? "english",
      targetPages: body.targetPages,
      useSections: false, // Always disable sections to save time
    };

    const userId = await getCurrentUserId(req);

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

    // Stream the generation — this keeps the connection alive
    let streamClosed = false;
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            console.error("[quill] stream enqueue error:", e);
          }
        };

        send("book-created", { bookId: book.id, level: levelInfo.id, subject: subject.id, term });

        try {
          for await (const ev of generateBook(input, { research: false })) { // Always disable research for speed
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
              send("book-meta", { bookId: book.id, ...ev.book! });
            } else if (ev.type === "page-start") {
              send("page-start", { pageIndex: ev.pageIndex, pageType: ev.pageType, pageTitle: ev.pageTitle });
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
              send("page-done", { pageIndex: ev.pageIndex, pageType: ev.pageType, pageTitle: ev.pageTitle, page: ev.page });
            } else if (ev.type === "log") {
              send("log", { message: ev.message });
            } else if (ev.type === "complete") {
              try {
                await db.book.update({ where: { id: book.id }, data: { status: "ready" } });
              } catch (e) {
                console.error("[quill] book status update error:", e);
              }
              send("complete", { bookId: book.id, message: ev.message });
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[quill] generation error:", message);
          try {
            await db.book.update({ where: { id: book.id }, data: { status: "error" } });
          } catch {
            // ignore
          }
          send("error", { bookId: book.id, message });
        } finally {
          streamClosed = true;
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quill] generate API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — list levels + subjects
export async function GET() {
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
