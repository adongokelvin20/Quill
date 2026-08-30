import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const hasGeminiKey = !!(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY);
  
  try {
    const startTime = Date.now();
    const response = await callLLM(
      [{ role: "user", content: "Say hello in JSON: {\"msg\":\"hello\"}" }],
      50,
      0.7
    );
    const elapsed = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      hasGeminiKey,
      elapsedMs: elapsed,
      response: response.slice(0, 200),
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      hasGeminiKey,
      error: err?.message ?? String(err),
    });
  }
}
