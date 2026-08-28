// Quill — Books list / create API.
// Books are scoped to the current user (or anonymous if not signed in).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    const where = userId ? { userId } : { userId: null };

    const books = await db.book.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { pages: true } } },
    });
    return NextResponse.json({ books });
  } catch (err) {
    console.error("[quill] GET /api/quill/books error:", err);
    return NextResponse.json(
      { error: "Database error. If you're on Vercel, make sure you've set up PostgreSQL and set DATABASE_URL.", books: [] },
      { status: 200 } // Return 200 with empty array so the UI doesn't crash
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    const body = await req.json().catch(() => ({}));
    const { title, subtitle, description, level, subject, term, language, coverColor, accentColor, topics, targetPages } = body;

    const book = await db.book.create({
      data: {
        title: title ?? "Untitled Book",
        subtitle,
        description,
        level: level ?? "B3",
        subject: subject ?? "english",
        term: term ?? 1,
        language: language ?? "english",
        coverColor: coverColor ?? "#0f766e",
        accentColor: accentColor ?? "#f59e0b",
        topics: topics ? JSON.stringify(topics) : null,
        targetPages: targetPages ?? null,
        status: "draft",
        userId,
      },
    });

    return NextResponse.json({ book });
  } catch (err) {
    console.error("[quill] POST /api/quill/books error:", err);
    return NextResponse.json(
      { error: "Failed to create book. Database may not be configured." },
      { status: 500 }
    );
  }
}
