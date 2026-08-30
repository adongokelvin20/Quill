// Quill — DOCX export API.
// Returns the DOCX file directly as a download (no disk storage needed).
// This works on Vercel because the file is returned in the HTTP response,
// not saved to disk (which doesn't persist across serverless instances).

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { Packer } from "docx";
// Import the document builder function directly
import { buildDocForBook } from "@/lib/docx-exporter";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { bookId } = body as { bookId?: string };
  if (!bookId) return NextResponse.json({ error: "bookId is required" }, { status: 400 });

  const userId = await getCurrentUserId(req);
  const book = await db.book.findUnique({ where: { id: bookId }, select: { userId: true, title: true } });
  if (!book || book.userId !== userId) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  try {
    // Build the document and return it directly as a response
    const doc = await buildDocForBook(bookId);
    const buffer = await Packer.toBuffer(doc);

    // Return the file directly as a download
    const filename = `${book.title.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quill] export failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
