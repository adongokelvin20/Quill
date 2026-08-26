// Quill — Books list / create API.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const books = await db.book.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { pages: true } } },
  });
  return NextResponse.json({ books });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, subtitle, description, level, subject, term, language, coverColor, accentColor, topics } = body;

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
      status: "draft",
    },
  });

  return NextResponse.json({ book });
}
