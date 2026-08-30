// Quill — Web research utilities.
// Uses z-ai-web-dev-sdk to: (a) search the web, (b) fetch & extract page content.
// Results are cached in the ScrapedPage table so repeat queries are instant.

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

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  cached: boolean;
}

/**
 * Search the web for a query — used to discover authoritative sources before
 * scraping them. Returns up to `count` results.
 */
export async function webSearch(query: string, count = 6): Promise<SearchResult[]> {
  try {
    const res = await fetch("https://internal-api.z.ai/v1/web_search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer Z.ai",
        "X-Z-AI-From": "Z",
        "X-Chat-Id": "chat-3b1d9b2f-62ee-4783-913e-141c92180b84",
        "X-User-Id": "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0",
        "X-Token": process.env.ZAI_TOKEN ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE",
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

/**
 * Fetch a single URL and extract its main textual content.
 * Cached in the database — repeat fetches within 24h return the cache.
 */
export async function scrapeUrl(url: string): Promise<ScrapedContent | null> {
  const cached = await db.scrapedPage.findUnique({ where: { url } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < 24 * 60 * 60 * 1000) {
    return { url: cached.url, title: cached.title ?? "", content: cached.content, cached: true };
  }

  try {
    const res = await fetch("https://internal-api.z.ai/v1/web_reader", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer Z.ai",
        "X-Z-AI-From": "Z",
        "X-Chat-Id": "chat-3b1d9b2f-62ee-4783-913e-141c92180b84",
        "X-User-Id": "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0",
        "X-Token": process.env.ZAI_TOKEN ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE",
      },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const title = data.title ?? "";
    const content = (data.markdown ?? data.text ?? "").slice(0, 50000);
    if (!content.trim()) return null;

    await db.scrapedPage.upsert({
      where: { url },
      update: { title, content, fetchedAt: new Date() },
      create: { url, title, content },
    });
    return { url, title, content, cached: false };
  } catch {
    if (cached) return { url: cached.url, title: cached.title ?? "", content: cached.content, cached: true };
    return null;
  }
}

/**
 * Research a topic: search the web, then scrape the top 2 results.
 * Returns combined, truncated reference text for the content generator.
 */
export async function researchTopic(topic: string, level: string): Promise<string> {
  const query = `${topic} — Ghana basic school ${level} lesson notes`;
  const results = await webSearch(query, 4);
  if (results.length === 0) return "";

  const top = results.slice(0, 2);
  const scraped = (await Promise.all(top.map((r) => scrapeUrl(r.url)))).filter(
    (s): s is ScrapedContent => s !== null
  );

  if (scraped.length === 0) {
    // Fall back to snippets
    return results.map((r) => `- ${r.title}\n  ${r.snippet}`).join("\n\n");
  }

  return scraped
    .map((s) => `# ${s.title}\nSource: ${s.url}\n\n${s.content.slice(0, 8000)}`)
    .join("\n\n---\n\n");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
