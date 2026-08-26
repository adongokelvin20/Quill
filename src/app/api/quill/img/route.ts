// Quill — Image proxy.
// Streams a remote image through our own server so the browser sees a same-origin
// request. This avoids CORS / URL-length / content-disposition issues with
// Pollinations and other image APIs.
//
// GET /api/quill/img?url=<encoded URL>
// The image is cached on disk so repeat requests are instant.
//
// For Pollinations URLs that fail (empty bytes), falls back to Z.ai generation.

import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { generateImageViaZAI } from "@/lib/images";

export const runtime = "nodejs";
export const maxDuration = 60;
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

  // Handle data URLs directly (Z.ai returns these)
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

  // Try cache first
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
    // Cache miss — fetch below
  }

  // Extract the original prompt from Pollinations URLs for Z.ai fallback
  const isPollinations = url.includes("pollinations.ai");
  let fallbackPrompt: string | null = null;
  if (isPollinations) {
    try {
      const u = new URL(url);
      const promptPath = decodeURIComponent(u.pathname.replace("/prompt/", ""));
      // Remove the modifiers we added
      fallbackPrompt = promptPath.split(". high quality")[0].trim();
    } catch {
      fallbackPrompt = null;
    }
  }

  // Fetch the remote image — retry up to 3 times
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      let res: Response;
      try {
        res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          },
          redirect: "follow",
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        lastError = `Upstream error: ${res.status}`;
        continue;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) {
        lastError = "Empty image";
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      // Save to cache
      try {
        await fs.writeFile(cachePath, buf);
      } catch {
        // ignore cache write errors
      }

      const contentType = res.headers.get("content-type") ?? (ext === "png" ? "image/png" : "image/jpeg");
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(buf.length),
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Fallback: if Pollinations failed and we have a prompt, try Z.ai generation
  if (fallbackPrompt) {
    try {
      const zaiUrl = await generateImageViaZAI(fallbackPrompt);
      if (zaiUrl) {
        // If Z.ai returned a data URL, serve it directly
        if (zaiUrl.startsWith("data:")) {
          const match = /^data:(image\/[\w+]+);base64,(.+)$/.exec(zaiUrl);
          if (match) {
            const buf = Buffer.from(match[2], "base64");
            // Cache it
            try {
              await fs.writeFile(cachePath, buf);
            } catch {
              // ignore
            }
            return new Response(new Uint8Array(buf), {
              headers: {
                "Content-Type": match[1],
                "Content-Length": String(buf.length),
                "Cache-Control": "public, max-age=86400, immutable",
              },
            });
          }
        }
        // If Z.ai returned a URL, redirect to it via our proxy
        return new Response(null, {
          status: 302,
          headers: { Location: `/api/quill/img?url=${encodeURIComponent(zaiUrl)}` },
        });
      }
    } catch (err) {
      console.error("[quill] Z.ai fallback failed:", err);
    }
  }

  return new Response(`Proxy error: ${lastError ?? "unknown"}`, { status: 502 });
}
