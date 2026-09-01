// Quill — Book content generator.
// Uses Google Gemini API (gemini-3.6-flash) for content generation.

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

function buildSystemPrompt(level: LevelInfo, subject: SubjectInfo): string {
  const isKG = level.complexity <= 1;
  return `You are Quill, an expert Ghana Education Service curriculum author. Generate one page as JSON.

interface PageContent { type: string; title?: string; blocks: Block[]; }
Block types: heading{text,level?}, subheading{text}, paragraph{text}, image{url:"PLACEHOLDER",alt,caption?}, bulleted-list{items[]}, numbered-list{items[]}, fill-blanks{title,instructions,sentences[],wordBank?[]}, multiple-choice{title,instructions,questions[{question,options[],answerIndex?}]}, matching{title,instructions,pairs[{left,right}]}, vocabulary{title,words[{word,meaning}]}, tip{title?,text}, homework{title,instructions,items[]}, divider{}, spacer{height?}

CRITICAL IMAGE RULES:
- Every image block MUST have a detailed "alt" field describing EXACTLY what the illustration should show.
- The alt text is used by an AI image generator to create the illustration.
- Write alt text like a professional illustrator's brief: "A colourful cartoon of a Ghanaian mother cooking banku in a traditional kitchen, with steam rising from the pot, warm lighting, clean vector art style"
- NEVER write generic alt text like "illustration" or "image of the topic".
- ALWAYS relate the image to the SPECIFIC content on the page.
- For exercise questions about specific objects (e.g. "How many legs does a goat have?"), include an image block with alt text describing that exact object (e.g. "A friendly cartoon goat standing in a green field, four legs visible, colourful children's book illustration style").
- For matching exercises, include images for the items being matched.

AUDIENCE: ${level.fullLabel} (ages ${level.ageRange})
${isKG ? "KG: very short sentences (3-7 words). Picture-heavy — include 3-4 image blocks per page with different illustrations." : "Short sentences. Include 2-3 image blocks per page with different illustrations."}
Use Ghanaian names (Kwame, Ama, Kofi, Abena), Cedi (GH₵), local foods (banku, jollof, waakye), festivals (Homowo, Aboakyir).
OUTPUT: Only valid JSON. No markdown fences. Start with { and end with }.`;
}

function buildCoverPrompt(input: GenerateBookInput): string {
  return `Generate a COVER page for ${input.level.fullLabel} ${input.subject.name}, Term ${input.term}.

Include these blocks:
1. heading: A catchy title (e.g. "Discovering Numbers" or "English Adventures")
2. subheading: "Term ${input.term} • Quill Series"
3. paragraph: A short engaging description
4. image: A hero illustration. Alt text MUST describe a SPECIFIC scene: "A colourful illustration of Ghanaian children in a classroom learning ${input.subject.name}, with books and educational materials on their desks, a teacher at the blackboard, warm sunlight through the window, professional children's book art style"
5. paragraph: "Name: ___________  Class: ___________"
6. divider
7. paragraph: "Quill — Bringing intelligent education to life"

Return JSON with type: "cover".`;
}

function buildTocPrompt(topics: string[]): string {
  return `Generate a TABLE OF CONTENTS page for a textbook.

List these ${topics.length} lessons:
${topics.map((t, i) => `Lesson ${i+1}: ${t}`).join("\n")}

Include:
1. heading: "Table of Contents"
2. numbered-list: Each lesson with its page number (e.g. "Lesson 1: ${topics[0]} ........... Page 3")

Return JSON with type: "toc".`;
}

function buildLessonPrompt(input: GenerateBookInput, topic: string, num: number): string {
  return `Generate a LESSON page for Lesson ${num}: ${topic}.

This is for ${input.level.fullLabel} ${input.subject.name}.

Include these blocks:
1. heading: "Lesson ${num}: ${topic}"
2. bulleted-list: 3-4 learning objectives
3. paragraph: A short introduction to the topic
4. image: An illustration that DIRECTLY relates to ${topic}. Alt text MUST be specific and detailed.
5. subheading: A section title for the main content
6. paragraph: Main teaching content (3-5 sentences)
7. image: Another illustration showing a concept from the content. Detailed alt text.
8. subheading: Another section
9. paragraph: More content or examples
10. image: A third illustration showing another aspect of the lesson. Detailed alt text.
11. vocabulary: 3-5 key terms with one-sentence meanings
12. tip: A teaching tip

Include 3 image blocks total, each with specific alt text describing a different aspect of ${topic}.

Return JSON with type: "lesson".`;
}

function buildExercisePrompt(topic: string, num: number, level: LevelInfo): string {
  return `Generate an EXERCISE page for Lesson ${num}: ${topic}.

This is for ${level.fullLabel} students.

Include these blocks:
1. paragraph: "Name: ___________  Date: ___________"
2. image: An illustration related to ${topic}. Alt text MUST be specific and detailed.
3. fill-blanks: 4-5 sentences about ${topic} with blanks (____), include a word bank
4. image: Another illustration showing a key concept from the fill-blanks. Detailed alt text.
5. multiple-choice: 3-4 questions about ${topic}, each with 4 options (A, B, C, D) and answerIndex
6. image: An illustration showing one of the multiple-choice question subjects. Detailed alt text.
7. matching: 4-5 pairs related to ${topic}
8. image: An illustration showing the items from the matching exercise. Detailed alt text.

IMPORTANT: Include 3-4 image blocks total. Each image must have detailed alt text describing a SPECIFIC scene related to the content. If a question asks about a goat, include an image of a goat.

Return JSON with type: "exercise".`;
}

