// Quill — Image utilities.
// Uses Z.ai image generation as the PRIMARY and ONLY source for high-quality
// 1024x1024 illustrations. Pollinations is used ONLY as a non-blocking fallback
// URL (the browser loads it on-demand, no server fetch needed).

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Z.ai image generation — PRIMARY (1024x1024, high quality)
// ---------------------------------------------------------------------------

const ILLUSTRATION_MODIFIERS =
  "high quality children's book illustration, clean bold outlines, vibrant saturated colors, friendly cheerful mood, professional vector art, well composed, clear focal point, no text, no watermark, no signature, no border";

export async function generateImageViaZAI(
  prompt: string,
  opts: { width?: number; height?: number; retries?: number } = {}
): Promise<string | null> {
  const retries = opts.retries ?? 3;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const zai = await ZAI.create();
      const sizes = pickZaiSize(opts.width ?? 1024, opts.height ?? 1024);

      // Enhance the prompt for better quality and organization
      const enhanced = `${prompt}. ${ILLUSTRATION_MODIFIERS}`;

      const res = await zai.images.generations.create({
        prompt: enhanced,
        size: sizes,
      });

      // Z.ai returns base64 in the `base64` field
      const data = (res as unknown as { data?: Array<{ base64?: string; url?: string; b64_json?: string }> }).data ?? [];
      const first = data[0];
      if (!first) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        return null;
      }

      // Prefer URL, then base64, then b64_json
      if (first.url) return first.url;
      const b64 = first.base64 ?? first.b64_json;
      if (b64) return `data:image/jpeg;base64,${b64}`;
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[quill] Z.ai image generation failed (attempt ${attempt + 1}/${retries + 1}):`, msg);
      // If rate limited or connection error, wait longer before retry
      if (attempt < retries) {
        const wait = msg.includes("429") ? 5000 * (attempt + 1) : 2000 * (attempt + 1);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return null;
    }
  }
  return null;
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
    const zai = await ZAI.create();
    const res = await zai.images.search.create({ query, count });
    const items = (res as unknown as { items?: SearchedImage[] }).items ?? [];
    return items.slice(0, count);
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
