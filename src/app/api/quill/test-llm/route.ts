import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  
  if (!GEMINI_KEY) {
    return NextResponse.json({ success: false, error: "GEMINI_API_KEY not set" });
  }

  // Just try gemini-3.6-flash with a short timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
          generationConfig: { maxOutputTokens: 100 },
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    const text = await res.text();
    return NextResponse.json({
      success: res.ok,
      status: res.status,
      model: "gemini-3.6-flash",
      response: text.slice(0, 500),
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      model: "gemini-3.6-flash",
      error: err?.message ?? String(err),
      code: err?.code,
    });
  }
}
