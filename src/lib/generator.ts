// Quill — Book content generator.
// Uses Z.ai LLM (chat completions) with curriculum-aware prompts to produce
// rich, level-appropriate book pages as JSON block trees.
//
// Page-count condensing:
//   The user can specify a target page count. The generator then picks the best
//   "mode" to fit the selected topics into that many pages:
//
//     "full"      — lesson + exercise + homework (3 pages per topic)
//     "condensed" — lesson + combined exercise/homework (2 pages per topic)
//     "compact"   — lesson with embedded exercise (1 page per topic)
//
//   Fixed pages: cover, TOC, glossary, closing = 4 pages.
//   Available pages for lessons = targetPages - 4.
//
// Streaming: each page is generated and sent to the client as it completes,
// which keeps the perceived latency low and avoids Vercel function timeouts.

import ZAI from "z-ai-web-dev-sdk";
import { Block, PageContent, PageType, makeId } from "@/lib/blocks";
import { LevelInfo, SubjectInfo } from "@/lib/curriculum";
import { researchTopic } from "@/lib/research";
import { generateHighQualityImage } from "@/lib/images";

// Global modifiers that push the model toward clean, kid-friendly illustrations.
const GLOBAL_ILLUSTRATION_MODIFIERS =
  "high quality children's book illustration, clean bold outlines, vibrant saturated colors, friendly cheerful mood, professional vector art, no text, no watermark, no signature";

export type GenerationMode = "full" | "condensed" | "compact";

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
  // Target page count — if set, the generator picks the best condensing mode
  targetPages?: number;
  // If true, group lessons into sections (units) with divider pages
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

// ---------------------------------------------------------------------------
// Condensing logic — given target pages and topic count, pick the best mode
// ---------------------------------------------------------------------------

const FIXED_PAGES = 4; // cover + TOC + glossary + closing

export interface CondensingPlan {
  mode: GenerationMode;
  lessonsToGenerate: number;
  topicsToUse: string[];
  pagesPerLesson: number;
  estimatedTotalPages: number;
  // Human-readable description for the UI
  description: string;
}

export function planCondensing(targetPages: number, topics: string[]): CondensingPlan {
  const availableForLessons = Math.max(0, targetPages - FIXED_PAGES);
  const topicCount = topics.length;

  // Try full mode first (3 pages per lesson)
  if (availableForLessons >= 3 * topicCount) {
    return {
      mode: "full",
      lessonsToGenerate: topicCount,
      topicsToUse: topics,
      pagesPerLesson: 3,
      estimatedTotalPages: FIXED_PAGES + 3 * topicCount,
      description: `Full mode: ${topicCount} lessons × 3 pages (lesson + exercise + homework) + ${FIXED_PAGES} fixed pages = ${FIXED_PAGES + 3 * topicCount} pages`,
    };
  }

  // Try condensed mode (2 pages per lesson)
  if (availableForLessons >= 2 * topicCount) {
    return {
      mode: "condensed",
      lessonsToGenerate: topicCount,
      topicsToUse: topics,
      pagesPerLesson: 2,
      estimatedTotalPages: FIXED_PAGES + 2 * topicCount,
      description: `Condensed mode: ${topicCount} lessons × 2 pages (lesson + combined exercise/homework) + ${FIXED_PAGES} fixed pages = ${FIXED_PAGES + 2 * topicCount} pages`,
    };
  }

  // Try compact mode (1 page per lesson) — fits all topics
  if (availableForLessons >= topicCount) {
    return {
      mode: "compact",
      lessonsToGenerate: topicCount,
      topicsToUse: topics,
      pagesPerLesson: 1,
      estimatedTotalPages: FIXED_PAGES + topicCount,
      description: `Compact mode: ${topicCount} lessons × 1 page (lesson with embedded exercise) + ${FIXED_PAGES} fixed pages = ${FIXED_PAGES + topicCount} pages`,
    };
  }

  // Not enough pages for all topics — truncate to fit
  const fittingTopics = Math.max(1, availableForLessons);
  const truncated = topics.slice(0, fittingTopics);
  return {
    mode: "compact",
    lessonsToGenerate: truncated.length,
    topicsToUse: truncated,
    pagesPerLesson: 1,
    estimatedTotalPages: FIXED_PAGES + truncated.length,
    description: `Compact mode (truncated): only ${truncated.length} of ${topicCount} topics fit in ${targetPages} pages. Each lesson = 1 page (lesson with embedded exercise). + ${FIXED_PAGES} fixed pages = ${FIXED_PAGES + truncated.length} pages`,
  };
}

