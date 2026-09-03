// Quill — Book content generator.
// Uses Z.ai SDK for LLM. Images use Pollinations URLs.

import { callLLM } from "@/lib/llm";
import { Block, PageContent, PageType, makeId } from "@/lib/blocks";
import { LevelInfo, SubjectInfo } from "@/lib/curriculum";

export type GenerationMode = "full" | "condensed" | "compact";

export interface GenerateBookInput {
  level: LevelInfo; subject: SubjectInfo; term: 1|2|3; topics: string[];
  lessons?: number; language?: string; research?: boolean; targetPages?: number; useSections?: boolean;
}

export interface GenerateBookProgress {
  type: "page-start"|"page-done"|"page-error"|"book-meta"|"complete"|"log";
  pageIndex?: number; pageType?: PageType; pageTitle?: string; page?: PageContent; message?: string;
  book?: { title: string; subtitle: string; description: string };
}

const FIXED_PAGES = 4;

function buildSystemPrompt(level: LevelInfo, subject: SubjectInfo): string {
  const isKG = level.complexity <= 1;
  return `You are Quill, an expert Ghana Education Service curriculum author. Generate one page as JSON.

interface PageContent { type: string; title?: string; blocks: Block[]; }
Block types: heading{text,level?}, subheading{text}, paragraph{text}, image{url:"PLACEHOLDER",alt,caption?}, bulleted-list{items[]}, numbered-list{items[]}, fill-blanks{title,instructions,sentences[],wordBank?[]}, multiple-choice{title,instructions,questions[{question,options[],answerIndex?}]}, matching{title,instructions,pairs[{left,right}]}, vocabulary{title,words[{word,meaning}]}, tip{title?,text}, homework{title,instructions,items[]}, divider{}, spacer{height?}

CRITICAL IMAGE RULES:
- Every image block MUST have detailed "alt" text. This is used to generate the illustration.
- Write alt text like a professional illustrator's brief — be VERY specific:
  "A colourful cartoon of a Ghanaian mother cooking banku in a traditional kitchen, steam rising from the pot, a child watching and learning, warm lighting, professional children's book illustration"
- NEVER write generic alt text. ALWAYS describe the EXACT scene, objects, and characters.
- For exercises: if a question asks "How many legs does a goat have?", include an image with alt "A friendly cartoon goat standing in a green field, four legs clearly visible, colourful children's educational illustration"

DESIGN RULES — make pages look like professional educational worksheets:
- Use color-coded activity blocks (fill-blanks, multiple-choice, matching) with clear titles
- Include "Name: ___ Date: ___" fields at the top of exercise and homework pages
- Space out content with divider blocks between sections
- Include 2-4 image blocks per page, each showing a specific scene related to the content
- For KG: use very short sentences (3-7 words), lots of pictures, tracing activities
- Make exercises look like the worksheets students would fill in

AUDIENCE: ${level.fullLabel} (ages ${level.ageRange})
${isKG ? "KG: very short sentences. Picture-heavy — 3-4 images per page." : "Short sentences. 2-3 images per page."}
Use Ghanaian names (Kwame, Ama, Kofi, Abena), Cedi (GH₵), local foods, festivals.
OUTPUT: Only valid JSON. No markdown fences. Start with { and end with }.`;
}

function buildCoverPrompt(input: GenerateBookInput): string {
  return `Generate a COVER page for ${input.level.fullLabel} ${input.subject.name}, Term ${input.term}.
Include: heading (catchy title), subheading ("Term ${input.term} • Quill Series"), paragraph (description), image (alt: "A colourful illustration of Ghanaian children in a classroom learning ${input.subject.name}, with books and educational materials on desks, teacher at blackboard, warm sunlight through window, professional children's book art"), paragraph ("Name: ___________  Class: ___________"), divider, paragraph ("Quill — Bringing intelligent education to life").
Return JSON with type: "cover".`;
}

function buildTocPrompt(topics: string[]): string {
  return `Generate a TABLE OF CONTENTS page. List ${topics.length} lessons: ${topics.map((t,i)=>`Lesson ${i+1}: ${t}`).join("\n")}. Include heading "Table of Contents", numbered-list with page numbers, and 2 image blocks with alt text describing children learning scenes. Return JSON with type: "toc".`;
}

