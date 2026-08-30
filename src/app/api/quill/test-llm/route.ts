// Test endpoint — checks if Z.ai SDK works
import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configPath = join(process.cwd(), ".z-ai-config");
  const configExists = existsSync(configPath);
  let configContent = "";
  if (configExists) {
    try { configContent = readFileSync(configPath, "utf-8").slice(0, 100); } catch {}
  }

  try {
    const startTime = Date.now();
    const zai = await ZAI.create();
    const res = await zai.chat.completions.create({
      messages: [{ role: "user", content: "Say hello" }],
      max_tokens: 20,
    });
    const elapsed = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      configExists,
      configPreview: configContent,
      cwd: process.cwd(),
      response: res.choices?.[0]?.message?.content ?? "",
      elapsedMs: elapsed,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      configExists,
      configPreview: configContent,
      cwd: process.cwd(),
      error: err?.message ?? String(err),
    });
  }
}
