// Quill — Book content generator.
// Uses direct fetch() to Z.ai API — no SDK, no config file, works everywhere.

import { Block, PageContent, PageType, makeId } from "@/lib/blocks";
import { LevelInfo, SubjectInfo } from "@/lib/curriculum";

// Z.ai API credentials and helper
const ZAI_BASE = "https://internal-api.z.ai/v1";
const ZAI_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE";
const ZAI_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Authorization": "Bearer Z.ai",
  "X-Z-AI-From": "Z",
  "X-Chat-Id": "chat-3b1d9b2f-62ee-4783-913e-141c92180b84",
  "X-User-Id": "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0",
  "X-Token": ZAI_TOKEN,
};

async function callLLM(messages: { role: string; content: string }[], maxTokens = 2000, temperature = 0.7): Promise<string> {
  const res = await fetch(`${ZAI_BASE}/chat/completions`, {
    method: "POST",
    headers: ZAI_HEADERS,
    body: JSON.stringify({ messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Z.ai API ${res.status}: ${text.slice(0, 100)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

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

const GLOBAL_ILLUSTRATION_MODIFIERS =
  "high quality children's book illustration, clean bold outlines, vibrant saturated colors, friendly cheerful mood, professional vector art, well composed single focal point, neat and organized layout, no text, no watermark, no signature, no border";


function buildSystemPrompt(level: LevelInfo, subject: SubjectInfo): string {
  const isKG = level.complexity <= 1;
  const isLower = level.complexity <= 2;
  const isUpper = level.complexity >= 4;

  return `You are Quill, an expert Ghana Education Service (GES) curriculum author. You write teaching and learning materials for Ghanaian basic schools.

TASK: Generate one page of an educational book as a JSON object.

interface PageContent {
  type: "cover" | "toc" | "lesson" | "exercise" | "homework" | "glossary" | "closing";
  title?: string;
  blocks: Block[];
}

Valid block types:
- heading { type, text, level?: 1|2|3 }
- subheading { type, text }
- paragraph { type, text }
- image { type, url: "PLACEHOLDER", alt: string, caption?: string }
- bulleted-list { type, items: string[] }
- numbered-list { type, items: string[] }
- table { type, headers: string[], rows: string[][] }
- activity { type, title, instructions, items: string[] }
- fill-blanks { type, title, instructions, sentences: string[], wordBank?: string[] }
- multiple-choice { type, title, instructions, questions: [{question, options, answerIndex?}] }
- matching { type, title, instructions, pairs: [{left, right}] }
- word-bank { type, title?, words: string[] }
- vocabulary { type, title, words: [{word, meaning}] }
- divider { type }
- spacer { type, height?: number }
- quote { type, text, attribution? }
- tip { type, title?, text }
- homework { type, title, instructions, items: string[] }

For images: url must be "PLACEHOLDER". Write detailed alt text.

AUDIENCE: ${level.fullLabel} (ages ${level.ageRange})
${isKG ? "KG: very short sentences (3-7 words). Picture-heavy. Include 1-2 image blocks." : ""}
${isLower ? "Lower basic: short sentences (5-10 words). Include 1 image block." : ""}
${isUpper ? "Upper basic/JHS: paragraphs of 3-5 sentences." : ""}

CULTURAL CONTEXT: Use Ghanaian names, Cedi (GH₵), local foods, festivals.

OUTPUT: Only valid JSON. No markdown fences. Start with { and end with }.`;
}

function buildCoverPrompt(input: GenerateBookInput): string {
  return `Generate a COVER page for a ${input.level.fullLabel} ${input.subject.name} textbook, Term ${input.term}.

Include: heading (catchy title), subheading ("Term ${input.term} • Quill Series"), paragraph (short description), image block, paragraph ("Name: ___________  Class: ___________"), divider, paragraph ("Quill — Bringing intelligent education to life").

Return JSON with type: "cover".`;
}

function buildTocPrompt(input: GenerateBookInput, topics: string[]): string {
  return `Generate a TABLE OF CONTENTS page. List these ${topics.length} lessons:
${topics.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Use a numbered-list block. Return JSON with type: "toc".`;
}

function buildLessonPrompt(input: GenerateBookInput, topic: string, lessonNum: number): string {
  return `Generate a LESSON page for Lesson ${lessonNum}: ${topic}.

Include:
1. Heading: "Lesson ${lessonNum}: ${topic}"
2. Learning objectives (3-4 bullets)
3. Introduction paragraph
4. Main content (2-3 subheadings with paragraphs)
5. One image block (alt describing a relevant illustration)
6. Key Vocabulary (3-5 terms with meanings)
7. Teacher's Tip

Return JSON with type: "lesson".`;
}

function buildExercisePrompt(input: GenerateBookInput, topic: string, lessonNum: number): string {
  return `Generate an EXERCISE page for Lesson ${lessonNum}: ${topic}.

Include:
- "Name: ___________  Date: ___________" paragraph
- One fill-blanks block (4-5 sentences, with word bank)
- One multiple-choice block (3-4 questions, 4 options each, include answerIndex)
- One matching block (4-5 pairs)

Return JSON with type: "exercise".`;
}

function buildHomeworkPrompt(input: GenerateBookInput, topic: string, lessonNum: number): string {
  return `Generate a HOMEWORK page for Lesson ${lessonNum}: ${topic}.

Include:
- "Name: ___________  Date: ___________" paragraph
- One homework block (4-5 short tasks)
- One fill-blanks block (3-4 sentences)

Return JSON with type: "homework".`;
}

function buildGlossaryPrompt(input: GenerateBookInput): string {
  return `Generate a GLOSSARY page for ${input.subject.name}. List 10 key terms with one-sentence meanings. Use a vocabulary block. Return JSON with type: "glossary".`;
}

function buildClosingPrompt(input: GenerateBookInput): string {
  return `Generate a CLOSING page. Include:
- Heading: "Well Done!"
- Encouraging paragraph
- A quote block with an inspirational quote about learning
- A tip block: "Keep practising every day!"
- One image block (alt: "celebration scene with children cheering")

Return JSON with type: "closing".`;
}

async function generatePageJson(systemPrompt: string, userPrompt: string, level: LevelInfo): Promise<PageContent> {
  const tryOnce = async (): Promise<PageContent | null> => {
    try {
      const raw = await callLLM(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        2000,
        level.complexity <= 2 ? 0.8 : 0.6
      );
      if (!raw || raw.trim().length < 10) return null;
      return parsePageJson(raw);
    } catch (err) {
      console.error("[quill] LLM error:", err instanceof Error ? err.message : String(err));
      console.error("[quill] LLM error stack:", err instanceof Error ? err.stack : "no stack");
      return null;
    }
  };

  let page = await tryOnce();
  if (!page) {
    try {
      const raw = await callLLM(
        [
          { role: "system", content: "Output valid JSON only. No markdown." },
          { role: "user", content: userPrompt.slice(0, 500) },
        ],
        1500,
        0.3
      );
      page = parsePageJson(raw);
    } catch {}
  }
  if (!page) {
    page = {
      type: "lesson",
      title: "Lesson",
      blocks: [
        { id: makeId(), type: "heading", text: "Lesson" },
        { id: makeId(), type: "paragraph", text: "Content could not be generated. Please edit this page manually." },
      ],
    };
  }
  return sanitisePage(page);
}

function parsePageJson(raw: string): PageContent | null {
  if (!raw) return null;
  let txt = raw.trim();
  if (txt.startsWith("```")) {
    txt = txt.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  }
  try {
    return JSON.parse(txt) as PageContent;
  } catch {
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(txt.slice(start, end + 1)) as PageContent;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sanitisePage(page: PageContent): PageContent {
  const blocks = (page.blocks ?? []).map((b) =>
    (b as Block).id ? (b as Block) : { ...(b as Block), id: makeId() }
  ) as Block[];

  // Replace PLACEHOLDER image URLs with instant Pollinations URLs
  const resolvedBlocks = blocks.map((b) => {
    if (b.type === "image" && (!b.url || b.url === "PLACEHOLDER")) {
      const alt = b.alt?.trim() || "children's book illustration";
      const seed = Math.floor(Math.random() * 1_000_000);
      const encoded = encodeURIComponent(`${alt}. ${GLOBAL_ILLUSTRATION_MODIFIERS}`.slice(0, 1800));
      const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;
      return { ...b, url, source: "generated" as const };
    }
    return b;
  }) as Block[];

  return { ...page, blocks: resolvedBlocks };
}

export async function generateBookMeta(input: GenerateBookInput): Promise<{ title: string; subtitle: string; description: string }> {
  try {
    const raw = await callLLM(
      [
        { role: "system", content: "Output a JSON object only." },
        { role: "user", content: `Suggest a title, subtitle, and description for a ${input.level.fullLabel} ${input.subject.name} textbook, Term ${input.term}. Return JSON: { "title": string, "subtitle": string, "description": string }` },
      ],
      300,
      0.7
    );
    let txt = raw.trim();
    if (txt.startsWith("```")) txt = txt.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(txt.slice(start, end + 1));
      if (parsed.title) return { title: parsed.title, subtitle: parsed.subtitle ?? `Term ${input.term} • Quill Series`, description: parsed.description ?? "" };
    }
  } catch (err) {
    console.error("[quill] book meta error:", err);
  }
  return {
    title: `${input.subject.name} for ${input.level.fullLabel}`,
    subtitle: `Term ${input.term} • Quill Series`,
    description: `A complete ${input.subject.name} textbook for ${input.level.fullLabel}.`,
  };
}

export async function* generateBook(
  input: GenerateBookInput,
  opts: { research?: boolean; signal?: AbortSignal; skipPages?: number } = {}
): AsyncGenerator<GenerateBookProgress> {
  const skipPages = opts.skipPages ?? 0;
  const topics = input.topics.slice(0, input.lessons ?? input.topics.length);
  const systemPrompt = buildSystemPrompt(input.level, input.subject);

  let pageIndex = 0;
  const shouldGen = () => pageIndex >= skipPages;

  if (skipPages === 0) {
    const meta = await generateBookMeta(input);
    yield { type: "book-meta", book: meta };
  }

  // Cover
  if (shouldGen()) {
    yield { type: "page-start", pageIndex, pageType: "cover", pageTitle: "Cover" };
    const cover = await generatePageJson(systemPrompt, buildCoverPrompt(input), input.level);
    yield { type: "page-done", pageIndex, pageType: "cover", pageTitle: "Cover", page: cover };
  }
  pageIndex++;

  // TOC
  if (shouldGen()) {
    yield { type: "page-start", pageIndex, pageType: "toc", pageTitle: "Table of Contents" };
    const toc = await generatePageJson(systemPrompt, buildTocPrompt(input, topics), input.level);
    yield { type: "page-done", pageIndex, pageType: "toc", pageTitle: "Table of Contents", page: toc };
  }
  pageIndex++;

  // Lessons
  for (let i = 0; i < topics.length; i++) {
    if (opts.signal?.aborted) return;
    const topic = topics[i];
    const lessonNum = i + 1;

    if (shouldGen()) {
      yield { type: "page-start", pageIndex, pageType: "lesson", pageTitle: `Lesson ${lessonNum}: ${topic}` };
      const lesson = await generatePageJson(systemPrompt, buildLessonPrompt(input, topic, lessonNum), input.level);
      yield { type: "page-done", pageIndex, pageType: "lesson", pageTitle: `Lesson ${lessonNum}: ${topic}`, page: lesson };
    }
    pageIndex++;

    if (shouldGen()) {
      yield { type: "page-start", pageIndex, pageType: "exercise", pageTitle: `Exercise ${lessonNum}` };
      const exercise = await generatePageJson(systemPrompt, buildExercisePrompt(input, topic, lessonNum), input.level);
      yield { type: "page-done", pageIndex, pageType: "exercise", pageTitle: `Exercise ${lessonNum}`, page: exercise };
    }
    pageIndex++;

    if (shouldGen()) {
      yield { type: "page-start", pageIndex, pageType: "homework", pageTitle: `Homework ${lessonNum}` };
      const hw = await generatePageJson(systemPrompt, buildHomeworkPrompt(input, topic, lessonNum), input.level);
      yield { type: "page-done", pageIndex, pageType: "homework", pageTitle: `Homework ${lessonNum}`, page: hw };
    }
    pageIndex++;
  }

  // Glossary
  if (shouldGen()) {
    yield { type: "page-start", pageIndex, pageType: "glossary", pageTitle: "Glossary" };
    const glossary = await generatePageJson(systemPrompt, buildGlossaryPrompt(input), input.level);
    yield { type: "page-done", pageIndex, pageType: "glossary", pageTitle: "Glossary", page: glossary };
  }
  pageIndex++;

  // Closing
  if (shouldGen()) {
    yield { type: "page-start", pageIndex, pageType: "closing", pageTitle: "Well Done!" };
    const closing = await generatePageJson(systemPrompt, buildClosingPrompt(input), input.level);
    yield { type: "page-done", pageIndex, pageType: "closing", pageTitle: "Well Done!", page: closing };
  }
  pageIndex++;

  yield { type: "complete", message: `Generated ${pageIndex} pages.` };
}

export function planCondensing(targetPages: number, topics: string[]) {
  const available = Math.max(0, targetPages - FIXED_PAGES);
  if (available >= 3 * topics.length) return { mode: "full" as GenerationMode, lessonsToGenerate: topics.length, topicsToUse: topics, pagesPerLesson: 3, estimatedTotalPages: FIXED_PAGES + 3 * topics.length, description: "Full mode" };
  if (available >= 2 * topics.length) return { mode: "condensed" as GenerationMode, lessonsToGenerate: topics.length, topicsToUse: topics, pagesPerLesson: 2, estimatedTotalPages: FIXED_PAGES + 2 * topics.length, description: "Condensed mode" };
  return { mode: "compact" as GenerationMode, lessonsToGenerate: Math.max(1, available), topicsToUse: topics.slice(0, Math.max(1, available)), pagesPerLesson: 1, estimatedTotalPages: FIXED_PAGES + Math.max(1, available), description: "Compact mode" };
}
