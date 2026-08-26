// Quill — Page by ID API (single page CRUD).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verifyPageOwnership(pageId: string, userId: string | null) {
  const page = await db.page.findUnique({ where: { id: pageId }, select: { bookId: true } });
  if (!page) return false;
  const book = await db.book.findUnique({ where: { id: page.bookId }, select: { userId: true } });
  if (!book) return false;
  return book.userId === userId;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserId(req);
  const owns = await verifyPageOwnership(id, userId);
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
  const owns = await verifyPageOwnership(id, userId);
  if (!owns) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const page = await db.page.findUnique({ where: { id } });
  if (!page) return NextResponse.json({ ok: true });
  await db.page.delete({ where: { id } });
  await db.page.updateMany({
    where: { bookId: page.bookId, pageNumber: { gt: page.pageNumber } },
    data: { pageNumber: { decrement: 1 } },
  });
  return NextResponse.json({ ok: true });
}
