// Quill — Page CRUD API.
// POST   /api/quill/pages                { bookId, type, title, content, afterPageId? }
// PATCH  /api/quill/pages/[id]           { title?, content?, type? }
// DELETE /api/quill/pages/[id]

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { bookId, type, title, content, afterPageId } = body as {
    bookId: string;
    type?: string;
    title?: string;
    content?: string;
    afterPageId?: string;
  };

  if (!bookId) return NextResponse.json({ error: "bookId is required" }, { status: 400 });

  // Determine page number
  let pageNumber = 1;
  if (afterPageId) {
    const ref = await db.page.findUnique({ where: { id: afterPageId } });
    if (ref) {
      pageNumber = ref.pageNumber + 1;
      // Shift all subsequent pages
      await db.page.updateMany({
        where: { bookId, pageNumber: { gte: pageNumber } },
        data: { pageNumber: { increment: 1 } },
      });
    }
  } else {
    const last = await db.page.findFirst({
      where: { bookId },
      orderBy: { pageNumber: "desc" },
    });
    if (last) pageNumber = last.pageNumber + 1;
  }

  const page = await db.page.create({
    data: {
      bookId,
      pageNumber,
      type: type ?? "lesson",
      title: title ?? null,
      content: content ?? JSON.stringify({ type: type ?? "lesson", blocks: [] }),
    },
  });

  return NextResponse.json({ page });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const updated = await db.page.update({
    where: { id },
    data: {
      title: body.title,
      content: body.content,
      type: body.type,
    },
  });
  return NextResponse.json({ page: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const page = await db.page.findUnique({ where: { id } });
  if (!page) return NextResponse.json({ ok: true });
  await db.page.delete({ where: { id } });
  // Renumber subsequent pages
  await db.page.updateMany({
    where: { bookId: page.bookId, pageNumber: { gt: page.pageNumber } },
    data: { pageNumber: { decrement: 1 } },
  });
  return NextResponse.json({ ok: true });
}
