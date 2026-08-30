// Quill — Image utilities.
// Direct API calls — no SDK, no config file.

import { db } from "@/lib/db";

const ZAI_BASE = "https://internal-api.z.ai/v1";
const ZAI_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Authorization": "Bearer Z.ai",
  "X-Z-AI-From": "Z",
  "X-Chat-Id": "chat-3b1d9b2f-62ee-4783-913e-141c92180b84",
  "X-User-Id": "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0",
  "X-Token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE",
};

const ILLUSTRATION_MODIFIERS =
  "high quality children's book illustration, clean bold outlines, vibrant saturated colors, friendly cheerful mood, professional vector art, well composed, clear focal point, no text, no watermark, no signature, no border";

export async function generateImageViaZAI(
  prompt: string,
  opts: { width?: number; height?: number; retries?: number } = {}
): Promise<string | null> {
  try {
    const enhanced = `${prompt}. ${ILLUSTRATION_MODIFIERS}`;
    const res = await fetch(`${ZAI_BASE}/images/generations`, {
      method: "POST",
      headers: ZAI_HEADERS,
      body: JSON.stringify({ prompt: enhanced, size: "1024x1024" }),
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

export interface SearchedImage {
  url: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}

export async function searchImages(query: string, count = 6): Promise<SearchedImage[]> {
  try {
    const res = await fetch(`${ZAI_BASE}/images/search`, {
      method: "POST",
      headers: ZAI_HEADERS,
      body: JSON.stringify({ query, count }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).slice(0, count);
  } catch {
    return [];
  }
}

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
  const zaiUrl = await generateImageViaZAI(prompt);
  if (zaiUrl) {
    return { url: zaiUrl, source: "zai-gen", width: 1024, height: 1024, prompt, cached: false };
  }
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const url = pollinationsImageUrl({ ...opts, seed });
  return { url, source: "pollinations", width: 1024, height: 1024, prompt, cached: false };
}

export async function generateHighQualityImage(prompt: string): Promise<{ url: string; source: "zai-gen" | "pollinations" }> {
  const zaiUrl = await generateImageViaZAI(prompt);
  if (zaiUrl) return { url: zaiUrl, source: "zai-gen" };
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = pollinationsImageUrl({ prompt, width: 1024, height: 1024, model: "flux", seed });
  return { url, source: "pollinations" };
}
