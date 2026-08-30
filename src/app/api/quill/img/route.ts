// Quill — Image proxy.
// Fetches images from Pollinations and returns them.
// Falls back to SVG placeholder if fetch fails.

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400 });

  // Handle data URLs directly
  if (url.startsWith("data:")) {
    const match = /^data:(image\/[\w+]+);base64,(.+)$/.exec(url);
    if (!match) return new Response("Invalid data URL", { status: 400 });
    const buf = Buffer.from(match[2], "base64");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": match[1],
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  if (!/^https?:\/\//.test(url)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Try to fetch the image directly
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept": "image/*",
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0) {
        const contentType = res.headers.get("content-type") ?? "image/jpeg";
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, immutable",
          },
        });
      }
    }
  } catch {
    // Fall through to placeholder
  }

  // Fallback: SVG placeholder
  const isPollinations = url.includes("pollinations.ai");
  let prompt = "Illustration";
  if (isPollinations) {
    try {
      const u = new URL(url);
      prompt = decodeURIComponent(u.pathname.replace("/prompt/", "")).split(".")[0].slice(0, 60);
    } catch {}
  }

  const hash = prompt.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
  const hue = hash % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="hsl(${hue}, 70%, 85%)"/>
    <circle cx="200" cy="160" r="60" fill="hsl(${(hue + 180) % 360}, 70%, 50%)" opacity="0.3"/>
    <text x="200" y="280" font-family="sans-serif" font-size="14" fill="hsl(${hue}, 60%, 30%)" text-anchor="middle">${prompt}</text>
    <text x="200" y="310" font-family="sans-serif" font-size="11" fill="hsl(${hue}, 60%, 30%)" text-anchor="middle" opacity="0.5">Quill</text>
  </svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache",
    },
  });
}
