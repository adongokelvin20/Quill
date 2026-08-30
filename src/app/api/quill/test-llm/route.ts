// Test endpoint — checks if Z.ai API is reachable from the server
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ZAI_BASE = "https://internal-api.z.ai/v1";
  const ZAI_HEADERS: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": "Bearer Z.ai",
    "X-Z-AI-From": "Z",
    "X-Chat-Id": "chat-3b1d9b2f-62ee-4783-913e-141c92180b84",
    "X-User-Id": "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0",
    "X-Token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE",
  };

  try {
    const startTime = Date.now();
    const res = await fetch(`${ZAI_BASE}/chat/completions`, {
      method: "POST",
      headers: ZAI_HEADERS,
      body: JSON.stringify({
        messages: [{ role: "user", content: "Say hello" }],
        max_tokens: 20,
      }),
    });

    const elapsed = Date.now() - startTime;
    const status = res.status;
    const text = await res.text();

    return NextResponse.json({
      success: res.ok,
      status,
      elapsedMs: elapsed,
      response: text.slice(0, 500),
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message ?? String(err),
      code: err?.code ?? "unknown",
    });
  }
}
