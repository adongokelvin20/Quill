// Quill — Image proxy.
// FAST and NEVER returns 502.
//
// Strategy:
//   1. Check disk cache (instant)
//   2. Race Z.ai generation vs Pollinations fetch with a 20s timeout
//   3. If both fail, return a colorful SVG placeholder immediately
//
// Total max time: ~20 seconds. No retries that block the response.

import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { generateImageViaZAI } from "@/lib/images";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const CACHE_DIR = "/home/z/my-project/download/quill-img-cache";

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function cacheKey(url: string): string {
  return crypto.createHash("sha1").update(url).digest("hex");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400 });

  // Handle data URLs directly (Z.ai returns these — instant, no network)
  if (url.startsWith("data:")) {
    const match = /^data:(image\/[\w+]+);base64,(.+)$/.exec(url);
    if (!match) return new Response("Invalid data URL", { status: 400 });
    const buf = Buffer.from(match[2], "base64");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": match[1],
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  // Only allow http(s) URLs
  if (!/^https?:\/\//.test(url)) {
    return new Response("Forbidden", { status: 403 });
  }

  await ensureCacheDir();
  const key = cacheKey(url);
  const ext = url.includes("png") ? "png" : "jpg";
  const cachePath = path.join(CACHE_DIR, `${key}.${ext}`);

  // 1. Try cache first (instant)
  try {
    const stat = await fs.stat(cachePath);
    if (stat.size > 0) {
      const buf = await fs.readFile(cachePath);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": ext === "png" ? "image/png" : "image/jpeg",
          "Content-Length": String(buf.length),
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }
  } catch {
    // Cache miss — continue
  }

  // Extract the original prompt from Pollinations URLs for Z.ai fallback
  const isPollinations = url.includes("pollinations.ai");
  let fallbackPrompt: string | null = null;
  if (isPollinations) {
    try {
      const u = new URL(url);
      const promptPath = decodeURIComponent(u.pathname.replace("/prompt/", ""));
      fallbackPrompt = promptPath.split(". high quality")[0].trim();
    } catch {
      fallbackPrompt = null;
    }
  }

  // 2. Race Z.ai generation vs Pollinations fetch with a 20s timeout
  //    Whichever returns a valid image first wins.
  const TIMEOUT_MS = 20000;

  const pollinationsPromise = (async (): Promise<Buffer | null> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
        redirect: "follow",
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) return null;
      return buf;
    } catch {
      return null;
    }
  })();

  const zaiPromise = (async (): Promise<Buffer | null> => {
    if (!fallbackPrompt) return null;
    try {
      const zaiUrl = await generateImageViaZAI(fallbackPrompt, { retries: 0 });
      if (!zaiUrl) return null;
      if (zaiUrl.startsWith("data:")) {
        const match = /^data:(image\/[\w+]+);base64,(.+)$/.exec(zaiUrl);
        if (match) return Buffer.from(match[2], "base64");
      }
      // If Z.ai returned a URL, fetch it
      const res = await fetch(zaiUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length > 0 ? buf : null;
    } catch {
      return null;
    }
  })();

  // Wait for either to succeed, with overall timeout
  const overallTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS + 5000));

  try {
    const result = await Promise.race([
      Promise.any([pollinationsPromise, zaiPromise]),
      overallTimeout,
    ]);

    if (result && result.length > 0) {
      // Cache it
      try {
        await fs.writeFile(cachePath, result);
      } catch {
        // ignore cache write errors
      }
      return new Response(new Uint8Array(result), {
        headers: {
          "Content-Type": ext === "png" ? "image/png" : "image/jpeg",
          "Content-Length": String(result.length),
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }
  } catch {
    // All promises rejected — fall through to placeholder
  }

  // 3. Last resort: SVG placeholder — NEVER return 502
  const placeholderSvg = generatePlaceholderSvg(fallbackPrompt || "Illustration");
  const svgBuf = Buffer.from(placeholderSvg, "utf-8");
  return new Response(new Uint8Array(svgBuf), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Length": String(svgBuf.length),
      "Cache-Control": "no-cache",
    },
  });
}

// Generate a colorful placeholder SVG with the prompt text
function generatePlaceholderSvg(prompt: string): string {
  const displayPrompt = prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
  const hash = prompt.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
  const hue = hash % 360;
  const bg = `hsl(${hue}, 70%, 85%)`;
  const fg = `hsl(${hue}, 60%, 30%)`;
  const accent = `hsl(${(hue + 180) % 360}, 70%, 50%)`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="${bg}"/>
    <circle cx="256" cy="200" r="80" fill="${accent}" opacity="0.3"/>
    <circle cx="256" cy="200" r="60" fill="${fg}" opacity="0.5"/>
    <rect x="156" y="300" width="200" height="20" rx="10" fill="${fg}" opacity="0.3"/>
    <rect x="176" y="340" width="160" height="14" rx="7" fill="${fg}" opacity="0.2"/>
    <text x="256" y="420" font-family="sans-serif" font-size="16" fill="${fg}" text-anchor="middle" opacity="0.7">${escapeXml(displayPrompt)}</text>
    <text x="256" y="470" font-family="sans-serif" font-size="12" fill="${fg}" text-anchor="middle" opacity="0.5">Quill</text>
  </svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
