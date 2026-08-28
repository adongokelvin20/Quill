// Quill — Signup API.
// POST /api/auth/signup  { email, password, name? }

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, password, name } = body as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (!EMAIL_RE.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Check if user already exists
    try {
      const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please log in instead." },
          { status: 409 }
        );
      }
    } catch (err) {
      console.error("[quill] signup - DB check error:", err);
      return NextResponse.json(
        { error: "Database is not configured. If you're on Vercel, set up PostgreSQL and set DATABASE_URL." },
        { status: 500 }
      );
    }

    // Create the user
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await db.user.create({
        data: {
          email: normalizedEmail,
          name: name?.trim() || null,
          passwordHash,
        },
      });

      return NextResponse.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name },
      });
    } catch (err) {
      console.error("[quill] signup - DB create error:", err);
      return NextResponse.json(
        { error: "Failed to create account. Database may not be configured." },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[quill] signup error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
