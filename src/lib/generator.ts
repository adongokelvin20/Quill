// Quill — Book content generator.
// Uses Google Gemini API (publicly accessible) with Z.ai SDK fallback.

import { callLLM } from "@/lib/llm";
import { Block, PageContent, PageType, makeId } from "@/lib/blocks";
import { LevelInfo, SubjectInfo } from "@/lib/curriculum";

export type GenerationMode = "full" | "condensed" | "compact";

export interface GenerateBookInput {
  level: LevelInfo;
  subject: SubjectInfo;
  term: 1 | 2 | 3;
  topics: string[];
  lessons?: number;
  language?: string;
  research?: boolean;
  targetPages?: number;
  useSections?: boolean;
}

export interface GenerateBookProgress {
  type: "page-start" | "page-done" | "page-error" | "book-meta" | "complete" | "log";
  pageIndex?: number;
  pageType?: PageType;
  pageTitle?: string;
  page?: PageContent;
  message?: string;
  book?: { title: string; subtitle: string; description: string };
}

const FIXED_PAGES = 4;
const GLOBAL_MODIFIERS = "high quality children's book illustration, clean bold outlines, vibrant saturated colors, friendly cheerful mood, professional vector art, no text, no watermark";

function buildSystemPrompt(level: LevelInfo, subject: SubjectInfo): string {
  const isKG = level.complexity <= 1;
  return `You are Quill, an expert Ghana Education Service curriculum author. Generate one page as JSON.

interface PageContent { type: string; title?: string; blocks: Block[]; }
Block types: heading{text}, subheading{text}, paragraph{text}, image{url:"PLACEHOLDER",alt}, bulleted-list{items[]}, numbered-list{items[]}, fill-blanks{title,instructions,sentences[],wordBank?[]}, multiple-choice{title,instructions,questions[{question,options[],answerIndex?}]}, matching{title,instructions,pairs[{left,right}]}, vocabulary{title,words[{word,meaning}]}, tip{title?,text}, homework{title,instructions,items[]}, divider{}, spacer{height?}

AUDIENCE: ${level.fullLabel} (ages ${level.ageRange})
${isKG ? "KG: very short sentences (3-7 words). Picture-heavy." : "Short sentences. Include 1 image block."}
Use Ghanaian names, Cedi (GH₵), local foods, festivals.
OUTPUT: Only valid JSON. No markdown fences.`;
}

function buildCoverPrompt(input: GenerateBookInput): string {
  return `Generate a COVER page for ${input.level.fullLabel} ${input.subject.name}, Term ${input.term}.
Include: heading (catchy title), subheading ("Term ${input.term} • Quill Series"), paragraph (description), image block, paragraph ("Name: ___________  Class: ___________"), divider, paragraph ("Quill — Bringing intelligent education to life").
Return JSON with type: "cover".`;
}

function buildTocPrompt(topics: string[]): string {
  return `Generate a TABLE OF CONTENTS page. List ${topics.length} lessons: ${topics.map((t, i) => `${i+1}. ${t}`).join("; ")}. Use numbered-list block. Return JSON with type: "toc".`;
}

function buildLessonPrompt(input: GenerateBookInput, topic: string, num: number): string {
  return `Generate a LESSON page for Lesson ${num}: ${topic}. Include: heading, learning objectives (3 bullets), intro paragraph, main content (2 subheadings), image block, vocabulary (3-5 terms), tip. Return JSON with type: "lesson".`;
}

function buildExercisePrompt(topic: string, num: number): string {
  return `Generate an EXERCISE page for Lesson ${num}: ${topic}. Include: "Name: ___ Date: ___" paragraph, fill-blanks (4 sentences, word bank), multiple-choice (3 questions, 4 options, answerIndex), matching (4 pairs). Return JSON with type: "exercise".`;
}

function buildHomeworkPrompt(topic: string, num: number): string {
  return `Generate a HOMEWORK page for Lesson ${num}: ${topic}. Include: "Name: ___ Date: ___" paragraph, homework block (4 tasks), fill-blanks (3 sentences). Return JSON with type: "homework".`;
}

function buildGlossaryPrompt(subject: SubjectInfo): string {
  return `Generate a GLOSSARY page for ${subject.name}. 10 terms with meanings. Use vocabulary block. Return JSON with type: "glossary".`;
}

function buildClosingPrompt(): string {
  return `Generate a CLOSING page. Include: heading "Well Done!", encouraging paragraph, quote block, tip block, image block. Return JSON with type: "closing".`;
}

function parseJson(raw: string): PageContent | null {
  if (!raw) return null;
  let txt = raw.trim();
  if (txt.startsWith("```")) txt = txt.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(txt); } catch {}
  const s = txt.indexOf("{"), e = txt.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(txt.slice(s, e + 1)); } catch {} }
  return null;
}

function sanitise(page: PageContent): PageContent {
  const blocks = (page.blocks ?? []).map((b: any) => b.id ? b : { ...b, id: makeId() }) as Block[];
  const resolved = blocks.map((b: any) => {
    if (b.type === "image" && (!b.url || b.url === "PLACEHOLDER")) {
      const alt = b.alt?.trim() || "children's book illustration";
      const seed = Math.floor(Math.random() * 1000000);
      const enc = encodeURIComponent(`${alt}. ${GLOBAL_MODIFIERS}`.slice(0, 1800));
      return { ...b, url: `https://image.pollinations.ai/prompt/${enc}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`, source: "generated" };
    }
    return b;
  }) as Block[];
  return { ...page, blocks: resolved };
}

