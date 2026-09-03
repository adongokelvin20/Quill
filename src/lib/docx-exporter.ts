// Quill — DOCX exporter.
// Converts block trees to A4 .docx with embedded images.

import {
  AlignmentType, Document, Footer, Header, HeadingLevel, ImageRun,
  PageNumber, Packer, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, WidthType, convertInchesToTwip, convertMillimetersToTwip,
} from "docx";
import type { Block } from "@/lib/blocks";
import { LevelInfo } from "@/lib/curriculum";
import { PageContent } from "@/lib/blocks";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";

const FONT_FAMILIES = {
  kg: { heading: "Comic Sans MS", body: "Comic Sans MS" },
  lower: { heading: "Comic Sans MS", body: "Comic Sans MS" },
  mid: { heading: "Verdana", body: "Verdana" },
  upper: { heading: "Calibri", body: "Calibri" },
  jhs: { heading: "Calibri", body: "Calibri" },
};

function pickFonts(level: LevelInfo) {
  if (level.complexity <= 2) return FONT_FAMILIES.kg;
  if (level.complexity === 3) return FONT_FAMILIES.mid;
  return FONT_FAMILIES.upper;
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    if (url.startsWith("data:")) {
      const match = /^data:(image\/[\w+]+);base64,(.+)$/.exec(url);
      if (!match) return null;
      return { buffer: Buffer.from(match[2], "base64"), mime: match[1] };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/*",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    return { buffer: buf, mime: res.headers.get("content-type") ?? "image/jpeg" };
  } catch (err) {
    console.error("[quill] fetchImageBuffer failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function blockToDocx(block: Block, level: LevelInfo, fonts: { heading: string; body: string }): Promise<(Paragraph | Table)[]> {
  const body = fonts.body;
  const heading = fonts.heading;
  const bodySize = level.bodyFontSize * 2;
  const headSize = level.headingFontSize * 2;

  switch (block.type) {
    case "heading": {
      const lvl = block.level ?? 1;
      const size = lvl === 1 ? headSize : Math.round(headSize * 0.8);
      return [new Paragraph({ children: [new TextRun({ text: block.text, bold: true, size, font: heading, color: "0F766E" })], spacing: { before: 240, after: 120 } })];
    }
    case "subheading":
      return [new Paragraph({ children: [new TextRun({ text: block.text, bold: true, size: Math.round(bodySize * 1.15), font: heading, color: "B45309" })], spacing: { before: 180, after: 80 } })];
    case "paragraph":
      return [new Paragraph({ children: [new TextRun({ text: block.text, size: bodySize, font: body })], spacing: { after: 120 } })];
    case "image": {
      const img = await fetchImageBuffer(block.url);
      if (img) {
        const ext = img.mime.includes("jpeg") || img.mime.includes("jpg") ? "jpg" : "png";
        const widthPx = 400;
        const widthInches = widthPx / 96;
        const imageRun = new ImageRun({ data: img.buffer, transformation: { width: widthInches * 96, height: widthInches * 96 }, type: ext as "jpg" | "png" });
        const paras: (Paragraph | Table)[] = [
          new Paragraph({ children: [imageRun], alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 } }),
        ];
        if (block.caption) {
          paras.push(new Paragraph({ children: [new TextRun({ text: block.caption, italics: true, color: "666666", size: Math.round(bodySize * 0.85), font: body })], alignment: AlignmentType.CENTER, spacing: { after: 120 } }));
        }
        return paras;
      }
      return [new Paragraph({ children: [new TextRun({ text: `[Image: ${block.alt}]`, italics: true, color: "999999", size: bodySize, font: body })], alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 } })];
    }
    case "bulleted-list":
      return block.items.map((item: string) => new Paragraph({ children: [new TextRun({ text: item, size: bodySize, font: body })], bullet: { level: 0 }, spacing: { after: 40 } }));
    case "numbered-list":
      return block.items.map((item: string, i: number) => new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${item}`, size: bodySize, font: body })], spacing: { after: 40 }, indent: { left: convertInchesToTwip(0.25) } }));
    case "table": {
      const headerRow = new TableRow({ children: block.headers.map((h: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: bodySize, font: body })], alignment: AlignmentType.CENTER })], shading: { type: ShadingType.SOLID, color: "0F766E", fill: "0F766E" }, margins: { top: 80, bottom: 80, left: 100, right: 100 } })), tableHeader: true });
      const dataRows = block.rows.map((row: string[]) => new TableRow({ children: row.map((cell: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell, size: bodySize, font: body })] })], margins: { top: 60, bottom: 60, left: 100, right: 100 } })) }));
      return [new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } }), new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 120 } })];
    }
    case "word-bank":
      return [new Paragraph({ children: [new TextRun({ text: `Word Bank: ${block.words.join("  |  ")}`, bold: true, color: "B45309", size: bodySize, font: body })], shading: { type: ShadingType.SOLID, color: "FEF3C7", fill: "FEF3C7" }, spacing: { before: 80, after: 120 } })];
    case "vocabulary":
      return [new Table({ rows: block.words.map((w: { word: string; meaning: string }) => new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: w.word, bold: true, color: "0F766E", size: bodySize, font: body })] })], margins: { top: 60, bottom: 60, left: 100, right: 100 } }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: w.meaning, size: bodySize, font: body })] })], margins: { top: 60, bottom: 60, left: 100, right: 100 } })] })), width: { size: 100, type: WidthType.PERCENTAGE } }), new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 120 } })];
    case "quote":
      return [new Paragraph({ children: [new TextRun({ text: `"${block.text}"`, italics: true, color: "0F766E", size: Math.round(bodySize * 1.1), font: body }), ...(block.attribution ? [new TextRun({ text: `  — ${block.attribution}`, italics: true, color: "666666", size: bodySize, font: body })] : [])], alignment: AlignmentType.CENTER, spacing: { before: 160, after: 160 } })];
    case "tip":
      return [new Paragraph({ children: [new TextRun({ text: `${block.title ?? "Tip"}: ${block.text}`, size: bodySize, font: body })], shading: { type: ShadingType.SOLID, color: "FEF3C7", fill: "FEF3C7" }, spacing: { before: 80, after: 120 } })];
    case "divider":
      return [new Paragraph({ children: [new TextRun({ text: "• • • • • • • • • •", color: "0F766E", size: bodySize, font: body })], alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 } })];
    case "spacer":
      return [new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: block.height ?? 200, after: block.height ?? 200 } })];
    default:
      return [];
  }
}

async function pageToDocxChildren(page: any, level: LevelInfo, fonts: { heading: string; body: string }, isCover: boolean): Promise<(Paragraph | Table)[]> {
  let content: PageContent;
  try { content = JSON.parse(page.content) as PageContent; } catch { content = { type: "lesson", blocks: [] }; }
  const out: (Paragraph | Table)[] = [];
  if (!isCover && content.title) {
    out.push(new Paragraph({ children: [new TextRun({ text: content.title, bold: true, size: level.headingFontSize * 2, font: fonts.heading, color: "0F766E" })], spacing: { before: 240, after: 120 } }));
  }
  for (const block of content.blocks ?? []) {
    const children = await blockToDocx(block, level, fonts);
    out.push(...children);
  }
  return out;
}

export async function buildDocForBook(bookId: string): Promise<Document> {
  const book = await db.book.findUnique({ where: { id: bookId }, include: { pages: { orderBy: { pageNumber: "asc" } } } });
  if (!book) throw new Error("Book not found");
  const { getLevel } = await import("@/lib/curriculum");
  const level = getLevel(book.level as never);
  const fonts = pickFonts(level);
  const coverPage = book.pages.find((p: any) => p.type === "cover");
  const otherPages = book.pages.filter((p: any) => p.type !== "cover");
  const sections = [];
  if (coverPage) {
    const coverChildren = await pageToDocxChildren(coverPage, level, fonts, true);
    sections.push({ properties: { page: { size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) }, margin: { top: convertMillimetersToTwip(15), bottom: convertMillimetersToTwip(15), left: convertMillimetersToTwip(18), right: convertMillimetersToTwip(18) } } }, children: coverChildren });
  }
  const allChildren: (Paragraph | Table)[] = [];
  for (let i = 0; i < otherPages.length; i++) {
    const page = otherPages[i];
    if (i > 0) { allChildren.push(new Paragraph({ children: [new TextRun({ text: "", break: 1 })], pageBreakBefore: true })); }
    const children = await pageToDocxChildren(page, level, fonts, false);
    allChildren.push(...children);
  }
  sections.push({ properties: { page: { size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) }, margin: { top: convertMillimetersToTwip(15), bottom: convertMillimetersToTwip(15), left: convertMillimetersToTwip(18), right: convertMillimetersToTwip(18) } } }, children: allChildren });
  return new Document({ creator: "Quill", title: book.title, description: book.description ?? "", sections: sections as never, styles: { default: { document: { run: { font: fonts.body, size: level.bodyFontSize * 2 } } } } });
}

export async function exportBookToDocx(bookId: string): Promise<{ filePath: string; fileSize: number }> {
  const doc = await buildDocForBook(bookId);
  const buffer = await Packer.toBuffer(doc);
  const dir = path.join("/tmp", "quill-exports");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${bookId}.docx`);
  await fs.writeFile(filePath, buffer);
  try { await db.bookExport.create({ data: { bookId, format: "docx", filePath, fileSize: buffer.length } }); } catch {}
  return { filePath, fileSize: buffer.length };
}
