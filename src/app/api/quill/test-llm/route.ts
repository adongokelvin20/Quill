// Test endpoint — comprehensive Z.ai SDK diagnostics
import { NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const results: any = {
    cwd: process.cwd(),
    homedir: homedir(),
    steps: [],
  };

  // Step 1: Check if .z-ai-config exists at various paths
  const paths = [
    join(process.cwd(), ".z-ai-config"),
    join(homedir(), ".z-ai-config"),
    "/etc/.z-ai-config",
    "/tmp/.z-ai-config",
  ];

  for (const p of paths) {
    const exists = existsSync(p);
    let content = "";
    if (exists) {
      try { content = readFileSync(p, "utf-8"); } catch {}
    }
    results.steps.push({
      step: `Check ${p}`,
      exists,
      content: content.slice(0, 50),
    });
  }

  // Step 2: Try to write config to /tmp and process.cwd()
  const configData = JSON.stringify({
    baseUrl: "https://internal-api.z.ai/v1",
    apiKey: "Z.ai",
    chatId: "chat-3b1d9b2f-62ee-4783-913e-141c92180b84",
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE",
    userId: "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0",
  });

  try {
    writeFileSync("/tmp/.z-ai-config", configData, "utf-8");
    results.steps.push({ step: "Write /tmp/.z-ai-config", success: true });
  } catch (e: any) {
    results.steps.push({ step: "Write /tmp/.z-ai-config", success: false, error: e.message });
  }

  try {
    writeFileSync(join(process.cwd(), ".z-ai-config"), configData, "utf-8");
    results.steps.push({ step: "Write process.cwd()/.z-ai-config", success: true });
  } catch (e: any) {
    results.steps.push({ step: "Write process.cwd()/.z-ai-config", success: false, error: e.message });
  }

  // Step 3: Try direct fetch to Z.ai API
  try {
    const startTime = Date.now();
    const res = await fetch("https://internal-api.z.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer Z.ai",
        "X-Z-AI-From": "Z",
        "X-Chat-Id": "chat-3b1d9b2f-62ee-4783-913e-141c92180b84",
        "X-User-Id": "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0",
        "X-Token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Say hello" }],
        max_tokens: 20,
      }),
    });
    const elapsed = Date.now() - startTime;
    const text = await res.text();
    results.steps.push({
      step: "Direct fetch to internal-api.z.ai",
      success: res.ok,
      status: res.status,
      elapsedMs: elapsed,
      response: text.slice(0, 200),
    });
  } catch (e: any) {
    results.steps.push({
      step: "Direct fetch to internal-api.z.ai",
      success: false,
      error: e.message,
      code: e.code,
      cause: e.cause?.message,
    });
  }

  // Step 4: Try ZAI.create()
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const res = await zai.chat.completions.create({
      messages: [{ role: "user", content: "Say hello" }],
      max_tokens: 20,
    });
    results.steps.push({
      step: "ZAI.create() + chat",
      success: true,
      response: res.choices?.[0]?.message?.content ?? "",
    });
  } catch (e: any) {
    results.steps.push({
      step: "ZAI.create() + chat",
      success: false,
      error: e.message,
    });
  }

  return NextResponse.json(results);
}