function buildLessonPrompt(input: GenerateBookInput, topic: string, num: number): string {
  return `Generate a LESSON page for Lesson ${num}: ${topic}. This is for ${input.level.fullLabel} ${input.subject.name}.

Make it look like a professional educational page with:
1. heading: "Lesson ${num}: ${topic}"
2. bulleted-list: 3-4 learning objectives
3. paragraph: Short introduction
4. image: Alt text: "A colourful educational illustration showing ${topic.toLowerCase()}, with clear labels and examples, designed for ${input.level.fullLabel} students, professional children's textbook art"
5. subheading: Main content section title
6. paragraph: Teaching content (3-5 sentences)
7. image: Alt text describing a SPECIFIC example from the lesson (e.g. "A cartoon of Kofi counting mangoes in a basket, showing numbers 1 to 5, colourful, educational")
8. subheading: Another section
9. paragraph: More content or examples
10. image: Alt text for a third illustration related to the topic
11. vocabulary: 3-5 key terms with meanings
12. tip: Teaching tip

Include 3 image blocks with detailed, specific alt text. Return JSON with type: "lesson".`;
}

function buildExercisePrompt(topic: string, num: number, level: LevelInfo): string {
  return `Generate an EXERCISE page for Lesson ${num}: ${topic}. This is for ${level.fullLabel}.

Make it look like a colourful worksheet with:
1. paragraph: "Name: ___________  Date: ___________"
2. heading: "Exercise ${num}"
3. image: Alt text: "A colourful illustration related to ${topic.toLowerCase()}, showing the main concept, educational children's book style"
4. fill-blanks: 4-5 sentences about ${topic} with blanks, include word bank
5. image: Alt text describing a specific concept from the fill-blanks (e.g. "A cartoon showing different types of plants with labels, colourful, educational")
6. multiple-choice: 3-4 questions, each with 4 options and answerIndex
7. image: Alt text for an object from one of the multiple-choice questions (e.g. if a question asks about animals, "A colourful cartoon of a goat, chicken, and dog in a Ghanaian farmyard, clearly visible for counting")
8. matching: 4-5 pairs related to ${topic}
9. image: Alt text showing the items from the matching exercise

Include 4 image blocks with specific alt text. Return JSON with type: "exercise".`;
}

function buildHomeworkPrompt(topic: string, num: number, level: LevelInfo): string {
  return `Generate a HOMEWORK page for Lesson ${num}: ${topic}. This is for ${level.fullLabel}.

Make it look like a take-home worksheet with:
1. paragraph: "Name: ___________  Date: ___________"
2. heading: "Homework — Lesson ${num}"
3. image: Alt text: "A colourful illustration of a child doing homework at home, with books and pencils on the table, related to ${topic.toLowerCase()}, warm and encouraging"
4. homework: 4-5 tasks students can do at home
5. image: Alt text showing one of the homework tasks (e.g. "A child counting objects in their kitchen, colourful, educational illustration")
6. fill-blanks: 3-4 sentences about ${topic}
7. image: Alt text for a concept from the fill-blanks

Include 3 image blocks with specific alt text. Return JSON with type: "homework".`;
}

function buildGlossaryPrompt(subject: SubjectInfo): string {
  return `Generate a GLOSSARY page for ${subject.name}. 10 terms with meanings. Use vocabulary block. Return JSON with type: "glossary".`;
}

function buildClosingPrompt(): string {
  return `Generate a CLOSING page. heading "Well Done!", paragraph, quote, tip, image (alt: "Ghanaian children celebrating with books, confetti and stars, joyful, colourful children's book illustration"). Return JSON with type: "closing".`;
}

function parseJson(raw: string): PageContent | null {
  if (!raw) return null;
  let t = raw.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
  try { return JSON.parse(t); } catch {}
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s,e+1)); } catch {} }
  return null;
}

function sanitisePage(page: PageContent): PageContent {
  const blocks = (page.blocks ?? []).map((b:any) => b.id ? b : {...b, id: makeId()}) as Block[];
  const resolved = blocks.map((b:any) => {
    if (b.type === "image" && (!b.url || b.url === "PLACEHOLDER")) {
      const alt = b.alt?.trim() || "children's book illustration";
      const seed = Math.floor(Math.random() * 1000000);
      const enc = encodeURIComponent(`${alt}. Professional children's book illustration, vibrant colours, clean bold outlines, high quality vector art, no text, no watermark`.slice(0, 1500));
      return { ...b, url: `https://image.pollinations.ai/prompt/${enc}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`, source: "generated" };
    }
    return b;
  }) as Block[];
  return { ...page, blocks: resolved };
}

async function genPage(system: string, user: string, level: LevelInfo): Promise<PageContent> {
  const tryOnce = async () => {
    try {
      const raw = await callLLM([{role:"system",content:system},{role:"user",content:user}], 4000, level.complexity <= 2 ? 0.8 : 0.6);
      if (!raw || raw.trim().length < 10) return null;
      return parseJson(raw);
    } catch (e) { console.error("[quill] LLM error:", e instanceof Error ? e.message : String(e)); return null; }
  };
  let page = await tryOnce();
  if (!page) page = await tryOnce();
  if (!page) { page = { type:"lesson", title:"Lesson", blocks: [{id:makeId(),type:"heading",text:"Lesson"},{id:makeId(),type:"paragraph",text:"Content could not be generated. Please edit manually."}] }; }
  return sanitisePage(page);
}

