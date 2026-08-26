// Quill — Book generation API (streaming).
// Streams SSE events as pages are generated. The client can use these to
// render the book progressively and avoid Vercel timeout issues.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { generateBook, GenerateBookInput, planCondensing } from "@/lib/generator";
import { LEVELS, SUBJECTS, getLevel } from "@/lib/curriculum";
import { getCurrentUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — image generation adds time per page
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
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const levelInfo = getLevel(body.level as never);
  if (!levelInfo) {
    return new Response(JSON.stringify({ error: `Unknown level: ${body.level}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const subject = SUBJECTS.find((s) => s.id === body.subject);
  if (!subject) {
    return new Response(JSON.stringify({ error: `Unknown subject: ${body.subject}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const term = ([1, 2, 3].includes(body.term) ? body.term : 1) as 1 | 2 | 3;
  const topics = Array.isArray(body.topics) && body.topics.length > 0
    ? body.topics
    : subject.topics[term].slice(0, 3);

  // Determine the condensing plan up-front so we can show it to the user and
  // store it on the book record.
  const plan = body.targetPages
    ? planCondensing(body.targetPages, topics)
    : null;

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

  // Get the current user (or null for anonymous)
  const userId = await getCurrentUserId(req);

  // Create the book record up-front so the client can reference it
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
      targetPages: body.targetPages ?? null,
      userId,
    },
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("book-created", { bookId: book.id, level: levelInfo.id, subject: subject.id, term });

      try {
        for await (const ev of generateBook(input, { research: body.research })) {
          if (ev.type === "book-meta") {
            await db.book.update({
              where: { id: book.id },
              data: {
                title: ev.book!.title,
                subtitle: ev.book!.subtitle,
                description: ev.book!.description,
              },
            });
            send("book-meta", { bookId: book.id, ...ev.book! });
          } else if (ev.type === "page-start") {
            send("page-start", { pageIndex: ev.pageIndex, pageType: ev.pageType, pageTitle: ev.pageTitle });
          } else if (ev.type === "page-done" && ev.page) {
            await db.page.create({
              data: {
                bookId: book.id,
                pageNumber: ev.pageIndex!,
                type: ev.pageType!,
                title: ev.pageTitle ?? null,
                content: JSON.stringify(ev.page),
              },
            });
            send("page-done", { pageIndex: ev.pageIndex, pageType: ev.pageType, pageTitle: ev.pageTitle, page: ev.page });
          } else if (ev.type === "log") {
            send("log", { message: ev.message });
          } else if (ev.type === "complete") {
            await db.book.update({ where: { id: book.id }, data: { status: "ready" } });
            send("complete", { bookId: book.id, message: ev.message });
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await db.book.update({ where: { id: book.id }, data: { status: "error" } });
        send("error", { bookId: book.id, message });
      } finally {
        controller.close();
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
}

export async function GET() {
  return Response.json({
    levels: LEVELS,
    subjects: SUBJECTS.map((s) => ({
      id: s.id,
      name: s.name,
      appliesTo: s.appliesTo,
      topics: s.topics,
    })),
  });
}
