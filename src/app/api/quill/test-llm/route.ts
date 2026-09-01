import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Use 500 tokens so the thinking model has room
    const text = await callLLM([{ role: "user", content: "Say hello" }], 500, 0.7);
    return NextResponse.json({ success: true, response: text.slice(0, 200) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? String(err) });
  }
}
