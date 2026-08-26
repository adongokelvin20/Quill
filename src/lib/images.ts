// Quill — Image utilities.
// We use TWO sources so the system never depends on a single API:
//   1. Pollinations.ai  — free, no API key, supports `flux` model. Used by default.
//   2. Z.ai image generation SDK — fallback when Pollinations fails.
//   3. Z.ai image search — pulls real photos / illustrations from the web.

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// 1. Pollinations.ai — text-to-image (free, no API key required)
//    Docs: https://image.pollinations.ai/prompt/{prompt}?width=&height=&model=&nologo=true
// ---------------------------------------------------------------------------

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

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
  // Model: "flux" | "flux-realism" | "flux-anime" | "flux-3d" | "turbo"
  model?: string;
  // Optional seed for reproducibility
  seed?: number;
  // If true, do not show the Pollinations watermark
  noLogo?: boolean;
  // If true, enhance the prompt with kid-friendly illustration modifiers
  enhance?: boolean;
}

/**
 * Generate an image using Pollinations.ai (free, no API key).
 * The URL itself is the generator — Pollinations renders the image on-demand.
 * This means we can return the URL immediately without any network wait.
 */
export function pollinationsImageUrl(opts: GenerateImageOptions): string {
  const {
    prompt,
    width = 1024,
    height = 1024,
    model = "flux",
    seed,
    noLogo = true,
    enhance = true,
  } = opts;

  const enhanced = enhance
    ? `${prompt}. ${GLOBAL_ILLUSTRATION_MODIFIERS}`
    : prompt;

  const encoded = encodeURIComponent(enhanced.slice(0, 1800));
  const params = new URLSearchParams();
  params.set("width", String(width));
  params.set("height", String(height));
  params.set("model", model);
  if (noLogo) params.set("nologo", "true");
  if (seed !== undefined) params.set("seed", String(seed));
  return `${POLLINATIONS_BASE}/${encoded}?${params.toString()}`;
}

// Global modifiers that push the model toward clean, kid-friendly illustrations.
const GLOBAL_ILLUSTRATION_MODIFIERS =
  "high quality children's book illustration, clean bold outlines, vibrant saturated colors, friendly cheerful mood, professional vector art, no text, no watermark, no signature";

// ---------------------------------------------------------------------------
// 2. Z.ai image generation (fallback)
// ---------------------------------------------------------------------------

export async function generateImageViaZAI(
  prompt: string,
  opts: { width?: number; height?: number } = {}
): Promise<string | null> {
  try {
    const zai = await ZAI.create();
    const sizes = pickZaiSize(opts.width ?? 1024, opts.height ?? 1024);
    const res = await zai.images.generations.create({
      prompt: `${prompt}. ${GLOBAL_ILLUSTRATION_MODIFIERS}`,
      size: sizes,
    });
    // Z.ai returns either a URL or base64 — handle both.
    const data = (res as unknown as { data?: Array<{ url?: string; b64_json?: string }> }).data ?? [];
    const first = data[0];
    if (!first) return null;
    if (first.url) return first.url;
    if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
    return null;
  } catch {
    return null;
  }
}

function pickZaiSize(w: number, h: number): "1024x1024" | "1024x1792" | "1792x1024" {
  if (h > w * 1.3) return "1024x1792";
  if (w > h * 1.3) return "1792x1024";
  return "1024x1024";
}

// ---------------------------------------------------------------------------
// 3. Z.ai image search — real photos / illustrations from the web
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
// 4. Combined generator used by the API route — caches to DB for reuse
// ---------------------------------------------------------------------------

export async function generateOrCacheImage(opts: GenerateImageOptions): Promise<GeneratedImage> {
  const prompt = opts.prompt.trim();
  // Always include a random seed unless explicitly provided. Pollinations caches
  // by URL — without a unique seed, repeat requests for the same prompt return
  // an empty body (the image has been "claimed" by the first request).
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);

  // Cache check — same prompt + size returns same URL (skip cache if no seed was
  // provided, because we want a fresh image each time)
  if (opts.seed !== undefined) {
    const cached = await db.asset.findFirst({
      where: { prompt, source: "generated", width: opts.width ?? 1024, height: opts.height ?? 1024 },
      orderBy: { createdAt: "desc" },
    });
    if (cached) {
      return {
        url: cached.url,
        source: "pollinations",
        width: cached.width ?? 1024,
        height: cached.height ?? 1024,
        prompt,
        cached: true,
      };
    }
  }

  // Pollinations URL — instant, image renders on-demand
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
