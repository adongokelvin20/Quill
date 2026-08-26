// Quill — Migrate existing pages with PLACEHOLDER image URLs to real Pollinations URLs.

import { db } from "../src/lib/db";

async function main() {
  const pages = await db.page.findMany();
  let fixed = 0;
  for (const page of pages) {
    try {
      const content = JSON.parse(page.content);
      if (!content || !Array.isArray(content.blocks)) continue;
      let changed = false;
      const newBlocks = content.blocks.map((b: any) => {
        if (b.type === "image" && (!b.url || b.url === "PLACEHOLDER")) {
          const alt = b.alt?.trim() || "children's book illustration";
          const enhanced = `${alt}. high quality children's book illustration, clean bold outlines, vibrant saturated colors, friendly cheerful mood, professional vector art, no text, no watermark, no signature`;
          const encoded = encodeURIComponent(enhanced.slice(0, 1800));
          const seed = Math.floor(Math.random() * 1_000_000);
          const params = new URLSearchParams({
            width: "1024",
            height: "1024",
            model: "flux",
            nologo: "true",
            seed: String(seed),
          });
          const url = `https://image.pollinations.ai/prompt/${encoded}?${params.toString()}`;
          changed = true;
          return { ...b, url, source: "generated" };
        }
        // Also fix existing Pollinations URLs that don't have a seed
        if (b.type === "image" && b.url?.includes("pollinations.ai") && !b.url.includes("seed=")) {
          const seed = Math.floor(Math.random() * 1_000_000);
          const separator = b.url.includes("?") ? "&" : "?";
          const url = `${b.url}${separator}seed=${seed}`;
          changed = true;
          return { ...b, url };
        }
        return b;
      });
      if (changed) {
        await db.page.update({
          where: { id: page.id },
          data: { content: JSON.stringify({ ...content, blocks: newBlocks }) },
        });
        fixed++;
        console.log(`Fixed page ${page.id}`);
      }
    } catch {
      // Skip pages with invalid JSON
    }
  }
  console.log(`Done. Fixed ${fixed} of ${pages.length} pages.`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
