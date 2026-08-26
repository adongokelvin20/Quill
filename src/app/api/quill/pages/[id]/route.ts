// Quill — Page by ID API (single page CRUD).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  await db.page.updateMany({
    where: { bookId: page.bookId, pageNumber: { gt: page.pageNumber } },
    data: { pageNumber: { decrement: 1 } },
  });
  return NextResponse.json({ ok: true });
}
