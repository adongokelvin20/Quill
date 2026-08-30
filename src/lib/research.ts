// Quill — Web research utilities.
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

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(query: string, count = 4): Promise<SearchResult[]> {
  try {
    const res = await fetch(`${ZAI_BASE}/web_search`, {
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

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  cached: boolean;
}

export async function scrapeUrl(url: string): Promise<ScrapedContent | null> {
  const cached = await db.scrapedPage.findUnique({ where: { url } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < 24 * 60 * 60 * 1000) {
    return { url: cached.url, title: cached.title ?? "", content: cached.content, cached: true };
  }

  try {
    const res = await fetch(`${ZAI_BASE}/web_reader`, {
      method: "POST",
      headers: ZAI_HEADERS,
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

export async function researchTopic(topic: string, level: string): Promise<string> {
  const results = await webSearch(`${topic} Ghana basic school ${level}`, 4);
  if (results.length === 0) return "";
  const scraped = await Promise.all(results.slice(0, 2).map((r) => scrapeUrl(r.url)));
  const valid = scraped.filter((s): s is ScrapedContent => s !== null);
  if (valid.length === 0) return results.map((r) => `- ${r.title}\n  ${r.snippet}`).join("\n\n");
  return valid.map((s) => `# ${s.title}\n${s.content.slice(0, 8000)}`).join("\n\n---\n\n");
}
