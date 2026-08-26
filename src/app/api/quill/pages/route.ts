// Quill — Page CRUD API.
// All operations verify that the parent book belongs to the current user.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verifyBookOwnership(bookId: string, userId: string | null) {
  const book = await db.book.findUnique({ where: { id: bookId }, select: { userId: true } });
  if (!book) return false;
  return book.userId === userId;
}

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

  const userId = await getCurrentUserId(req);
  const owns = await verifyBookOwnership(bookId, userId);
  if (!owns) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  // Determine page number
  let pageNumber = 1;
  if (afterPageId) {
    const ref = await db.page.findUnique({ where: { id: afterPageId } });
    if (ref) {
      pageNumber = ref.pageNumber + 1;
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
  const userId = await getCurrentUserId(req);

  const page = await db.page.findUnique({ where: { id }, select: { bookId: true } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  const owns = await verifyBookOwnership(page.bookId, userId);
  if (!owns) return NextResponse.json({ error: "Page not found" }, { status: 404 });

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

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserId(req);

  const page = await db.page.findUnique({ where: { id } });
  if (!page) return NextResponse.json({ ok: true });
  const owns = await verifyBookOwnership(page.bookId, userId);
  if (!owns) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  await db.page.delete({ where: { id } });
  await db.page.updateMany({
    where: { bookId: page.bookId, pageNumber: { gt: page.pageNumber } },
    data: { pageNumber: { decrement: 1 } },
  });
  return NextResponse.json({ ok: true });
}
