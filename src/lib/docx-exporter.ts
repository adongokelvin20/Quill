// Quill — DOCX exporter.
// Converts a Book's pages (block trees) into a kid-friendly A4 .docx file
// with embedded images, level-appropriate fonts, and section dividers.
//
// Output is saved under /home/z/my-project/download/quill/<book-id>.docx

import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
  convertInchesToTwip,
  convertMillimetersToTwip,
} from "docx";
import type { Block } from "@/lib/blocks";
import { LevelInfo } from "@/lib/curriculum";
import { Book, Page } from "@prisma/client";
import { PageContent } from "@/lib/blocks";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Font configuration — level-appropriate, web-safe so they render everywhere
// ---------------------------------------------------------------------------

const FONT_FAMILIES = {
  // Comic Sans MS is the most universally-available kid-friendly font on Word.
  kg: { heading: "Comic Sans MS", body: "Comic Sans MS" },
  lower: { heading: "Comic Sans MS", body: "Comic Sans MS" },
  mid: { heading: "Verdana", body: "Verdana" },
  upper: { heading: "Calibri", body: "Calibri" },
  jhs: { heading: "Calibri", body: "Calibri" },
};

function pickFonts(level: LevelInfo) {
  if (level.complexity <= 2) return FONT_FAMILIES.kg;
  if (level.complexity === 3) return FONT_FAMILIES.mid;
  if (level.complexity === 4) return FONT_FAMILIES.upper;
  return FONT_FAMILIES.jhs;
}

