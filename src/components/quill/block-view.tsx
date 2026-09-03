"use client";
import { Block, PageContent } from "@/lib/blocks";
import { cn } from "@/lib/utils";
import { useState } from "react";

const ACTIVITY_COLORS = [
  { border: "border-emerald-500", bg: "bg-emerald-50", badge: "bg-emerald-500", title: "text-emerald-700" },
  { border: "border-pink-500", bg: "bg-pink-50", badge: "bg-pink-500", title: "text-pink-700" },
  { border: "border-blue-500", bg: "bg-blue-50", badge: "bg-blue-500", title: "text-blue-700" },
  { border: "border-violet-500", bg: "bg-violet-50", badge: "bg-violet-500", title: "text-violet-700" },
  { border: "border-orange-500", bg: "bg-orange-50", badge: "bg-orange-500", title: "text-orange-700" },
  { border: "border-teal-500", bg: "bg-teal-50", badge: "bg-teal-500", title: "text-teal-700" },
];
function activityColor(i: number) { return ACTIVITY_COLORS[i % ACTIVITY_COLORS.length]; }
function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} if(a.length>1&&a.every((v,i)=>v===arr[i])){[a[0],a[1]]=[a[1],a[0]];} return a; }
const shuffleCache = new Map<string,string[]>();
function cachedShuffle(key:string,arr:string[]):string[]{if(shuffleCache.has(key))return shuffleCache.get(key)!;const s=shuffle(arr);shuffleCache.set(key,s);return s;}

function ImageBlockView({ block }: { block: Extract<Block, { type: "image" }> }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  return (
    <figure className="my-4 flex flex-col items-center">
      <div className="overflow-hidden rounded-xl bg-muted/10 shadow-sm ring-1 ring-border/20" style={{ maxWidth: "400px", width: "100%" }}>
        {!loaded && !error && (
          <div className="flex items-center justify-center bg-muted/10" style={{ minHeight: "180px" }}>
            <span className="text-2xl animate-pulse">🎨</span>
          </div>
        )}
        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 bg-amber-50 p-8" style={{ minHeight: "150px" }}>
            <span className="text-3xl">🎨</span>
            <span className="text-xs text-muted-foreground text-center">{block.alt?.slice(0, 80)}</span>
            <button onClick={() => { setError(false); setLoaded(false); setRetryKey(k => k + 1); }} className="rounded-full bg-blue-900 px-4 py-1 text-xs text-white hover:bg-blue-800">🔄 Try again</button>
          </div>
        ) : (
          <img
            key={`${block.url}-${retryKey}`}
            src={block.url}
            alt={block.alt}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            style={{ width: "100%", height: "auto", display: loaded ? "block" : "none" }}
            className="rounded-xl"
          />
        )}
      </div>
      {block.caption && <figcaption className="mt-2 text-center text-xs italic text-muted-foreground">{block.caption}</figcaption>}
    </figure>
  );
}

