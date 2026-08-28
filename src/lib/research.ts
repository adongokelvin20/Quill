// Quill — Web research utilities.
// Uses z-ai-web-dev-sdk to: (a) search the web, (b) fetch & extract page content.
// Results are cached in the ScrapedPage table so repeat queries are instant.

import ZAI from "z-ai-web-dev-sdk";
import "@/lib/zai-config"; // Ensure config file exists
import { db } from "@/lib/db";

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
    const zai = await ZAI.create();
    const res = await zai.web_search.create({ query, count });
    const items = (res as unknown as { items?: SearchResult[] }).items ?? [];
    return items.slice(0, count);
  } catch (err) {
    console.error("[quill] web_search failed:", err);
    return [];
  }
}

/**
 * Fetch a single URL and extract its main textual content.
 * Cached in the database — repeat fetches within 24h return the cache.
 */
export async function scrapeUrl(url: string): Promise<ScrapedContent | null> {
  // Cache check (younger than 24h)
  const cached = await db.scrapedPage.findUnique({ where: { url } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < 24 * 60 * 60 * 1000) {
    return {
      url: cached.url,
      title: cached.title ?? "",
      content: cached.content,
      cached: true,
    };
  }

  try {
    const zai = await ZAI.create();
    const res = await zai.web_reader.create({ url });
    const data = (res as unknown as { title?: string; html?: string; markdown?: string; text?: string }).data
      ?? (res as unknown as { title?: string; html?: string; markdown?: string; text?: string });

    const title = data.title ?? "";
    const content = (data.markdown ?? data.text ?? stripHtml(data.html ?? "")).slice(0, 50000);

    if (!content.trim()) return null;

    await db.scrapedPage.upsert({
      where: { url },
      update: { title, content, fetchedAt: new Date() },
      create: { url, title, content },
    });

    return { url, title, content, cached: false };
  } catch (err) {
    console.error("[quill] scrapeUrl failed:", err);
    // Fall back to cache even if stale
    if (cached) {
      return {
        url: cached.url,
        title: cached.title ?? "",
        content: cached.content,
        cached: true,
      };
    }
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
