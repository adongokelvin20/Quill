// Quill — Web research API.

import { NextRequest } from "next/server";
import { researchTopic, scrapeUrl, webSearch } from "@/lib/research";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { query, scrape, level } = body as { query?: string; scrape?: string; level?: string };

  if (scrape) {
    const result = await scrapeUrl(scrape);
    return Response.json({ result });
  }

  if (!query) return Response.json({ error: "query is required" }, { status: 400 });

  const results = await webSearch(query, 8);
  return Response.json({ results, query });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = url.searchParams.get("query");
  const full = url.searchParams.get("full") === "1";
  const level = url.searchParams.get("level") ?? "B3";

  if (!query) return Response.json({ error: "query is required" }, { status: 400 });

  if (full) {
    const content = await researchTopic(query, level);
    return Response.json({ query, content });
  }

  const results = await webSearch(query, 8);
  return Response.json({ query, results });
}