export function BlockView({ block, index, onCover = false }: { block: Block; index: number; onCover?: boolean }) {
  switch (block.type) {
    case "heading": {
      const size = block.level === 1 ? "text-2xl" : block.level === 2 ? "text-xl" : "text-lg";
      return <h2 className={cn("font-display font-bold border-b-2 pb-1", size, onCover ? "text-yellow-300 border-yellow-400/50" : "text-blue-950 border-amber-400/50")}>{block.text}</h2>;
    }
    case "subheading":
      return <h3 className={cn("font-display text-lg font-semibold", onCover ? "text-yellow-200" : "text-amber-700")}>{block.text}</h3>;
    case "paragraph":
      return <p className={cn("text-sm leading-relaxed", onCover ? "text-blue-100/90" : "text-foreground/90")}>{block.text}</p>;
    case "image":
      return <ImageBlockView block={block} />;
    case "image-caption":
      return <p className="text-center text-xs italic text-muted-foreground">{block.text}</p>;
    case "bulleted-list":
      return <ul className={cn("list-disc space-y-1 pl-5 text-sm", onCover && "text-blue-100 marker:text-yellow-400")}>{block.items.map((item,i)=><li key={i}>{item}</li>)}</ul>;
    case "numbered-list":
      return <ol className={cn("list-decimal space-y-1 pl-5 text-sm", onCover && "text-blue-100 marker:text-yellow-400")}>{block.items.map((item,i)=><li key={i}>{item}</li>)}</ol>;
    case "table":
      return (<div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr>{block.headers.map((h,i)=><th key={i} className="border border-blue-900 bg-blue-900 px-3 py-2 text-left font-semibold text-white">{h}</th>)}</tr></thead><tbody>{block.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j} className="border border-border/60 px-3 py-2">{cell}</td>)}</tr>)}</tbody></table></div>);
    case "word-bank":
      return (<div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-center"><span className="font-bold text-amber-800">📝 Word Bank:</span><br/><span className="font-bold text-amber-700 text-lg">{block.words.join("   |   ")}</span></div>);
    case "activity": case "fill-blanks": case "multiple-choice": case "matching": case "tracing": case "homework": {
      const c = activityColor(index);
      return (
        <div className={cn("rounded-xl border-2 p-4", c.border, c.bg)}>
          <div className={cn("mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-white font-bold", c.badge)}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/30 text-xs">{index+1}</span>
            <span className="font-display">{block.title}</span>
          </div>
          {"instructions" in block && block.instructions && <p className="mb-3 text-xs italic text-foreground/60">{block.instructions}</p>}
          {block.type === "fill-blanks" && block.wordBank && block.wordBank.length > 0 && (
            <div className="mb-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-2 text-center">
              <span className="font-bold text-amber-800 text-xs">📝 Word Bank: </span>
              <span className="font-bold text-amber-700">{block.wordBank.join("   |   ")}</span>
            </div>
          )}
          {block.type === "fill-blanks" && (
            <ol className="space-y-2">{block.sentences.map((s,i)=><li key={i} className="text-sm leading-relaxed"><span className="font-bold mr-1">{i+1}.</span>{s}</li>)}</ol>
          )}
          {block.type === "multiple-choice" && (
            <ol className="space-y-3">{block.questions.map((q,i)=>
              <li key={i}>
                <div className="text-sm font-medium mb-1">{i+1}. {q.question}</div>
                <div className="grid gap-1 pl-5 sm:grid-cols-2">
                  {q.options.map((opt,oi)=><div key={oi} className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-sm border", q.answerIndex===oi ? "bg-emerald-100 border-emerald-400 text-emerald-800" : "bg-white/50 border-gray-200")}><span className="font-bold">{String.fromCharCode(65+oi)}.</span><span>{opt}</span></div>)}
                </div>
              </li>
            )}</ol>
          )}
          {block.type === "matching" && (
            <div className="grid grid-cols-2 gap-4">
              <ol className="space-y-2">{block.pairs.map((p,i)=><li key={i} className="text-sm flex items-center gap-2"><span className="font-bold">{i+1}.</span><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-gray-200">{p.left}</span></li>)}</ol>
              <ol className="space-y-2">{cachedShuffle(block.id, block.pairs.map(p=>p.right)).map((r,i)=><li key={i} className="text-sm flex items-center gap-2"><span className="font-bold">{String.fromCharCode(65+i)}.</span><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-gray-200">{r}</span></li>)}</ol>
            </div>
          )}
          {block.type === "tracing" && (
            <div className="space-y-3">{block.items.map((item,i)=><div key={i} className="text-center"><div className="text-4xl text-muted/30 font-display">{item}</div><div className="text-muted/30 text-lg">__________________</div></div>)}</div>
          )}
          {(block.type === "activity" || block.type === "homework") && (
            <ol className="space-y-2">{block.items.map((item,i)=><li key={i} className="text-sm"><span className="font-bold mr-1">{i+1}.</span>{item}</li>)}</ol>
          )}
        </div>
      );
    }
    case "vocabulary":
      return (<table className="w-full border-collapse text-sm"><tbody>{block.words.map((w,i)=><tr key={i}><td className="border border-blue-900/40 bg-blue-50 px-3 py-2 font-bold text-blue-900">{w.word}</td><td className="border border-border/60 px-3 py-2">{w.meaning}</td></tr>)}</tbody></table>);
    case "quote":
      return (<blockquote className="border-l-4 border-amber-400 bg-amber-50 px-4 py-2 italic text-blue-900">&ldquo;{block.text}&rdquo;{block.attribution && <span className="block text-right text-xs text-muted-foreground">— {block.attribution}</span>}</blockquote>);
    case "tip":
      return (<div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3"><span className="font-bold text-amber-700">{block.title ?? "💡 Tip"}: </span><span className="text-sm">{block.text}</span></div>);
    case "divider":
      return <div className={cn("text-center", onCover ? "text-yellow-400" : "text-blue-950")}>• • • • • • • • • •</div>;
    case "spacer":
      return <div style={{ height: block.height ?? 40 }} />;
    default:
      return null;
  }
}

export function PagePreview({ page }: { page: PageContent }) {
  const isCover = page.type === "cover";
  const isSectionDivider = page.type === "section-divider";
  if (isCover) return (<div className="flex min-h-[500px] flex-col rounded-xl bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950 p-8 shadow-xl ring-1 ring-yellow-500/20"><div className="flex-1 space-y-2">{page.blocks.map((b,i)=><BlockView key={b.id ?? i} block={b} index={i} onCover={true} />)}</div></div>);
  if (isSectionDivider) return (<div className="flex min-h-[400px] flex-col rounded-xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 via-yellow-50/40 to-blue-100/30 p-8 shadow-sm">{page.blocks.map((b,i)=><BlockView key={b.id ?? i} block={b} index={i} />)}</div>);
  return (<div className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">{page.title && <h2 className="mb-3 font-display text-xl font-bold text-blue-950">{page.title}</h2>}<div className="space-y-3">{page.blocks.map((b,i)=><BlockView key={b.id ?? i} block={b} index={i} />)}</div></div>);
}
