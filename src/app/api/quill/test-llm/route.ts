import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  
  if (!GEMINI_KEY) {
    return NextResponse.json({ success: false, error: "GEMINI_API_KEY not set" });
  }

  try {
    const startTime = Date.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Say hello in one word" }] }],
          generationConfig: { maxOutputTokens: 200 },
        }),
      }
    );
    const elapsed = Date.now() - startTime;
    const text = await res.text();

    return NextResponse.json({
      success: res.ok,
      status: res.status,
      model: "gemini-3.6-flash",
      elapsedMs: elapsed,
      response: text.slice(0, 500),
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message ?? String(err),
    });
  }
}
