// Quill — Book by ID API.
// Books can only be accessed by their owner (or by anonymous users if the book
// has no owner). This prevents users from reading other users' books.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getBookForUser(id: string, userId: string | null) {
  const book = await db.book.findUnique({ where: { id } });
  if (!book) return null;
  // Owner check: if the book has a userId, it must match the current user.
  // Books with null userId are accessible to anonymous users only.
  if (book.userId !== userId) return null;
  return book;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserId(req);
  const book = await getBookForUser(id, userId);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  const bookWithPages = await db.book.findUnique({
    where: { id },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  return NextResponse.json({ book: bookWithPages });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserId(req);
  const book = await getBookForUser(id, userId);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updated = await db.book.update({
    where: { id },
    data: {
      title: body.title,
      subtitle: body.subtitle,
      description: body.description,
      coverColor: body.coverColor,
      accentColor: body.accentColor,
      status: body.status,
      targetPages: body.targetPages,
    },
  });
  return NextResponse.json({ book: updated });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserId(req);
  const book = await getBookForUser(id, userId);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  await db.book.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
