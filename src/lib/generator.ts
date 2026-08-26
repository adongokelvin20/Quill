// Quill — Book content generator.
// Uses Z.ai LLM (chat completions) with curriculum-aware prompts to produce
// rich, level-appropriate book pages as JSON block trees.
//
// Streaming: each page is generated and sent to the client as it completes,
// which keeps the perceived latency low and avoids Vercel function timeouts.

import ZAI from "z-ai-web-dev-sdk";
import { Block, PageContent, PageType, makeId } from "@/lib/blocks";
import { LevelInfo, SubjectInfo } from "@/lib/curriculum";
import { researchTopic } from "@/lib/research";

export interface GenerateBookInput {
  level: LevelInfo;
  subject: SubjectInfo;
  term: 1 | 2 | 3;
  topics: string[];
  // How many lessons to generate (each lesson = lesson page + exercise page + homework page)
  lessons?: number;
  // Optional override for total pages
  language?: string;
  // Research toggle — fetch authoritative reference text before generating
  research?: boolean;
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

// ---------------------------------------------------------------------------
// System prompt builder — tuned per class level
// ---------------------------------------------------------------------------

function buildSystemPrompt(level: LevelInfo, subject: SubjectInfo): string {
  const isKG = level.complexity <= 1;
  const isLower = level.complexity <= 2;
  const isUpper = level.complexity >= 4;

  return `You are Quill, an expert Ghana Education Service (GES) curriculum author. You write teaching and learning materials for Ghanaian basic schools.

TASK
You generate one page of an educational book as a JSON object. The JSON must match this TypeScript type exactly:

interface PageContent {
  type: "cover" | "toc" | "lesson" | "exercise" | "homework" | "glossary" | "activity" | "closing";
  title?: string;
  blocks: Block[];
}

Block is a discriminated union — each block has a "type" field plus its data. Valid block types:

- heading           { type: "heading", text: string, level?: 1|2|3 }
- subheading        { type: "subheading", text: string }
- paragraph         { type: "paragraph", text: string }
- image             { type: "image", url: "PLACEHOLDER", alt: string, caption?: string, width?: number, align?: "left"|"center"|"right" }
- image-caption     { type: "image-caption", text: string }
- bulleted-list     { type: "bulleted-list", items: string[] }
- numbered-list     { type: "numbered-list", items: string[] }
- table             { type: "table", headers: string[], rows: string[][] }
- activity          { type: "activity", title: string, instructions: string, items: string[] }
- fill-blanks       { type: "fill-blanks", title: string, instructions: string, sentences: string[], wordBank?: string[] }
- multiple-choice   { type: "multiple-choice", title: string, instructions: string, questions: { question: string, options: string[], answerIndex?: number }[] }
- matching          { type: "matching", title: string, instructions: string, pairs: { left: string, right: string }[] }
- word-bank         { type: "word-bank", title?: string, words: string[] }
- tracing           { type: "tracing", title: string, items: string[] }
- vocabulary        { type: "vocabulary", title: string, words: { word: string, meaning: string }[] }
- divider           { type: "divider" }
- spacer            { type: "spacer", height?: number }
- quote             { type: "quote", text: string, attribution?: string }
- tip               { type: "tip", title?: string, text: string }
- homework          { type: "homework", title: string, instructions: string, items: string[] }

For every image you want on the page, output an "image" block with url: "PLACEHOLDER" and a clear "alt" describing what the illustration should show. The alt text will be used to generate a kid-friendly illustration. For KG/lower-basic, prefer one big image per page. For upper levels, illustrations should be diagrams, charts, or labelled figures.

AUDIENCE & STYLE — match the level precisely:
- Level: ${level.fullLabel} (ages ${level.ageRange}, complexity ${level.complexity}/5)
- Subject: ${subject.name}
- Reading level: ${level.readingLevel}
- ${isKG ? `KG rules: very short sentences (3-7 words). Lots of repetition. Picture-heavy. Vocabulary focus on everyday words. Activities: tracing, matching pictures, colouring, circling, fill-blanks with a word bank, "circle the correct word". ALWAYS include 2-4 image blocks.`
  : isLower ? `Lower basic rules: short sentences (5-10 words). Simple grammar. Activities: matching, fill-blanks, multiple-choice with 3 options, short word problems. Always include 1-2 illustrations or diagrams.`
  : isUpper ? `Upper basic / JHS rules: paragraphs of 3-5 sentences. Use sub-headings. Include a table, diagram, or infographic. Activities: multiple-choice (4 options), short-answer, structured questions, word problems with real Ghana context.`
  : `Mid basic rules: 2-3 sentence paragraphs. Mix of pictures and short text. Activities: matching, fill-blanks, multiple-choice (3 options), simple word problems.`}

CULTURAL CONTEXT — Ghanaianise the content:
- Use Ghanaian names (Kwame, Ama, Kofi, Abena, Yaw, Akosua, Esi, Kojo, Adwoa, Kwabena).
- Use Cedi (GH₵) for money.
- Use local foods (banku, jollof, kenkey, waakye, fufu, tuo zaafi), markets (Makola, Kejetia), landmarks (Independence Arch, Cape Coast Castle, Mole National Park, Lake Volta).
- Reference Ghanaian festivals (Homowo, Aboakyir, Hogbetsotso, Damba, Bakatue).
- Use metric units (cm, m, km, kg).

LANGUAGE: Mainly English. Use simple Ghanaian English. Avoid slang.

OUTPUT: Only output the JSON object. No markdown fences, no commentary.

CRITICAL: Return valid JSON only. No text before or after.`;
}

// ---------------------------------------------------------------------------
// Page prompt builder
// ---------------------------------------------------------------------------

function buildCoverPrompt(input: GenerateBookInput): string {
  return `Generate a COVER page for a ${input.level.fullLabel} ${input.subject.name} textbook, Term ${input.term}.

The cover should contain:
- A big heading with the book title (e.g. "${input.subject.name} for ${input.level.fullLabel}")
- A subtitle "Term ${input.term} • Quill Series"
- A short one-line description
- A single large hero image with alt text describing a colourful classroom / Ghanaian children learning / subject-themed illustration
- A small "Name: ___________  Class: ___________" line at the bottom

Return JSON for a PageContent with type: "cover".`;
}

function buildTocPrompt(input: GenerateBookInput): string {
  return `Generate a TABLE OF CONTENTS page for the same book. List the ${input.topics.length} lessons, each on a numbered line: "Lesson N — Topic Title ........... page N*2".

Return JSON for a PageContent with type: "toc".`;
}

function buildLessonPrompt(
  input: GenerateBookInput,
  topic: string,
  lessonNumber: number,
  research: string
): string {
  const r = research ? `\n\nREFERENCE MATERIAL (use this as authoritative source):\n${research}\n` : "";
  return `Generate a LESSON page for Lesson ${lessonNumber} of ${input.level.fullLabel} ${input.subject.name}, Term ${input.term}.

Topic: ${topic}${r}

Structure:
1. Heading: "Lesson ${lessonNumber}: ${topic}"
2. Learning objectives (3-4 bullets) — what the learner will be able to do after the lesson
3. A short, level-appropriate introduction paragraph
4. The main content — broken into 2-4 sub-headings with paragraphs/lists/tables
5. At least one labelled image (diagram or illustration) where it aids understanding
6. A "Key Vocabulary" section with 3-5 terms and meanings
7. A "Teacher's Tip" block

Keep the content rich but appropriate for the reading level. Return JSON for a PageContent with type: "lesson".`;
}

function buildExercisePrompt(
  input: GenerateBookInput,
  topic: string,
  lessonNumber: number
): string {
  return `Generate an EXERCISE page for Lesson ${lessonNumber} (${topic}) of ${input.level.fullLabel} ${input.subject.name}.

The exercise should reinforce the lesson. Include a mix of:
- 1 "fill-blanks" activity (4-6 sentences) with a word bank
- 1 "multiple-choice" activity (3-5 questions) with options A/B/C/D — include answerIndex
- 1 "matching" activity (4-6 pairs) — scramble the right column order
- For KG/lower-basic: also add 1 "activity" block (e.g. "Colour the pictures", "Circle the correct word")
- For upper-basic/JHS: add 1 short-answer "activity" with 2-3 questions

Include a "Name: ___________  Date: ___________" line at the top.
Add an encouraging image (alt text describing a relevant illustration).
Use a "tip" block at the bottom: "Remember to check your answers!"

Return JSON for a PageContent with type: "exercise".`;
}

function buildHomeworkPrompt(
  input: GenerateBookInput,
  topic: string,
  lessonNumber: number
): string {
  return `Generate a HOMEWORK page for Lesson ${lessonNumber} (${topic}) of ${input.level.fullLabel} ${input.subject.name}.

The homework should be doable at home without supervision. Include:
- A "homework" block with title "Homework — Lesson ${lessonNumber}" and 4-6 short tasks
- One "fill-blanks" activity (3-4 sentences)
- One "multiple-choice" activity (2-3 questions)
- For KG/lower-basic: a "tracing" or "activity" block (e.g. "Draw and colour...", "Practise writing...")
- For upper-basic/JHS: a short-answer "activity" with 2 questions

Include "Name: ___________  Date: ___________" at the top.
Add a small decorative image.
Add a "tip" block: "Bring your homework to the next class!"

Return JSON for a PageContent with type: "homework".`;
}

function buildClosingPrompt(input: GenerateBookInput): string {
  return `Generate a CLOSING page for the ${input.level.fullLabel} ${input.subject.name} Term ${input.term} book.

Content:
- Heading: "Well Done!"
- An encouraging paragraph
- A "quote" block with an inspirational quote about learning (e.g. from a Ghanaian leader like Kwame Nkrumah or Kofi Annan)
- A "tip" block: "Keep practising every day!"
- A decorative image with alt text describing a celebration scene

Return JSON for a PageContent with type: "closing".`;
}

// ---------------------------------------------------------------------------
// LLM call — uses Z.ai SDK with strict JSON parsing & retries
// ---------------------------------------------------------------------------

async function generatePageJson(
  systemPrompt: string,
  userPrompt: string,
  level: LevelInfo
): Promise<PageContent> {
  const zai = await ZAI.create();

  const tryOnce = async (): Promise<PageContent | null> => {
    try {
      const res = await zai.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        // Higher temperature for KG (more creative), lower for JHS (more precise)
        temperature: level.complexity <= 2 ? 0.8 : 0.6,
        max_tokens: 2400,
      });
      const raw = res.choices?.[0]?.message?.content ?? "";
      return parsePageJson(raw);
    } catch (err) {
      console.error("[quill] generatePageJson error:", err);
      return null;
    }
  };

  let page = await tryOnce();
  if (!page) {
    // One retry with a "you MUST output JSON only" reminder
    const res = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
        { role: "system", content: "Reminder: output ONLY the JSON object, no markdown, no explanation." },
      ],
      temperature: 0.3,
      max_tokens: 2400,
    });
    const raw = res.choices?.[0]?.message?.content ?? "";
    page = parsePageJson(raw);
  }
  if (!page) {
    // Fallback: minimal page
    page = {
      type: "lesson",
      title: "Lesson",
      blocks: [
        { id: makeId(), type: "heading", text: "Lesson" },
        { id: makeId(), type: "paragraph", text: "Content could not be generated. Please regenerate this page." },
      ],
    };
  }
  return sanitisePage(page);
}