// ---------------------------------------------------------------------------
// System prompt builder — tuned per class level
// ---------------------------------------------------------------------------

function buildSystemPrompt(level: LevelInfo, subject: SubjectInfo, mode: GenerationMode): string {
  const isKG = level.complexity <= 1;
  const isLower = level.complexity <= 2;
  const isUpper = level.complexity >= 4;

  const modeNote =
    mode === "full"
      ? "MODE: Full. Each lesson spans 3 pages: lesson page, exercise page, homework page. Generate rich, separate content for each."
      : mode === "condensed"
      ? "MODE: Condensed. Each lesson spans 2 pages: lesson page, then a combined exercise+homework page (call it 'Practice & Homework'). Keep content tight but complete."
      : "MODE: Compact. Each lesson is a single page that includes the lesson content AND a short embedded exercise (3-4 questions) at the bottom. Be concise but cover the key points.";

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

${modeNote}

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

function buildTocPrompt(input: GenerateBookInput, plan: CondensingPlan): string {
  return `Generate a TABLE OF CONTENTS page for the same book. List the ${plan.lessonsToGenerate} lessons, each on a numbered line: "Lesson N — Topic Title ........... page N".

Use the following topics (in order):
${plan.topicsToUse.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Return JSON for a PageContent with type: "toc".`;
}

function buildLessonPrompt(
  input: GenerateBookInput,
  topic: string,
  lessonNumber: number,
  research: string,
  mode: GenerationMode
): string {
  const r = research ? `\n\nREFERENCE MATERIAL (use this as authoritative source):\n${research}\n` : "";
  const compactNote =
    mode === "compact"
      ? "\n\nIMPORTANT: Since this is COMPACT mode (single-page lesson), include a short embedded exercise at the bottom of the same page — use a 'fill-blanks' block with 3 sentences OR a 'multiple-choice' block with 3 questions. Do NOT generate separate exercise or homework pages."
      : "";

  return `Generate a LESSON page for Lesson ${lessonNumber} of ${input.level.fullLabel} ${input.subject.name}, Term ${input.term}.

Topic: ${topic}${r}${compactNote}

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
  lessonNumber: number,
  mode: GenerationMode
): string {
  if (mode === "condensed") {
    return `Generate a COMBINED EXERCISE + HOMEWORK page for Lesson ${lessonNumber} (${topic}) of ${input.level.fullLabel} ${input.subject.name}.

This single page serves as both the in-class exercise AND the take-home homework. Structure it as:
1. Heading: "Practice & Homework — Lesson ${lessonNumber}"
2. A "Name: ___________  Date: ___________" line at the top
3. Section A — In-class practice (a "fill-blanks" block with 4-5 sentences, with a word bank)
4. Section B — Multiple choice (a "multiple-choice" block with 3-4 questions, options A/B/C/D, include answerIndex)
5. Section C — Take-home (a "homework" block with 3-4 short tasks students complete at home)
6. An encouraging image (alt text describing a relevant illustration)
7. A "tip" block at the bottom: "Complete Section A and B in class. Take Section C home."

Return JSON for a PageContent with type: "exercise".`;
  }

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

function buildSectionDividerPrompt(input: GenerateBookInput, sectionNumber: number, sectionTitle: string, lessonsInSection: string[]): string {
  return `Generate a SECTION DIVIDER page for Section ${sectionNumber} of a ${input.level.fullLabel} ${input.subject.name} textbook.

Section title: "${sectionTitle}"
Lessons in this section: ${lessonsInSection.map((l, i) => `${i + 1}. ${l}`).join("\n")}

The section divider should contain:
- A big heading: "Section ${sectionNumber}: ${sectionTitle}"
- A short introductory paragraph (2-3 sentences) about what this section covers
- A bulleted list of the lessons in this section
- A single large decorative image with alt text describing a themed illustration

Return JSON for a PageContent with type: "section-divider".`;
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
  level: LevelInfo,
  onProgress?: (msg: string) => void
): Promise<PageContent> {
  const zai = await ZAI.create();

  const tryOnce = async (attempt: number): Promise<PageContent | null> => {
    try {
      onProgress?.(`Generating content (attempt ${attempt})...`);
      const res = await zai.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        // Higher temperature for KG (more creative), lower for JHS (more precise)
        temperature: level.complexity <= 2 ? 0.8 : 0.6,
        max_tokens: 2800,
      });
      const raw = res.choices?.[0]?.message?.content ?? "";
      if (!raw || raw.trim().length < 10) {
        console.error("[quill] Empty LLM response on attempt", attempt);
        return null;
      }
      const parsed = parsePageJson(raw);
      if (!parsed) {
        console.error("[quill] JSON parse failed on attempt", attempt, "raw length:", raw.length);
      }
      return parsed;
    } catch (err) {
      console.error("[quill] generatePageJson error on attempt", attempt, err);
      return null;
    }
  };

  // Try up to 3 times with different temperatures
  let page = await tryOnce(1);
  if (!page) {
    // Retry with lower temperature and explicit JSON reminder
    onProgress?.("Retrying with stricter formatting...");
    const res = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
        { role: "system", content: "CRITICAL: Your previous response was not valid JSON. Output ONLY the JSON object now. No markdown fences, no explanation, no text before or after. Start with { and end with }." },
      ],
      temperature: 0.2,
      max_tokens: 2800,
    });
    const raw = res.choices?.[0]?.message?.content ?? "";
    page = parsePageJson(raw);
  }
  if (!page) {
    // Third try with minimal prompt
    onProgress?.("Final retry...");
    const res = await zai.chat.completions.create({
      messages: [
        { role: "system", content: "Output a JSON object for a lesson page. Start with { and end with }." },
        { role: "user", content: userPrompt.slice(0, 500) },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });
    const raw = res.choices?.[0]?.message?.content ?? "";
    page = parsePageJson(raw);
  }
  if (!page) {
    // Fallback: minimal page with the topic name
    onProgress?.("Using fallback content...");
    page = {
      type: "lesson",
      title: "Lesson",
      blocks: [
        { id: makeId(), type: "heading", text: "Lesson" },
        { id: makeId(), type: "paragraph", text: "This page could not be generated automatically. Please use the editor to add content manually, or try regenerating the book." },
        { id: makeId(), type: "tip", title: "Tip", text: "You can edit any page in the editor by clicking on it and using the block panel on the right." },
      ],
    };
  }
  return sanitisePage(page, onProgress);
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

async function sanitisePage(page: PageContent, onProgress?: (msg: string) => void): Promise<PageContent> {
  // Ensure every block has an id
  const blocks = (page.blocks ?? []).map((b) =>
    (b as Block).id ? (b as Block) : { ...(b as Block), id: makeId() }
  ) as Block[];

  // Find all image blocks that need URLs
  const imageBlocks = blocks.filter(
    (b): b is Extract<Block, { type: "image" }> =>
      b.type === "image" && (!b.url || b.url === "PLACEHOLDER")
  );

  if (imageBlocks.length === 0) {
    return { ...page, blocks };
  }

  onProgress?.(`Generating ${imageBlocks.length} illustration${imageBlocks.length > 1 ? "s" : ""} in HD...`);

  // Generate images one at a time with a per-image timeout.
  // If an image fails, use a Pollinations URL as fallback (renders on-demand
  // in the browser — no blocking).
  const resolvedImages = new Map<string, { url: string; source: "zai-gen" | "pollinations" }>();

  for (const block of imageBlocks) {
    const alt = block.alt?.trim() || "children's book illustration";
    try {
      // Race Z.ai generation vs a 15s timeout — never block more than 15s per image
      const result = await Promise.race([
        generateHighQualityImage(alt),
        new Promise<{ url: string; source: "zai-gen" | "pollinations" }>((resolve) => {
          // Fallback: Pollinations URL (instant, renders on-demand in browser)
          const seed = Math.floor(Math.random() * 1_000_000);
          const encoded = encodeURIComponent(`${alt}. ${GLOBAL_ILLUSTRATION_MODIFIERS}`.slice(0, 1800));
          const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;
          setTimeout(() => resolve({ url, source: "pollinations" }), 15000);
        }),
      ]);
      resolvedImages.set(block.id, result);
    } catch (err) {
      console.error("[quill] Image generation failed for:", alt.slice(0, 50), err);
      // Last resort: Pollinations URL (instant, renders on-demand)
      const seed = Math.floor(Math.random() * 1_000_000);
      const encoded = encodeURIComponent(`${alt}. ${GLOBAL_ILLUSTRATION_MODIFIERS}`.slice(0, 1800));
      const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;
      resolvedImages.set(block.id, { url, source: "pollinations" });
    }
  }

  // Replace image blocks with resolved URLs
  const resolvedBlocks = blocks.map((b) => {
    if (b.type === "image" && resolvedImages.has(b.id)) {
      const result = resolvedImages.get(b.id)!;
      return { ...b, url: result.url, source: "generated" as const };
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
          content: "You are Quill, a Ghana Education Service textbook editor. Output a single JSON object only. No markdown fences, no text before or after.",
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

    // Try to parse as JSON directly
    let parsed: { title?: string; subtitle?: string; description?: string } | null = null;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      // Try to extract JSON from the response
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(raw.slice(start, end + 1));
        } catch {
          parsed = null;
        }
      }
    }

    if (parsed && parsed.title) {
      return {
        title: parsed.title,
        subtitle: parsed.subtitle ?? `Term ${input.term} • Quill Series`,
        description: parsed.description ?? `A ${input.subject.name} textbook for ${input.level.fullLabel}.`,
      };
    }
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
  // Compute condensing plan
  const plan = input.targetPages
    ? planCondensing(input.targetPages, input.topics)
    : {
        mode: "full" as GenerationMode,
        lessonsToGenerate: input.lessons ?? Math.min(4, input.topics.length),
        topicsToUse: input.topics.slice(0, input.lessons ?? Math.min(4, input.topics.length)),
        pagesPerLesson: 3,
        estimatedTotalPages: FIXED_PAGES + 3 * (input.lessons ?? Math.min(4, input.topics.length)),
        description: `Full mode (default)`,
      };

  const systemPrompt = buildSystemPrompt(input.level, input.subject, plan.mode);
  const topics = plan.topicsToUse;

  yield { type: "log", message: plan.description };

  // Progress callback that yields log events
  const onProgress = (msg: string) => {
    // We can't yield from a callback, so we store the message for the next yield
    pendingLog = msg;
  };
  let pendingLog: string | null = null;

  const flushLog = function* () {
    if (pendingLog) {
      const msg = pendingLog;
      pendingLog = null;
      yield { type: "log" as const, message: msg };
    }
  };

  // 1. Book meta
  const meta = await generateBookMeta(input);
  yield { type: "book-meta", book: meta };

  let pageIndex = 0;

  // Helper to generate a page and flush any pending logs
  const genPage = async (
    pageType: PageType,
    pageTitle: string,
    userPrompt: string
  ): Promise<PageContent> => {
    return generatePageJson(systemPrompt, userPrompt, input.level, onProgress);
  };

  // 2. Cover
  yield { type: "page-start", pageIndex, pageType: "cover", pageTitle: "Cover" };
  const cover = await genPage("cover", "Cover", buildCoverPrompt(input));
  yield* flushLog();
  yield { type: "page-done", pageIndex, pageType: "cover", pageTitle: "Cover", page: cover };
  pageIndex++;

  // 3. TOC
  yield { type: "page-start", pageIndex, pageType: "toc", pageTitle: "Table of Contents" };
  const toc = await genPage("toc", "Table of Contents", buildTocPrompt(input, plan));
  yield* flushLog();
  yield { type: "page-done", pageIndex, pageType: "toc", pageTitle: "Table of Contents", page: toc };
  pageIndex++;

  // 4. Lessons — grouped into sections if useSections is true
  // Each section has ~3 lessons and gets its own divider page
  const useSections = input.useSections ?? false;
  const sectionSize = 3; // lessons per section
  const sectionCount = useSections ? Math.ceil(topics.length / sectionSize) : 0;

  for (let i = 0; i < topics.length; i++) {
    if (opts.signal?.aborted) return;
    const topic = topics[i];
    const lessonNum = i + 1;

    // Insert section divider at the start of each section
    if (useSections && i % sectionSize === 0) {
      const sectionNum = Math.floor(i / sectionSize) + 1;
      const sectionStart = i;
      const sectionEnd = Math.min(i + sectionSize, topics.length);
      const lessonsInSection = topics.slice(sectionStart, sectionEnd);
      // Build a section title from the first few lesson topics
      const sectionTitle = lessonsInSection.length === 1
        ? lessonsInSection[0]
        : `${lessonsInSection[0]} & Related Topics`;
      const dividerTitle = `Section ${sectionNum}: ${sectionTitle}`;
      yield { type: "page-start", pageIndex, pageType: "section-divider", pageTitle: dividerTitle };
      const divider = await genPage("section-divider", dividerTitle, buildSectionDividerPrompt(input, sectionNum, sectionTitle, lessonsInSection));
      yield* flushLog();
      yield { type: "page-done", pageIndex, pageType: "section-divider", pageTitle: dividerTitle, page: divider };
      pageIndex++;
    }

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
    const lesson = await genPage("lesson", `Lesson ${lessonNum}: ${topic}`, buildLessonPrompt(input, topic, lessonNum, research, plan.mode));
    yield* flushLog();
    yield { type: "page-done", pageIndex, pageType: "lesson", pageTitle: `Lesson ${lessonNum}: ${topic}`, page: lesson };
    pageIndex++;

    // Skip exercise/homework in compact mode (lesson already has embedded exercise)
    if (plan.mode === "compact") continue;

    // Exercise page (or combined exercise+homework in condensed mode)
    const exTitle = plan.mode === "condensed" ? `Practice & Homework ${lessonNum}` : `Exercise ${lessonNum}`;
    yield { type: "page-start", pageIndex, pageType: "exercise", pageTitle: exTitle };
    const exercise = await genPage("exercise", exTitle, buildExercisePrompt(input, topic, lessonNum, plan.mode));
    yield* flushLog();
    yield { type: "page-done", pageIndex, pageType: "exercise", pageTitle: exTitle, page: exercise };
    pageIndex++;

    // Homework page — only in full mode
    if (plan.mode === "full") {
      yield { type: "page-start", pageIndex, pageType: "homework", pageTitle: `Homework ${lessonNum}` };
      const hw = await genPage("homework", `Homework ${lessonNum}`, buildHomeworkPrompt(input, topic, lessonNum));
      yield* flushLog();
      yield { type: "page-done", pageIndex, pageType: "homework", pageTitle: `Homework ${lessonNum}`, page: hw };
      pageIndex++;
    }
  }

  // 5. Glossary
  yield { type: "page-start", pageIndex, pageType: "glossary", pageTitle: "Glossary" };
  const glossary = await genPage("glossary", "Glossary", `Generate a GLOSSARY page for the ${input.subject.name} book. List 10-15 key terms covered across the lessons, each with a one-sentence meaning appropriate for ${input.level.fullLabel}. Use a "vocabulary" block. Return JSON for a PageContent with type: "glossary".`);
  yield* flushLog();
  yield { type: "page-done", pageIndex, pageType: "glossary", pageTitle: "Glossary", page: glossary };
  pageIndex++;

  // 6. Closing
  yield { type: "page-start", pageIndex, pageType: "closing", pageTitle: "Well Done!" };
  const closing = await genPage("closing", "Well Done!", buildClosingPrompt(input));
  yield* flushLog();
  yield { type: "page-done", pageIndex, pageType: "closing", pageTitle: "Well Done!", page: closing };
  pageIndex++;

  yield { type: "complete", message: `Generated ${pageIndex} pages (${plan.mode} mode).` };
}
