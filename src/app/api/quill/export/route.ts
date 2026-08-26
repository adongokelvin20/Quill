// Quill — DOCX export API.
// POST /api/quill/export  { bookId }
// Verifies the book belongs to the current user before exporting.

import { NextRequest, NextResponse } from "next/server";
import { exportBookToDocx } from "@/lib/docx-exporter";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 180; // 3 minutes — image-heavy export can take a while
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { bookId } = body as { bookId?: string };
  if (!bookId) return NextResponse.json({ error: "bookId is required" }, { status: 400 });

  const userId = await getCurrentUserId(req);
  const book = await db.book.findUnique({ where: { id: bookId }, select: { userId: true } });
  if (!book || book.userId !== userId) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  try {
    const result = await exportBookToDocx(bookId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quill] export failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
