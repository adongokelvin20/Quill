// Quill — Books list / create API.
// Books are scoped to the current user (or anonymous if not signed in).
// GET  /api/quill/books          → list books for current user
// POST /api/quill/books          → create empty book (sets userId if signed in)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);

  // If signed in, return only the user's books. If anonymous, return books
  // with null userId (anonymous books). This keeps libraries isolated per user.
  const where = userId ? { userId } : { userId: null };

  const books = await db.book.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { pages: true } } },
  });
  return NextResponse.json({ books });
}

export async function POST(req: NextRequest) {
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
      // Associate with the current user (or null for anonymous)
      userId,
    },
  });

  return NextResponse.json({ book });
}