function buildHomeworkPrompt(topic: string, num: number, level: LevelInfo): string {
  return `Generate a HOMEWORK page for Lesson ${num}: ${topic}.

This is for ${level.fullLabel} students.

Include these blocks:
1. paragraph: "Name: ___________  Date: ___________"
2. image: An illustration related to ${topic}. Detailed alt text.
3. homework: 4-5 tasks related to ${topic} that students can do at home
4. image: An illustration showing one of the homework tasks. Detailed alt text.
5. fill-blanks: 3-4 sentences about ${topic}
6. image: An illustration related to the fill-blanks content. Detailed alt text.

Include 3 image blocks total. Each with specific, detailed alt text.

Return JSON with type: "homework".`;
}

function buildGlossaryPrompt(subject: SubjectInfo): string {
  return `Generate a GLOSSARY page for ${subject.name}.
List 10 key terms with one-sentence meanings. Use a vocabulary block.
Return JSON with type: "glossary".`;
}

function buildClosingPrompt(): string {
  return `Generate a CLOSING page.

Include:
1. heading: "Well Done!"
2. paragraph: An encouraging paragraph about learning
3. quote: An inspirational quote (e.g. from Kwame Nkrumah or Kofi Annan)
4. tip: "Keep practising every day!"
5. image: Alt text: "A colourful celebration scene with Ghanaian children cheering and holding books, confetti and stars, joyful children's book illustration style"

Return JSON with type: "closing".`;
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

  // Replace PLACEHOLDER image URLs with high-quality Pollinations URLs
  const resolved = blocks.map((b: any) => {
    if (b.type === "image" && (!b.url || b.url === "PLACEHOLDER")) {
      const alt = b.alt?.trim() || "children's book illustration";
      const seed = Math.floor(Math.random() * 1000000);
      // Build a detailed prompt for Pollinations
      const prompt = `${alt}. Professional children's book illustration, vibrant colours, clean bold outlines, high quality vector art style, well composed, clear focal point, educational, no text, no watermark`;
      const enc = encodeURIComponent(prompt.slice(0, 1800));
      const url = `https://image.pollinations.ai/prompt/${enc}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;
      return { ...b, url, source: "generated" };
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
        4000,
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
      [{ role: "system", content: "Output JSON only." }, { role: "user", content: `Suggest a catchy title, subtitle, and description for a ${input.level.fullLabel} ${input.subject.name} textbook, Term ${input.term}. Topics: ${input.topics.slice(0, 3).join(", ")}. Return {"title":"","subtitle":"","description":""}` }],
      500, 0.7
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

  // Cover
  if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "cover", pageTitle: "Cover" }; const p = await genPage(system, buildCoverPrompt(input), input.level); yield { type: "page-done", pageIndex: pi, pageType: "cover", pageTitle: "Cover", page: p }; } pi++;

  // TOC
  if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "toc", pageTitle: "Table of Contents" }; const p = await genPage(system, buildTocPrompt(topics), input.level); yield { type: "page-done", pageIndex: pi, pageType: "toc", pageTitle: "Table of Contents", page: p }; } pi++;

  // Lessons
  for (let i = 0; i < topics.length; i++) {
    const t = topics[i], n = i + 1;
    if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "lesson", pageTitle: `Lesson ${n}: ${t}` }; const p = await genPage(system, buildLessonPrompt(input, t, n), input.level); yield { type: "page-done", pageIndex: pi, pageType: "lesson", pageTitle: `Lesson ${n}: ${t}`, page: p }; } pi++;
    if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "exercise", pageTitle: `Exercise ${n}` }; const p = await genPage(system, buildExercisePrompt(t, n, input.level), input.level); yield { type: "page-done", pageIndex: pi, pageType: "exercise", pageTitle: `Exercise ${n}`, page: p }; } pi++;
    if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "homework", pageTitle: `Homework ${n}` }; const p = await genPage(system, buildHomeworkPrompt(t, n, input.level), input.level); yield { type: "page-done", pageIndex: pi, pageType: "homework", pageTitle: `Homework ${n}`, page: p }; } pi++;
  }

  // Glossary
  if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "glossary", pageTitle: "Glossary" }; const p = await genPage(system, buildGlossaryPrompt(input.subject), input.level); yield { type: "page-done", pageIndex: pi, pageType: "glossary", pageTitle: "Glossary", page: p }; } pi++;

  // Closing
  if (gen()) { yield { type: "page-start", pageIndex: pi, pageType: "closing", pageTitle: "Well Done!" }; const p = await genPage(system, buildClosingPrompt(), input.level); yield { type: "page-done", pageIndex: pi, pageType: "closing", pageTitle: "Well Done!", page: p }; } pi++;

  yield { type: "complete", message: `Generated ${pi} pages.` };
}

export function planCondensing(targetPages: number, topics: string[]) {
  const a = Math.max(0, targetPages - FIXED_PAGES);
  if (a >= 3 * topics.length) return { mode: "full" as GenerationMode, lessonsToGenerate: topics.length, topicsToUse: topics, pagesPerLesson: 3, estimatedTotalPages: FIXED_PAGES + 3 * topics.length, description: "Full" };
  if (a >= 2 * topics.length) return { mode: "condensed" as GenerationMode, lessonsToGenerate: topics.length, topicsToUse: topics, pagesPerLesson: 2, estimatedTotalPages: FIXED_PAGES + 2 * topics.length, description: "Condensed" };
  return { mode: "compact" as GenerationMode, lessonsToGenerate: Math.max(1, a), topicsToUse: topics.slice(0, Math.max(1, a)), pagesPerLesson: 1, estimatedTotalPages: FIXED_PAGES + Math.max(1, a), description: "Compact" };
}
