// Quill — Image generation API.
// POST /api/quill/image  { prompt, width?, height?, source? }
//   source: "generate" (default) — tries Z.ai first, falls back to Pollinations
//   source: "search" — searches the web via Z.ai image search

import { NextRequest } from "next/server";
import { generateOrCacheImage, searchImages } from "@/lib/images";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 minutes — Z.ai generation can take 10-30s
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { prompt, width, height, model, source } = body as {
    prompt?: string;
    width?: number;
    height?: number;
    model?: string;
    source?: "generate" | "search";
  };

  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  if (source === "search") {
    const items = await searchImages(prompt, 8);
    return Response.json({ images: items, source: "search" });
  }

  // Generate — tries Z.ai first (1024x1024, high quality), falls back to Pollinations
  const img = await generateOrCacheImage({
    prompt,
    width: width ?? 1024,
    height: height ?? 1024,
    model: model ?? "flux",
  });
  return Response.json({ image: img, source: "generate" });
}

// GET /api/quill/image?prompt=...&width=1024&height=1024
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const prompt = url.searchParams.get("prompt");
  if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });
  const width = parseInt(url.searchParams.get("width") ?? "1024");
  const height = parseInt(url.searchParams.get("height") ?? "1024");
  const img = await generateOrCacheImage({ prompt, width, height });
  return Response.json({ image: img });
}
