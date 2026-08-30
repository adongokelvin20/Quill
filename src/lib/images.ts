// Quill — Image utilities.
// Uses Z.ai image generation as the PRIMARY and ONLY source for high-quality
// 1024x1024 illustrations. Pollinations is used ONLY as a non-blocking fallback
// URL (the browser loads it on-demand, no server fetch needed).

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

const ZAI_CONFIG = {
  baseUrl: "https://internal-api.z.ai/v1",
  apiKey: "Z.ai",
  chatId: "chat-3b1d9b2f-62ee-4783-913e-141c92180b84",
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE",
  userId: "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0",
};
let zaiInstance: any = null;
async function getZai() { if (!zaiInstance) zaiInstance = new ZAI(ZAI_CONFIG); return zaiInstance; }

// ---------------------------------------------------------------------------
// Z.ai image generation — PRIMARY (1024x1024, high quality)
// ---------------------------------------------------------------------------

const ILLUSTRATION_MODIFIERS =
  "high quality children's book illustration, clean bold outlines, vibrant saturated colors, friendly cheerful mood, professional vector art, well composed, clear focal point, no text, no watermark, no signature, no border";

export async function generateImageViaZAI(
  prompt: string,
  opts: { width?: number; height?: number; retries?: number } = {}
): Promise<string | null> {
  // Direct API call — no SDK needed
  try {
    const ZAI_BASE_URL = "https://internal-api.z.ai/v1";
    const ZAI_TOKEN = process.env.ZAI_TOKEN ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE";
    const enhanced = `${prompt}. ${ILLUSTRATION_MODIFIERS}`;
    const res = await fetch(`${ZAI_BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer Z.ai",
        "X-Z-AI-From": "Z",
        "X-Chat-Id": "chat-3b1d9b2f-62ee-4783-913e-141c92180b84",
        "X-User-Id": "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0",
        "X-Token": ZAI_TOKEN,
      },
      body: JSON.stringify({ prompt: enhanced, size: pickZaiSize(opts.width ?? 1024, opts.height ?? 1024) }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const first = data.data?.[0];
    if (first?.url) return first.url;
    if (first?.base64) return `data:image/jpeg;base64,${first.base64}`;
    if (first?.b64_json) return `data:image/jpeg;base64,${first.b64_json}`;
    return null;
  } catch (err) {
    console.error("[quill] Image generation failed:", err);
    return null;
  }
}

function pickZaiSize(w: number, h: number): "1024x1024" | "1024x1792" | "1792x1024" {
  if (h > w * 1.3) return "1024x1792";
  if (w > h * 1.3) return "1792x1024";
  return "1024x1024";
}

// ---------------------------------------------------------------------------
// Z.ai image search — real photos / illustrations from the web
// ---------------------------------------------------------------------------

export interface SearchedImage {
  url: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}

export async function searchImages(
  query: string,
  count = 6
): Promise<SearchedImage[]> {
  try {
    const ZAI_BASE_URL = "https://internal-api.z.ai/v1";
    const ZAI_TOKEN = process.env.ZAI_TOKEN ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE";
    const res = await fetch(`${ZAI_BASE_URL}/images/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer Z.ai",
        "X-Z-AI-From": "Z",
        "X-Chat-Id": "chat-3b1d9b2f-62ee-4783-913e-141c92180b84",
        "X-User-Id": "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0",
        "X-Token": ZAI_TOKEN,
      },
      body: JSON.stringify({ query, count }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).slice(0, count);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Combined generator — tries Z.ai first, falls back to Pollinations URL
// ---------------------------------------------------------------------------

export interface GeneratedImage {
  url: string;
  source: "pollinations" | "zai-gen";
  width: number;
  height: number;
  prompt: string;
  cached: boolean;
}

export interface GenerateImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  model?: string;
  seed?: number;
  noLogo?: boolean;
  enhance?: boolean;
}

// Build a Pollinations URL (fallback only — browser loads on-demand)
export function pollinationsImageUrl(opts: GenerateImageOptions): string {
  const { prompt, width = 1024, height = 1024, model = "flux", seed, noLogo = true, enhance = true } = opts;
  const enhanced = enhance ? `${prompt}. ${ILLUSTRATION_MODIFIERS}` : prompt;
  const encoded = encodeURIComponent(enhanced.slice(0, 1800));
  const params = new URLSearchParams();
  params.set("width", String(width));
  params.set("height", String(height));
  params.set("model", model);
  if (noLogo) params.set("nologo", "true");
  if (seed !== undefined) params.set("seed", String(seed));
  return `https://image.pollinations.ai/prompt/${encoded}?${params.toString()}`;
}

export async function generateOrCacheImage(opts: GenerateImageOptions): Promise<GeneratedImage> {
  const prompt = opts.prompt.trim();

  // Try Z.ai first (higher quality, true 1024x1024)
  const zaiUrl = await generateImageViaZAI(prompt, { width: opts.width, height: opts.height });
  if (zaiUrl) {
    await db.asset.create({
      data: {
        source: "generated",
        prompt,
        url: zaiUrl,
        width: opts.width ?? 1024,
        height: opts.height ?? 1024,
        alt: prompt.slice(0, 200),
      },
    });
    return {
      url: zaiUrl,
      source: "zai-gen",
      width: opts.width ?? 1024,
      height: opts.height ?? 1024,
      prompt,
      cached: false,
    };
  }

  // Fallback: Pollinations URL (instant, image renders on-demand)
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const url = pollinationsImageUrl({ ...opts, seed });

  await db.asset.create({
    data: {
      source: "generated",
      prompt,
      url,
      width: opts.width ?? 1024,
      height: opts.height ?? 1024,
      alt: prompt.slice(0, 200),
    },
  });

  return {
    url,
    source: "pollinations",
    width: opts.width ?? 1024,
    height: opts.height ?? 1024,
    prompt,
    cached: false,
  };
}

// High-quality image generator used by the book generator.
export async function generateHighQualityImage(prompt: string): Promise<{ url: string; source: "zai-gen" | "pollinations" }> {
  // Try Z.ai with full retries
  const zaiUrl = await generateImageViaZAI(prompt, { retries: 3 });
  if (zaiUrl) {
    return { url: zaiUrl, source: "zai-gen" };
  }

  // Fallback to Pollinations URL (browser loads on-demand)
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = pollinationsImageUrl({
    prompt,
    width: 1024,
    height: 1024,
    model: "flux",
    seed,
  });
  return { url, source: "pollinations" };
}
