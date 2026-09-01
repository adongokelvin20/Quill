// Quill — Web research utilities.
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

let zaiInstance: any = null;
async function getZai() {
  if (!zaiInstance) zaiInstance = await ZAI.create();
  return zaiInstance;
}

export interface SearchResult { title: string; url: string; snippet: string; }
export async function webSearch(query: string, count = 4): Promise<SearchResult[]> {
  try {
    const zai = await getZai();
    const res = await zai.web_search.create({ query, count });
    return ((res as any).items ?? []).slice(0, count);
  } catch { return []; }
}

export interface ScrapedContent { url: string; title: string; content: string; cached: boolean; }
export async function scrapeUrl(url: string): Promise<ScrapedContent | null> {
  const cached = await db.scrapedPage.findUnique({ where: { url } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < 86400000) {
    return { url: cached.url, title: cached.title ?? "", content: cached.content, cached: true };
  }
  try {
    const zai = await getZai();
    const res = await zai.web_reader.create({ url });
    const d = (res as any).data ?? res;
    const title = d.title ?? "";
    const content = (d.markdown ?? d.text ?? "").slice(0, 50000);
    if (!content.trim()) return null;
    await db.scrapedPage.upsert({ where: { url }, update: { title, content, fetchedAt: new Date() }, create: { url, title, content } });
    return { url, title, content, cached: false };
  } catch {
    if (cached) return { url: cached.url, title: cached.title ?? "", content: cached.content, cached: true };
    return null;
  }
}

export async function researchTopic(topic: string, level: string): Promise<string> {
  const results = await webSearch(`${topic} Ghana basic school ${level}`, 4);
  if (!results.length) return "";
  const scraped = await Promise.all(results.slice(0, 2).map(r => scrapeUrl(r.url)));
  const valid = scraped.filter((s): s is ScrapedContent => s !== null);
  if (!valid.length) return results.map(r => `- ${r.title}\n  ${r.snippet}`).join("\n\n");
  return valid.map(s => `# ${s.title}\n${s.content.slice(0, 8000)}`).join("\n\n---\n\n");
}
