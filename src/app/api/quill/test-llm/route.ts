import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  
  if (!GEMINI_KEY) {
    return NextResponse.json({ success: false, error: "GEMINI_API_KEY not set" });
  }

  // Test direct Gemini API call with full error details
  try {
    const body = {
      contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 50 },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
    
    const startTime = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const elapsed = Date.now() - startTime;

    const responseText = await res.text();

    return NextResponse.json({
      success: res.ok,
      status: res.status,
      elapsedMs: elapsed,
      keyPreview: GEMINI_KEY.slice(0, 10) + "...",
      response: responseText.slice(0, 500),
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message ?? String(err),
      code: err?.code,
      cause: err?.cause?.message,
    });
  }
}
