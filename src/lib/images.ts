// Quill — Image utilities.
// Uses z-ai-web-dev-sdk with .z-ai-config file (committed to repo).

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

const MODIFIERS = "high quality children's book illustration, clean bold outlines, vibrant saturated colors, friendly cheerful mood, professional vector art, no text, no watermark";

let zaiInstance: any = null;
async function getZai() {
  if (!zaiInstance) { zaiInstance = await ZAI.create(); }
  return zaiInstance;
}

export async function generateImageViaZAI(prompt: string): Promise<string | null> {
  try {
    const zai = await getZai();
    const res = await zai.images.generations.create({ prompt: `${prompt}. ${MODIFIERS}`, size: "1024x1024" });
    const d = (res as any).data?.[0];
    if (d?.url) return d.url;
    if (d?.base64) return `data:image/jpeg;base64,${d.base64}`;
    if (d?.b64_json) return `data:image/jpeg;base64,${d.b64_json}`;
    return null;
  } catch (e) { console.error("[quill] image gen error:", e); return null; }
}

export interface SearchedImage { url: string; alt: string; caption?: string; }
export async function searchImages(query: string, count = 6): Promise<SearchedImage[]> {
  try {
    const zai = await getZai();
    const res = await zai.images.search.create({ query, count });
    return ((res as any).items ?? []).slice(0, count);
  } catch { return []; }
}

export interface GeneratedImage { url: string; source: string; width: number; height: number; prompt: string; cached: boolean; }
export interface GenerateImageOptions { prompt: string; width?: number; height?: number; model?: string; seed?: number; noLogo?: boolean; enhance?: boolean; }

export function pollinationsImageUrl(opts: GenerateImageOptions): string {
  const { prompt, width = 1024, height = 1024, model = "flux", seed } = opts;
  const enc = encodeURIComponent(`${prompt}. ${MODIFIERS}`.slice(0, 1800));
  const params = new URLSearchParams({ width: String(width), height: String(height), model, nologo: "true" });
  if (seed !== undefined) params.set("seed", String(seed));
  return `https://image.pollinations.ai/prompt/${enc}?${params}`;
}

export async function generateOrCacheImage(opts: GenerateImageOptions): Promise<GeneratedImage> {
  const prompt = opts.prompt.trim();
  const url = await generateImageViaZAI(prompt);
  if (url) return { url, source: "zai-gen", width: 1024, height: 1024, prompt, cached: false };
  const seed = opts.seed ?? Math.floor(Math.random() * 1000000);
  return { url: pollinationsImageUrl({ ...opts, seed }), source: "pollinations", width: 1024, height: 1024, prompt, cached: false };
}

export async function generateHighQualityImage(prompt: string): Promise<{ url: string; source: "zai-gen" | "pollinations" }> {
  const url = await generateImageViaZAI(prompt);
  if (url) return { url, source: "zai-gen" };
  return { url: pollinationsImageUrl({ prompt }), source: "pollinations" };
}
