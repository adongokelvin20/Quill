"use client";

import { Block, PageContent } from "@/lib/blocks";
import { cn } from "@/lib/utils";
import { Image as ImageIcon, Loader2, Plus } from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Block preview renderer — read-only view used in the editor canvas.
// Each block type renders as a styled component that mirrors what the DOCX
// exporter will produce.
// ---------------------------------------------------------------------------

const ACTIVITY_COLORS = [
  { border: "border-emerald-400", bg: "bg-emerald-50", text: "text-emerald-700", badge: "bg-emerald-500" },
  { border: "border-pink-400", bg: "bg-pink-50", text: "text-pink-700", badge: "bg-pink-500" },
  { border: "border-blue-400", bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-500" },
  { border: "border-violet-400", bg: "bg-violet-50", text: "text-violet-700", badge: "bg-violet-500" },
  { border: "border-orange-400", bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-500" },
  { border: "border-teal-400", bg: "bg-teal-50", text: "text-teal-700", badge: "bg-teal-500" },
];

function activityColor(i: number) {
  return ACTIVITY_COLORS[i % ACTIVITY_COLORS.length];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a.length > 1 && a.every((v, i) => v === arr[i])) {
    [a[0], a[1]] = [a[1], a[0]];
  }
  return a;
}

// Tiny in-memory cache so each block keeps its shuffled order across renders.
const shuffleCache = new Map<string, string[]>();
function cachedShuffle(key: string, arr: string[]): string[] {
  if (shuffleCache.has(key)) return shuffleCache.get(key)!;
  const s = shuffle(arr);
  shuffleCache.set(key, s);
  return s;
}

// ---------------------------------------------------------------------------
// Image block — separate component so we can use hooks safely
// ---------------------------------------------------------------------------

function ImageBlockView({ block }: { block: Extract<Block, { type: "image" }> }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Route external image URLs through our proxy so the browser sees a same-origin
  // request. This avoids CORS / Content-Disposition / URL-length issues with
  // Pollinations and other image APIs.
  const src =
    block.url.startsWith("data:") || block.url.startsWith("/")
      ? block.url
      : `/api/quill/img?url=${encodeURIComponent(block.url)}`;

  return (
    <figure
      className={cn(
        "my-2 flex flex-col items-center",
        block.align === "left" && "items-start",
        block.align === "right" && "items-end"
      )}
    >
      <div className="relative max-w-full overflow-hidden rounded-lg bg-muted/40">
        {!loaded && !error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/60">
            <Loader2 className="h-6 w-6 animate-spin text-quill" />
          </div>
        )}
        {error ? (
          <div className="flex aspect-square w-64 flex-col items-center justify-center gap-2 bg-muted/40 p-4 text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs">Image is being generated&hellip;</span>
            <button
              type="button"
              onClick={() => {
                setError(false);
                setLoaded(false);
                setRetryKey((k) => k + 1);
              }}
              className="rounded bg-quill/10 px-2 py-1 text-xs text-quill hover:bg-quill/20"
            >
              Retry
            </button>
          </div>
        ) : (
          <img
            key={`${src}-${retryKey}`}
            src={src}
            alt={block.alt}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            style={{ width: block.width ? `${block.width}px` : "100%", maxWidth: "100%", height: "auto" }}
            className="rounded-lg"
          />
        )}
      </div>
      {block.caption && (
        <figcaption className="mt-1 text-xs italic text-muted-foreground">{block.caption}</figcaption>
      )}
    </figure>
  );
}