function parsePageJson(raw: string): PageContent | null {
  if (!raw) return null;
  // Strip code fences if present
  let txt = raw.trim();
  if (txt.startsWith("```")) {
    txt = txt.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  }
  // Try direct parse
  try {
    return JSON.parse(txt) as PageContent;
  } catch {
    // Try to find first { ... } block
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = txt.slice(start, end + 1);
      try {
        return JSON.parse(slice) as PageContent;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sanitisePage(page: PageContent): PageContent {
  // Ensure every block has an id
  const blocks = (page.blocks ?? []).map((b) =>
    (b as Block).id ? (b as Block) : { ...(b as Block), id: makeId() }
  ) as Block[];

  // Replace PLACEHOLDER image URLs with real Pollinations URLs (based on alt text)
  const resolvedBlocks = blocks.map((b) => {
    if (b.type === "image" && (!b.url || b.url === "PLACEHOLDER")) {
      const alt = b.alt?.trim() || "children's book illustration";
      // Build a Pollinations URL — image renders on-demand when the browser loads it.
      const enhanced = `${alt}. high quality children's book illustration, clean bold outlines, vibrant saturated colors, friendly cheerful mood, professional vector art, no text, no watermark, no signature`;
      const encoded = encodeURIComponent(enhanced.slice(0, 1800));
      // Include a unique seed so Pollinations doesn't return empty bytes for repeat
      // requests of the same prompt (it caches by URL).
      const seed = Math.floor(Math.random() * 1_000_000);
      const params = new URLSearchParams({
        width: "1024",
        height: "1024",
        model: "flux",
        nologo: "true",
        seed: String(seed),
      });
      const url = `https://image.pollinations.ai/prompt/${encoded}?${params.toString()}`;
      return { ...b, url, source: "generated" as const };
    }
    return b;
  }) as Block[];

  return { ...page, blocks: resolvedBlocks };
}

// ---------------------------------------------------------------------------
// Book title / subtitle generator
// ---------------------------------------------------------------------------

export async function generateBookMeta(input: GenerateBookInput): Promise<{
  title: string;
  subtitle: string;
  description: string;
}> {
  try {
    const zai = await ZAI.create();
    const res = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are Quill, a Ghana Education Service textbook editor. Output a single JSON object only.",
        },
        {
          role: "user",
          content: `Suggest a title, subtitle, and short description (1-2 sentences) for a ${input.level.fullLabel} ${input.subject.name} textbook for Term ${input.term}. Topics covered: ${input.topics.slice(0, 5).join(", ")}${input.topics.length > 5 ? "..." : ""}. Make the title catchy but appropriate for the level. Return JSON: { "title": string, "subtitle": string, "description": string }`,
        },
      ],
      temperature: 0.7,
      max_tokens: 400,
    });
    const raw = res.choices?.[0]?.message?.content ?? "";
    const parsed = parsePageJson(`{${raw.slice(raw.indexOf("{") + 1, raw.lastIndexOf("}"))}}`);
    if (parsed) return parsed as unknown as { title: string; subtitle: string; description: string };
    return {
      title: `${input.subject.name} for ${input.level.fullLabel}`,
      subtitle: `Term ${input.term} • Quill Series`,
      description: `A complete ${input.subject.name} textbook for ${input.level.fullLabel}, Term ${input.term}, aligned with the GES common curriculum.`,
    };
  } catch {
    return {
      title: `${input.subject.name} for ${input.level.fullLabel}`,
      subtitle: `Term ${input.term} • Quill Series`,
      description: `A complete ${input.subject.name} textbook for ${input.level.fullLabel}, Term ${input.term}.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Streaming generator — yields progress events as pages are produced
// ---------------------------------------------------------------------------

export async function* generateBook(
  input: GenerateBookInput,
  opts: { research?: boolean; signal?: AbortSignal } = {}
): AsyncGenerator<GenerateBookProgress> {
  const systemPrompt = buildSystemPrompt(input.level, input.subject);
  const lessonsCount = input.lessons ?? Math.min(4, input.topics.length);
  const topics = input.topics.slice(0, lessonsCount);

  // 1. Book meta
  const meta = await generateBookMeta(input);
  yield { type: "book-meta", book: meta };

  let pageIndex = 0;

  // 2. Cover
  yield { type: "page-start", pageIndex, pageType: "cover", pageTitle: "Cover" };
  const cover = await generatePageJson(systemPrompt, buildCoverPrompt(input), input.level);
  yield { type: "page-done", pageIndex, pageType: "cover", pageTitle: "Cover", page: cover };
  pageIndex++;

  // 3. TOC
  yield { type: "page-start", pageIndex, pageType: "toc", pageTitle: "Table of Contents" };
  const toc = await generatePageJson(systemPrompt, buildTocPrompt(input), input.level);
  yield { type: "page-done", pageIndex, pageType: "toc", pageTitle: "Table of Contents", page: toc };
  pageIndex++;

  // 4. Lessons — each lesson has lesson + exercise + homework
  for (let i = 0; i < topics.length; i++) {
    if (opts.signal?.aborted) return;
    const topic = topics[i];
    const lessonNum = i + 1;

    // Research (optional) — passes authoritative content to the LLM
    let research = "";
    if (opts.research) {
      yield { type: "log", pageIndex, message: `Researching "${topic}"...` };
      try {
        research = await researchTopic(topic, input.level.id);
      } catch {
        research = "";
      }
    }

    // Lesson page
    yield { type: "page-start", pageIndex, pageType: "lesson", pageTitle: `Lesson ${lessonNum}: ${topic}` };
    const lesson = await generatePageJson(
      systemPrompt,
      buildLessonPrompt(input, topic, lessonNum, research),
      input.level
    );
    yield { type: "page-done", pageIndex, pageType: "lesson", pageTitle: `Lesson ${lessonNum}: ${topic}`, page: lesson };
    pageIndex++;

    // Exercise page
    yield { type: "page-start", pageIndex, pageType: "exercise", pageTitle: `Exercise ${lessonNum}` };
    const exercise = await generatePageJson(
      systemPrompt,
      buildExercisePrompt(input, topic, lessonNum),
      input.level
    );
    yield { type: "page-done", pageIndex, pageType: "exercise", pageTitle: `Exercise ${lessonNum}`, page: exercise };
    pageIndex++;

    // Homework page
    yield { type: "page-start", pageIndex, pageType: "homework", pageTitle: `Homework ${lessonNum}` };
    const hw = await generatePageJson(
      systemPrompt,
      buildHomeworkPrompt(input, topic, lessonNum),
      input.level
    );
    yield { type: "page-done", pageIndex, pageType: "homework", pageTitle: `Homework ${lessonNum}`, page: hw };
    pageIndex++;
  }

  // 5. Glossary
  yield { type: "page-start", pageIndex, pageType: "glossary", pageTitle: "Glossary" };
  const glossary = await generatePageJson(
    systemPrompt,
    `Generate a GLOSSARY page for the ${input.subject.name} book. List 10-15 key terms covered across the lessons, each with a one-sentence meaning appropriate for ${input.level.fullLabel}. Use a "vocabulary" block. Return JSON for a PageContent with type: "glossary".`,
    input.level
  );
  yield { type: "page-done", pageIndex, pageType: "glossary", pageTitle: "Glossary", page: glossary };
  pageIndex++;

  // 6. Closing
  yield { type: "page-start", pageIndex, pageType: "closing", pageTitle: "Well Done!" };
  const closing = await generatePageJson(systemPrompt, buildClosingPrompt(input), input.level);
  yield { type: "page-done", pageIndex, pageType: "closing", pageTitle: "Well Done!", page: closing };
  pageIndex++;

  yield { type: "complete", message: `Generated ${pageIndex} pages.` };
}