async function genPage(system: string, user: string, level: LevelInfo): Promise<PageContent> {
  const tryOnce = async () => {
    try {
      const raw = await callLLM(
        [{ role: "system", content: system }, { role: "user", content: user }],
        2000,
        level.complexity <= 2 ? 0.8 : 0.6
      );
      if (!raw || raw.trim().length < 10) return null;
      return parseJson(raw);
    } catch (e) {
      console.error("[quill] LLM error:", e instanceof Error ? e.message : String(e));
      return null;
    }
  };
  let page = await tryOnce();
  if (!page) page = await tryOnce();
  if (!page) {
    page = { type: "lesson", title: "Lesson", blocks: [
      { id: makeId(), type: "heading", text: "Lesson" },
      { id: makeId(), type: "paragraph", text: "Content could not be generated. Please edit this page manually." },
    ]};
  }
  return sanitise(page);
}

export async function genMeta(input: GenerateBookInput) {
  try {
    const raw = await callLLM(
      [{ role: "system", content: "Output JSON only." }, { role: "user", content: `Title for ${input.level.fullLabel} ${input.subject.name} Term ${input.term}. Return {"title":"","subtitle":"","description":""}` }],
      300, 0.7
    );
    const p = parseJson(raw) as any;
    if (p?.title) return { title: p.title, subtitle: p.subtitle ?? `Term ${input.term} • Quill Series`, description: p.description ?? "" };
  } catch (e) { console.error("[quill] meta error:", e); }
  return { title: `${input.subject.name} for ${input.level.fullLabel}`, subtitle: `Term ${input.term} • Quill Series`, description: "" };
}

export async function* generateBook(input: GenerateBookInput, opts: { skipPages?: number } = {}): AsyncGenerator<GenerateBookProgress> {
  const skip = opts.skipPages ?? 0;
  const topics = input.topics.slice(0, input.lessons ?? input.topics.length);
  const system = buildSystemPrompt(input.level, input.subject);
  let pi = 0;
  const gen = () => pi >= skip;

  if (skip === 0) { const m = await genMeta(input); yield { type: "book-meta", book: m }; }

  if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "cover", pageTitle: "Cover" }; const p = await genPage(system, buildCoverPrompt(input), input.level); yield { type: "page-done", pageIndex: pi, pageType: "cover", pageTitle: "Cover", page: p }; } pi++;
  if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "toc", pageTitle: "TOC" }; const p = await genPage(system, buildTocPrompt(topics), input.level); yield { type: "page-done", pageIndex: pi, pageType: "toc", pageTitle: "TOC", page: p }; } pi++;

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i], n = i + 1;
    if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "lesson", pageTitle: `Lesson ${n}: ${t}` }; const p = await genPage(system, buildLessonPrompt(input, t, n), input.level); yield { type: "page-done", pageIndex: pi, pageType: "lesson", pageTitle: `Lesson ${n}: ${t}`, page: p }; } pi++;
    if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "exercise", pageTitle: `Exercise ${n}` }; const p = await genPage(system, buildExercisePrompt(t, n), input.level); yield { type: "page-done", pageIndex: pi, pageType: "exercise", pageTitle: `Exercise ${n}`, page: p }; } pi++;
    if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "homework", pageTitle: `Homework ${n}` }; const p = await genPage(system, buildHomeworkPrompt(t, n), input.level); yield { type: "page-done", pageIndex: pi, pageType: "homework", pageTitle: `Homework ${n}`, page: p }; } pi++;
  }

  if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "glossary", pageTitle: "Glossary" }; const p = await genPage(system, buildGlossaryPrompt(input.subject), input.level); yield { type: "page-done", pageIndex: pi, pageType: "glossary", pageTitle: "Glossary", page: p }; } pi++;
  if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "closing", pageTitle: "Well Done!" }; const p = await genPage(system, buildClosingPrompt(), input.level); yield { type: "page-done", pageIndex: pi, pageType: "closing", pageTitle: "Well Done!", page: p }; } pi++;

  yield { type: "complete", message: `Generated ${pi} pages.` };
}

export function planCondensing(targetPages: number, topics: string[]) {
  const a = Math.max(0, targetPages - FIXED_PAGES);
  if (a >= 3 * topics.length) return { mode: "full" as GenerationMode, lessonsToGenerate: topics.length, topicsToUse: topics, pagesPerLesson: 3, estimatedTotalPages: FIXED_PAGES + 3 * topics.length, description: "Full" };
  if (a >= 2 * topics.length) return { mode: "condensed" as GenerationMode, lessonsToGenerate: topics.length, topicsToUse: topics, pagesPerLesson: 2, estimatedTotalPages: FIXED_PAGES + 2 * topics.length, description: "Condensed" };
  return { mode: "compact" as GenerationMode, lessonsToGenerate: Math.max(1, a), topicsToUse: topics.slice(0, Math.max(1, a)), pagesPerLesson: 1, estimatedTotalPages: FIXED_PAGES + Math.max(1, a), description: "Compact" };
}