export async function genMeta(input: GenerateBookInput) {
  try {
    const raw = await callLLM([{role:"system",content:"Output JSON only."},{role:"user",content:`Title for ${input.level.fullLabel} ${input.subject.name} Term ${input.term}. Return {"title":"","subtitle":"","description":""}`}], 500, 0.7);
    const p = parseJson(raw) as any;
    if (p?.title) return { title:p.title, subtitle:p.subtitle ?? `Term ${input.term} • Quill Series`, description:p.description ?? "" };
  } catch (e) { console.error("[quill] meta error:", e); }
  return { title:`${input.subject.name} for ${input.level.fullLabel}`, subtitle:`Term ${input.term} • Quill Series`, description:"" };
}

export async function* generateBook(input: GenerateBookInput, opts: { skipPages?: number } = {}): AsyncGenerator<GenerateBookProgress> {
  const skip = opts.skipPages ?? 0;
  const topics = input.topics.slice(0, input.lessons ?? input.topics.length);
  const system = buildSystemPrompt(input.level, input.subject);
  let pi = 0;
  const gen = () => pi >= skip;
  if (skip === 0) { const m = await genMeta(input); yield { type:"book-meta", book:m }; }
  if (gen()) { yield {type:"page-start",pageIndex:pi,pageType:"cover",pageTitle:"Cover"}; const p=await genPage(system,buildCoverPrompt(input),input.level); yield {type:"page-done",pageIndex:pi,pageType:"cover",pageTitle:"Cover",page:p}; } pi++;
  if (gen()) { yield {type:"page-start",pageIndex:pi,pageType:"toc",pageTitle:"TOC"}; const p=await genPage(system,buildTocPrompt(topics),input.level); yield {type:"page-done",pageIndex:pi,pageType:"toc",pageTitle:"TOC",page:p}; } pi++;
  for (let i=0; i<topics.length; i++) {
    const t=topics[i], n=i+1;
    if (gen()) { yield {type:"page-start",pageIndex:pi,pageType:"lesson",pageTitle:`Lesson ${n}: ${t}`}; const p=await genPage(system,buildLessonPrompt(input,t,n),input.level); yield {type:"page-done",pageIndex:pi,pageType:"lesson",pageTitle:`Lesson ${n}: ${t}`,page:p}; } pi++;
    if (gen()) { yield {type:"page-start",pageIndex:pi,pageType:"exercise",pageTitle:`Exercise ${n}`}; const p=await genPage(system,buildExercisePrompt(t,n,input.level),input.level); yield {type:"page-done",pageIndex:pi,pageType:"exercise",pageTitle:`Exercise ${n}`,page:p}; } pi++;
    if (gen()) { yield {type:"page-start",pageIndex:pi,pageType:"homework",pageTitle:`Homework ${n}`}; const p=await genPage(system,buildHomeworkPrompt(t,n,input.level),input.level); yield {type:"page-done",pageIndex:pi,pageType:"homework",pageTitle:`Homework ${n}`,page:p}; } pi++;
  }
  if (gen()) { yield {type:"page-start",pageIndex:pi,pageType:"glossary",pageTitle:"Glossary"}; const p=await genPage(system,buildGlossaryPrompt(input.subject),input.level); yield {type:"page-done",pageIndex:pi,pageType:"glossary",pageTitle:"Glossary",page:p}; } pi++;
  if (gen()) { yield {type:"page-start",pageIndex:pi,pageType:"closing",pageTitle:"Well Done!"}; const p=await genPage(system,buildClosingPrompt(),input.level); yield {type:"page-done",pageIndex:pi,pageType:"closing",pageTitle:"Well Done!",page:p}; } pi++;
  yield { type:"complete", message:`Generated ${pi} pages.` };
}

export function planCondensing(targetPages: number, topics: string[]) {
  const a = Math.max(0, targetPages - FIXED_PAGES);
  if (a >= 3*topics.length) return { mode:"full" as GenerationMode, lessonsToGenerate:topics.length, topicsToUse:topics, pagesPerLesson:3, estimatedTotalPages:FIXED_PAGES+3*topics.length, description:"Full" };
  if (a >= 2*topics.length) return { mode:"condensed" as GenerationMode, lessonsToGenerate:topics.length, topicsToUse:topics, pagesPerLesson:2, estimatedTotalPages:FIXED_PAGES+2*topics.length, description:"Condensed" };
  return { mode:"compact" as GenerationMode, lessonsToGenerate:Math.max(1,a), topicsToUse:topics.slice(0,Math.max(1,a)), pagesPerLesson:1, estimatedTotalPages:FIXED_PAGES+Math.max(1,a), description:"Compact" };
}
