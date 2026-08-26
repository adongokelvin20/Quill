// Quill — Book by ID API.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const book = await db.book.findUnique({
    where: { id },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  return NextResponse.json({ book });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
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
    },
  });
  return NextResponse.json({ book: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.book.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
