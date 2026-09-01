import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const text = await callLLM([{ role: "user", content: "Say hello" }], 50, 0.7);
    return NextResponse.json({ success: true, response: text.slice(0, 200) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? String(err) });
  }
}