export function BlockView({ block, index }: { block: Block; index: number }) {
  switch (block.type) {
    case "heading": {
      const size = block.level === 1 ? "text-2xl" : block.level === 2 ? "text-xl" : "text-lg";
      return (
        <h2 className={cn("font-display font-bold text-quill border-b-2 border-amber-400/50 pb-1", size)}>
          {block.text}
        </h2>
      );
    }

    case "subheading":
      return <h3 className="font-display text-lg font-semibold text-amber-700">{block.text}</h3>;

    case "paragraph":
      return <p className="text-sm leading-relaxed text-foreground/90">{block.text}</p>;

    case "image":
      return <ImageBlockView key={block.id} block={block} />;

    case "image-caption":
      return <p className="text-center text-xs italic text-muted-foreground">{block.text}</p>;

    case "bulleted-list":
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );

    case "numbered-list":
      return (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );

    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="border border-quill bg-quill px-3 py-2 text-left font-semibold text-quill-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="border border-border/60 px-3 py-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "word-bank":
      return (
        <div className="rounded-md border-2 border-amber-400 bg-amber-soft/50 p-3">
          {block.title && <span className="font-semibold text-amber-800">{block.title}: </span>}
          <span className="font-bold text-amber-700">{block.words.join("   |   ")}</span>
        </div>
      );

    case "activity":
    case "fill-blanks":
    case "multiple-choice":
    case "matching":
    case "tracing":
    case "homework": {
      const c = activityColor(index);
      return (
        <div className={cn("rounded-lg border-2", c.border, c.bg, "p-3")}>
          {/* Title bar */}
          <div className={cn("mb-2 flex items-center gap-2 rounded-md px-2 py-1 text-white", c.badge)}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/30 text-xs font-bold">
              {index + 1}
            </span>
            <span className="font-display font-bold">{block.title}</span>
          </div>
          {/* Instructions */}
          {"instructions" in block && block.instructions && (
            <p className="mb-2 text-xs italic text-foreground/70">{block.instructions}</p>
          )}

          {/* Word bank */}
          {block.type === "fill-blanks" && block.wordBank && block.wordBank.length > 0 && (
            <div className="mb-2 rounded-md border border-amber-300 bg-amber-soft/60 p-2 text-sm">
              <span className="font-semibold">Word Bank: </span>
              <span className="font-bold text-amber-700">{block.wordBank.join("   |   ")}</span>
            </div>
          )}

          {/* Items */}
          {block.type === "fill-blanks" && (
            <ol className="space-y-2">
              {block.sentences.map((s, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{i + 1}.</span> {s}
                </li>
              ))}
            </ol>
          )}

          {block.type === "multiple-choice" && (
            <ol className="space-y-3">
              {block.questions.map((q, i) => (
                <li key={i}>
                  <div className="text-sm font-medium">
                    {i + 1}. {q.question}
                  </div>
                  <div className="mt-1 grid gap-1 pl-5 sm:grid-cols-2">
                    {q.options.map((opt, oi) => {
                      const letter = String.fromCharCode(65 + oi);
                      const isCorrect = q.answerIndex === oi;
                      return (
                        <div
                          key={oi}
                          className={cn(
                            "flex items-center gap-1.5 rounded px-2 py-0.5 text-sm",
                            isCorrect && "bg-emerald-100 text-emerald-800"
                          )}
                        >
                          <span className="font-semibold">{letter}.</span>
                          <span>{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {block.type === "matching" && (
            <div className="grid grid-cols-2 gap-3">
              <ol className="space-y-1">
                {block.pairs.map((p, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{i + 1}.</span> {p.left}
                  </li>
                ))}
              </ol>
              <ol className="space-y-1">
                {cachedShuffle(block.id, block.pairs.map((p) => p.right)).map((r, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{String.fromCharCode(65 + i)}.</span> {r}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {block.type === "tracing" && (
            <div className="space-y-2">
              {block.items.map((item, i) => (
                <div key={i} className="text-center">
                  <div className="font-display text-3xl text-muted-foreground/40">{item}</div>
                  <div className="text-muted-foreground/40">________________________</div>
                </div>
              ))}
            </div>
          )}

          {(block.type === "activity" || block.type === "homework") && (
            <ol className="space-y-1">
              {block.items.map((item, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{i + 1}.</span> {item}
                </li>
              ))}
            </ol>
          )}
        </div>
      );
    }

    case "vocabulary":
      return (
        <table className="w-full border-collapse text-sm">
          <tbody>
            {block.words.map((w, i) => (
              <tr key={i}>
                <td className="border border-quill/40 bg-quill/5 px-3 py-1.5 font-bold text-quill">{w.word}</td>
                <td className="border border-border/60 px-3 py-1.5">{w.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

    case "quote":
      return (
        <blockquote className="border-l-4 border-amber-400 bg-amber-soft/30 px-4 py-2 italic text-quill">
          &ldquo;{block.text}&rdquo;
          {block.attribution && (
            <span className="block text-right text-xs text-muted-foreground">— {block.attribution}</span>
          )}
        </blockquote>
      );

    case "tip":
      return (
        <div className="rounded-md border-2 border-amber-400 bg-amber-soft/40 p-3">
          <span className="font-bold text-amber-700">{block.title ?? "Tip"}: </span>
          <span className="text-sm">{block.text}</span>
        </div>
      );

    case "divider":
      return <div className="text-center text-quill">• • • • • • • • • •</div>;

    case "spacer":
      return <div style={{ height: block.height ?? 40 }} />;

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Page preview renderer
// ---------------------------------------------------------------------------

export function PagePreview({ page }: { page: PageContent }) {
  const isCover = page.type === "cover";
  const isToc = page.type === "toc";

  if (isCover) {
    return (
      <div className="flex min-h-[420px] flex-col rounded-lg border-2 border-dashed border-amber-300 bg-gradient-to-br from-quill/10 via-amber-soft/60 to-amber-200/30 p-8">
        {page.blocks.map((b, i) => (
          <BlockView key={b.id ?? i} block={b} index={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-white p-6 shadow-sm">
      {page.title && (
        <h2 className="mb-3 font-display text-xl font-bold text-quill">{page.title}</h2>
      )}
      <div className="space-y-3">
        {page.blocks.map((b, i) => (
          <BlockView key={b.id ?? i} block={b} index={i} />
        ))}
      </div>
    </div>
  );
}
