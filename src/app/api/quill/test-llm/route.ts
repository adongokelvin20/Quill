import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  
  if (!GEMINI_KEY) {
    return NextResponse.json({ success: false, error: "GEMINI_API_KEY not set" });
  }

  // Try each model individually
  const MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-pro", "gemini-3.6-flash"];
  const results = [];

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
            generationConfig: { maxOutputTokens: 100 },
          }),
        }
      );
      const text = await res.text();
      results.push({ model, status: res.status, ok: res.ok, response: text.slice(0, 200) });
      if (res.ok) break;
    } catch (e: any) {
      results.push({ model, error: e?.message ?? String(e) });
    }
  }

  // Also test callLLM
  let llmResult = "";
  try {
    llmResult = await callLLM([{ role: "user", content: "Say hello" }], 50, 0.7);
  } catch (e: any) {
    llmResult = "ERROR: " + (e?.message ?? String(e));
  }

  return NextResponse.json({
    keyPreview: GEMINI_KEY.slice(0, 10) + "...",
    models: results,
    callLLMResult: llmResult.slice(0, 200),
  });
}