// ---------------------------------------------------------------------------
// Image fetching — convert URL to buffer (supports data URLs and remote URLs)
// ---------------------------------------------------------------------------

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    if (url.startsWith("data:")) {
      const match = /^data:(image\/[\w+]+);base64,(.+)$/.exec(url);
      if (!match) return null;
      return { buffer: Buffer.from(match[2], "base64"), mime: match[1] };
    }

    // Try fetching up to 3 times — Pollinations sometimes returns empty bytes on
    // the first request when the image is still being generated.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          },
        });
        clearTimeout(timeout);
        if (!res.ok) {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          return null;
        }
        const mime = res.headers.get("content-type") ?? "image/png";
        return { buffer: buf, mime };
      } catch {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        return null;
      }
    }
    return null;
  } catch (err) {
    console.error("[quill] fetchImageBuffer failed for", url.slice(0, 80), err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Block → Paragraph/Table converter
// ---------------------------------------------------------------------------

function colorForIndex(i: number): string {
  // Cycle through kid-friendly pastel colours for activity borders
  const palette = [
    "2E7D32", // green
    "C2185B", // pink
    "1565C0", // blue
    "6A1B9A", // purple
    "EF6C00", // orange
    "00838F", // teal
  ];
  return palette[i % palette.length];
}

async function blockToDocx(
  block: Block,
  level: LevelInfo,
  fonts: { heading: string; body: string }
): Promise<(Paragraph | Table)[]> {
  const body = fonts.body;
  const heading = fonts.heading;
  const bodySize = level.bodyFontSize * 2; // half-points (pt * 2)
  const headSize = level.headingFontSize * 2;

  switch (block.type) {
    case "heading": {
      const lvl = block.level ?? 1;
      const size = lvl === 1 ? headSize : Math.round(headSize * 0.8);
      return [
        new Paragraph({
          children: [new TextRun({ text: block.text, bold: true, size, font: heading, color: "0F766E" })],
          spacing: { before: 240, after: 120 },
          alignment: AlignmentType.LEFT,
        }),
      ];
    }

    case "subheading":
      return [
        new Paragraph({
          children: [new TextRun({ text: block.text, bold: true, size: Math.round(bodySize * 1.15), font: heading, color: "B45309" })],
          spacing: { before: 180, after: 80 },
        }),
      ];

    case "paragraph":
      return [
        new Paragraph({
          children: [new TextRun({ text: block.text, size: bodySize, font: body })],
          spacing: { after: 120 },
          alignment: AlignmentType.LEFT,
        }),
      ];

    case "image": {
      // Skip fetching images — just show the alt text as a placeholder.
      // Fetching images from Pollinations causes timeouts on Vercel.
      // Images are visible in the web editor; the DOCX just shows a description.
      return [
        new Paragraph({
          children: [new TextRun({ text: `[Illustration: ${block.alt}]`, italics: true, color: "888888", size: bodySize, font: body })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
          border: {
            top: { style: "single", size: 4, color: "CCCCCC" },
            bottom: { style: "single", size: 4, color: "CCCCCC" },
            left: { style: "single", size: 4, color: "CCCCCC" },
            right: { style: "single", size: 4, color: "CCCCCC" },
          },
        }),
      ];
    }

    case "image-caption":
      return [
        new Paragraph({
          children: [new TextRun({ text: block.text, italics: true, color: "666666", size: Math.round(bodySize * 0.85), font: body })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        }),
      ];

    case "bulleted-list":
      return block.items.map(
        (item) =>
          new Paragraph({
            children: [new TextRun({ text: item, size: bodySize, font: body })],
            bullet: { level: 0 },
            spacing: { after: 40 },
          })
      );

    case "numbered-list":
      return block.items.map(
        (item, i) =>
          new Paragraph({
            children: [new TextRun({ text: `${i + 1}. ${item}`, size: bodySize, font: body })],
            spacing: { after: 40 },
            indent: { left: convertInchesToTwip(0.25) },
          })
      );

    case "table": {
      const headerRow = new TableRow({
        children: block.headers.map(
          (h) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: bodySize, font: body })],
                  alignment: AlignmentType.CENTER,
                }),
              ],
              shading: { type: ShadingType.SOLID, color: "0F766E", fill: "0F766E" },
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
            })
        ),
        tableHeader: true,
      });
      const dataRows = block.rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: cell, size: bodySize, font: body })],
                    }),
                  ],
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                })
            ),
          })
      );
      return [
        new Table({
          rows: [headerRow, ...dataRows],
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: "single", size: 4, color: "0F766E" },
            bottom: { style: "single", size: 4, color: "0F766E" },
            left: { style: "single", size: 4, color: "0F766E" },
            right: { style: "single", size: 4, color: "0F766E" },
            insideHorizontal: { style: "single", size: 2, color: "CCCCCC" },
            insideVertical: { style: "single", size: 2, color: "CCCCCC" },
          },
        }),
        new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 120 } }),
      ];
    }

    case "activity":
    case "fill-blanks":
    case "multiple-choice":
    case "matching":
    case "tracing":
    case "homework": {
      const accentColor = "0F766E";
      const paras: (Paragraph | Table)[] = [];

      // Title bar
      paras.push(
        new Paragraph({
          children: [new TextRun({ text: block.title, bold: true, color: "FFFFFF", size: Math.round(bodySize * 1.1), font: heading })],
          shading: { type: ShadingType.SOLID, color: accentColor, fill: accentColor },
          spacing: { before: 180, after: 80 },
          border: {
            top: { style: "single", size: 8, color: accentColor },
            bottom: { style: "single", size: 8, color: accentColor },
            left: { style: "single", size: 8, color: accentColor },
            right: { style: "single", size: 8, color: accentColor },
          },
        })
      );

      // Instructions
      if ("instructions" in block && block.instructions) {
        paras.push(
          new Paragraph({
            children: [new TextRun({ text: block.instructions, italics: true, size: Math.round(bodySize * 0.95), font: body, color: "555555" })],
            spacing: { after: 80 },
          })
        );
      }

      // Word bank (for fill-blanks)
      if (block.type === "fill-blanks" && block.wordBank && block.wordBank.length > 0) {
        paras.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Word Bank: ", bold: true, size: bodySize, font: body }),
              ...block.wordBank.flatMap((w, i) => [
                new TextRun({ text: w, bold: true, size: bodySize, font: body, color: "B45309" }),
                new TextRun({ text: i < block.wordBank!.length - 1 ? "  |  " : "", size: bodySize, font: body }),
              ]),
            ],
            shading: { type: ShadingType.SOLID, color: "FEF3C7", fill: "FEF3C7" },
            spacing: { before: 60, after: 100 },
            border: {
              top: { style: "single", size: 4, color: "B45309" },
              bottom: { style: "single", size: 4, color: "B45309" },
              left: { style: "single", size: 4, color: "B45309" },
              right: { style: "single", size: 4, color: "B45309" },
            },
          })
        );
      }

      // Items
      if (block.type === "fill-blanks") {
        block.sentences.forEach((s, i) => {
          paras.push(
            new Paragraph({
              children: [new TextRun({ text: `${i + 1}.  ${s}`, size: bodySize, font: body })],
              spacing: { after: 100 },
              indent: { left: convertInchesToTwip(0.2) },
            })
          );
        });
      } else if (block.type === "multiple-choice") {
        block.questions.forEach((q, i) => {
          paras.push(
            new Paragraph({
              children: [new TextRun({ text: `${i + 1}. ${q.question}`, bold: true, size: bodySize, font: body })],
              spacing: { before: 80, after: 40 },
            })
          );
          q.options.forEach((opt, oi) => {
            const letter = String.fromCharCode(65 + oi);
            paras.push(
              new Paragraph({
                children: [new TextRun({ text: `     ${letter}.  ${opt}`, size: bodySize, font: body })],
                spacing: { after: 20 },
                indent: { left: convertInchesToTwip(0.4) },
              })
            );
          });
        });
      } else if (block.type === "matching") {
        // Render matching as a 2-column table (left scrambled, right in order)
        const left = block.pairs.map((p) => p.left);
        // Shuffle right column
        const right = shuffle(block.pairs.map((p) => p.right));
        const rows = left.map((l, i) => new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${l}`, size: bodySize, font: body })] })],
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: `${String.fromCharCode(65 + i)}. ${right[i]}`, size: bodySize, font: body })] })],
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
            }),
          ],
        }));
        paras.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: "single", size: 4, color: "0F766E" },
              bottom: { style: "single", size: 4, color: "0F766E" },
              left: { style: "single", size: 4, color: "0F766E" },
              right: { style: "single", size: 4, color: "0F766E" },
              insideHorizontal: { style: "single", size: 2, color: "CCCCCC" },
              insideVertical: { style: "single", size: 2, color: "CCCCCC" },
            },
          }),
          new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 80 } })
        );
      } else if (block.type === "tracing") {
        // Big letters with empty tracing space below
        block.items.forEach((item) => {
          paras.push(
            new Paragraph({
              children: [new TextRun({ text: item, bold: true, size: bodySize * 2, font: heading, color: "CCCCCC" })],
              spacing: { before: 120, after: 40 },
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [new TextRun({ text: "_______________________", size: bodySize, font: body, color: "999999" })],
              spacing: { after: 120 },
              alignment: AlignmentType.CENTER,
            })
          );
        });
      } else if (block.type === "homework" || block.type === "activity") {
        block.items.forEach((item, i) => {
          paras.push(
            new Paragraph({
              children: [new TextRun({ text: `${i + 1}. ${item}`, size: bodySize, font: body })],
              spacing: { after: 80 },
              indent: { left: convertInchesToTwip(0.2) },
            })
          );
        });
      }
      return paras;
    }

    case "word-bank":
      return [
        new Paragraph({
          children: [
            ...(block.title ? [new TextRun({ text: `${block.title}: `, bold: true, size: bodySize, font: body })] : []),
            new TextRun({ text: block.words.join("   |   "), bold: true, color: "B45309", size: bodySize, font: body }),
          ],
          shading: { type: ShadingType.SOLID, color: "FEF3C7", fill: "FEF3C7" },
          spacing: { before: 80, after: 120 },
        }),
      ];

    case "vocabulary": {
      const rows = block.words.map(
        (w) =>
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: w.word, bold: true, color: "0F766E", size: bodySize, font: body })] })],
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                width: { size: 30, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: w.meaning, size: bodySize, font: body })] })],
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                width: { size: 70, type: WidthType.PERCENTAGE },
              }),
            ],
          })
      );
      return [
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: "single", size: 4, color: "0F766E" },
            bottom: { style: "single", size: 4, color: "0F766E" },
            left: { style: "single", size: 4, color: "0F766E" },
            right: { style: "single", size: 4, color: "0F766E" },
            insideHorizontal: { style: "single", size: 2, color: "CCCCCC" },
            insideVertical: { style: "single", size: 2, color: "CCCCCC" },
          },
        }),
        new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 120 } }),
      ];
    }

    case "quote":
      return [
        new Paragraph({
          children: [
            new TextRun({ text: `"${block.text}"`, italics: true, color: "0F766E", size: Math.round(bodySize * 1.1), font: body }),
            ...(block.attribution ? [new TextRun({ text: `  — ${block.attribution}`, italics: true, color: "666666", size: bodySize, font: body })] : []),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: 160 },
          border: {
            left: { style: "single", size: 24, color: "F59E0B", space: 12 },
          },
          indent: { left: convertInchesToTwip(0.4), right: convertInchesToTwip(0.4) },
        }),
      ];

    case "tip":
      return [
        new Paragraph({
          children: [
            new TextRun({ text: block.title ? `${block.title}: ` : "Tip: ", bold: true, color: "B45309", size: bodySize, font: body }),
            new TextRun({ text: block.text, size: bodySize, font: body }),
          ],
          shading: { type: ShadingType.SOLID, color: "FEF3C7", fill: "FEF3C7" },
          spacing: { before: 80, after: 120 },
          border: {
            top: { style: "single", size: 6, color: "F59E0B" },
            bottom: { style: "single", size: 6, color: "F59E0B" },
            left: { style: "single", size: 6, color: "F59E0B" },
            right: { style: "single", size: 6, color: "F59E0B" },
          },
        }),
      ];

    case "divider":
      return [
        new Paragraph({
          children: [new TextRun({ text: "• • • • • • • • • • • • • • • • • • • •", color: "0F766E", size: bodySize, font: body })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
        }),
      ];

    case "spacer":
      return [
        new Paragraph({
          children: [new TextRun({ text: "" })],
          spacing: { before: block.height ?? 200, after: block.height ?? 200 },
        }),
      ];

    default:
      return [];
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Make sure it's not the same as input
  if (a.every((v, i) => v === arr[i]) && a.length > 1) {
    [a[0], a[1]] = [a[1], a[0]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Page → docx sections (page break between pages)
// ---------------------------------------------------------------------------

async function pageToDocxChildren(
  page: Page,
  level: LevelInfo,
  fonts: { heading: string; body: string },
  isCover: boolean
): Promise<(Paragraph | Table)[]> {
  let content: PageContent;
  try {
    content = JSON.parse(page.content) as PageContent;
  } catch {
    content = { type: "lesson", blocks: [] };
  }
  const out: (Paragraph | Table)[] = [];

  // Page title (unless cover, which has its own heading in blocks)
  if (!isCover && content.title) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: content.title, bold: true, size: level.headingFontSize * 2, font: fonts.heading, color: "0F766E" })],
        spacing: { before: 240, after: 120 },
        border: { bottom: { style: "single", size: 8, color: "F59E0B", space: 4 } },
      })
    );
  }

  for (const block of content.blocks ?? []) {
    const children = await blockToDocx(block, level, fonts);
    out.push(...children);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Main export entry point
// ---------------------------------------------------------------------------

export async function exportBookToDocx(bookId: string): Promise<{ filePath: string; fileSize: number }> {
  const book = await db.book.findUnique({
    where: { id: bookId },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!book) throw new Error("Book not found");

  const { getLevel } = await import("@/lib/curriculum");
  const level = getLevel(book.level as never);
  const fonts = pickFonts(level);

  // Cover page section
  const coverPage = book.pages.find((p) => p.type === "cover");
  const otherPages = book.pages.filter((p) => p.type !== "cover");

  const sections = [];

  if (coverPage) {
    const coverChildren = await pageToDocxChildren(coverPage, level, fonts, true);
    sections.push({
      properties: {
        page: {
          size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) }, // A4
          margin: {
            top: convertMillimetersToTwip(15),
            bottom: convertMillimetersToTwip(15),
            left: convertMillimetersToTwip(18),
            right: convertMillimetersToTwip(18),
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "Quill", bold: true, color: "0F766E", font: fonts.heading, size: 18 }),
                new TextRun({ text: "  •  Bringing intelligent education to life", color: "999999", font: fonts.body, size: 16 }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `${book.title} • ${level.fullLabel} • Term ${book.term}`, color: "999999", font: fonts.body, size: 16 }),
                new TextRun({ text: "\t\tPage ", color: "999999", font: fonts.body, size: 16 }),
                new TextRun({ children: [PageNumber.CURRENT], color: "999999", font: fonts.body, size: 16 }),
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: convertMillimetersToTwip(174) }],
            }),
          ],
        }),
      },
      children: coverChildren,
    });
  }

  // All other pages — continuous section with page breaks between pages
  const allChildren: (Paragraph | Table)[] = [];
  for (let i = 0; i < otherPages.length; i++) {
    const page = otherPages[i];
    if (i > 0) {
      // Page break before each subsequent page
      allChildren.push(
        new Paragraph({
          children: [new TextRun({ text: "", break: 1 })],
          pageBreakBefore: true,
        })
      );
    }
    const children = await pageToDocxChildren(page, level, fonts, false);
    allChildren.push(...children);
  }

  sections.push({
    properties: {
      page: {
        size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
        margin: {
          top: convertMillimetersToTwip(15),
          bottom: convertMillimetersToTwip(15),
          left: convertMillimetersToTwip(18),
          right: convertMillimetersToTwip(18),
        },
      },
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: "Quill", bold: true, color: "0F766E", font: fonts.heading, size: 18 }),
              new TextRun({ text: "  •  Bringing intelligent education to life", color: "999999", font: fonts.body, size: 16 }),
            ],
            alignment: AlignmentType.RIGHT,
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: `${book.title} • ${level.fullLabel} • Term ${book.term}`, color: "999999", font: fonts.body, size: 16 }),
              new TextRun({ text: "\t\tPage ", color: "999999", font: fonts.body, size: 16 }),
              new TextRun({ children: [PageNumber.CURRENT], color: "999999", font: fonts.body, size: 16 }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: convertMillimetersToTwip(174) }],
          }),
        ],
      }),
    },
    children: allChildren,
  });

  const doc = new Document({
    creator: "Quill",
    title: book.title,
    description: book.description ?? "",
    sections: sections as never,
    styles: {
      default: {
        document: {
          run: { font: fonts.body, size: level.bodyFontSize * 2 },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  const dir = path.join("/tmp", "quill-exports");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${bookId}.docx`);
  await fs.writeFile(filePath, buffer);

  // Record the export
  await db.bookExport.create({
    data: {
      bookId,
      format: "docx",
      filePath,
      fileSize: buffer.length,
    },
  });

  return { filePath, fileSize: buffer.length };
}
