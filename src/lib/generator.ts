// Quill — Book content generator.
// Uses Z.ai SDK for LLM. Uses EMOJIS instead of generated images.

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

WORKSHEET DESIGN RULES — make pages look like colourful educational worksheets:
- Use EMOJIS throughout the content to make it visual and engaging
- In paragraphs: "🍎 Apple, 🍌 Banana, 🍇 Grapes — these are fruits we eat!"
- In fill-blanks: "The 🐐 goat has four legs. The 🐔 chicken has two legs."
- In multiple-choice: "How many legs does a 🐘 elephant have? A) 2 B) 4 C) 6 D) 8"
- In matching: match "🍎" with "Fruit", "🥕" with "Vegetable", "🐐" with "Animal"
- In vocabulary: "🍎 Apple — a round red fruit that grows on trees"
- In headings: "🔤 Phonics Fun! 🔤"
- In homework: "Count the 🍌 bananas in your kitchen. Draw 5 ⭐ stars."
- Use LOTS of emojis — they act as visual elements instead of illustrations
- For KG: use emojis for EVERY concept (🍎 for apple, 🔤 for letters, 🔢 for numbers)
- Make exercises look like real worksheets students would fill in
- Include "Name: ___ Date: ___" at the top of every exercise and homework page
- Use color-coded activity blocks with clear titles and instructions

IMAGE BLOCKS:
- For image blocks, write alt text that describes the scene WITH emojis
- Example alt: "🍎🍎🍎 Three red apples in a row, colourful, simple, for children"
- Example alt: "🐐 A friendly goat standing in green grass, simple cartoon style for kids"
- The alt text will be used to generate a simple image

AUDIENCE: ${level.fullLabel} (ages ${level.ageRange})
${isKG ? "KG: very short sentences (3-7 words). Use LOTS of emojis. Picture-heavy." : "Short sentences. Use emojis for visual appeal."}
Use Ghanaian names (Kwame, Ama, Kofi, Abena), Cedi (GH₵), local foods, festivals.
OUTPUT: Only valid JSON. No markdown fences. Start with { and end with }.`;
}

function buildCoverPrompt(input: GenerateBookInput): string {
  return `Generate a COVER page for ${input.level.fullLabel} ${input.subject.name}, Term ${input.term}.

Make it colourful and welcoming with emojis:
1. spacer (height 40)
2. heading: "📚 ${input.subject.name} Adventures 🌟" (or similar catchy title with emojis)
3. subheading: "Term ${input.term} • Quill Series 📖"
4. paragraph: A short fun description with emojis like "Let's learn ${input.subject.name} together! 🎉📖✏️"
5. image: alt = "Colourful classroom with Ghanaian children learning, books and pencils, 📚✏️🌟, simple bright illustration for children"
6. paragraph: "Name: ___________  Class: ___________"
7. divider
8. paragraph: "Quill — Bringing intelligent education to life 🪶"

Return JSON with type: "cover".`;
}

function buildTocPrompt(topics: string[]): string {
  return `Generate a TABLE OF CONTENTS page with emojis.
List ${topics.length} lessons: ${topics.map((t,i)=>`Lesson ${i+1}: ${t}`).join("\n")}
Include: heading "📋 Table of Contents 📋", numbered-list with lesson names (add emojis like 📖 before each), and 2 image blocks with simple alt text.
Return JSON with type: "toc".`;
}

function buildLessonPrompt(input: GenerateBookInput, topic: string, num: number): string {
  return `Generate a LESSON page for Lesson ${num}: ${topic}. This is for ${input.level.fullLabel} ${input.subject.name}.

Make it look like a colourful worksheet page with LOTS of emojis:
1. heading: "📖 Lesson ${num}: ${topic} 📚"
2. bulleted-list: 3-4 learning objectives with emojis (🎯 Learn..., ✏️ Practice..., 🔍 Discover...)
3. paragraph: Short intro with emojis related to ${topic}
4. image: alt = "Simple colourful illustration about ${topic.toLowerCase()} with emojis and shapes, for young learners, bright colours"
5. subheading: "🌟 Main Content 🌟"
6. paragraph: Teaching content with LOTS of emojis (use 🍎🍌🐐🦁🚗🏠 etc. to illustrate concepts)
7. image: alt = "Another simple scene about ${topic.toLowerCase()}, with objects and shapes, colourful, educational"
8. subheading: "📝 Practice 📝"
9. paragraph: More content with emojis
10. image: alt = "Third illustration showing an example from the lesson, simple shapes, bright colours"
11. vocabulary: 3-5 terms with emojis (🍎 Apple — a red fruit)
12. tip: "💡 Teacher's Tip: ..."

Include 3 image blocks. Use emojis EVERYWHERE in the text. Return JSON with type: "lesson".`;
}

function buildExercisePrompt(topic: string, num: number, level: LevelInfo): string {
  return `Generate an EXERCISE page for Lesson ${num}: ${topic}. This is for ${level.fullLabel}.

Make it look like a REAL colourful worksheet:
1. paragraph: "Name: ___________  Date: ___________"
2. heading: "✏️ Exercise ${num} ✏️"
3. image: alt = "Simple colourful worksheet illustration about ${topic.toLowerCase()}, with shapes and objects, bright, for children"
4. fill-blanks: 4-5 sentences with EMOJIS and blanks (e.g. "The 🐐 goat has ___ legs."), include word bank with emojis
5. image: alt = "Simple shapes and objects from the exercise, colourful, educational"
6. multiple-choice: 3-4 questions with EMOJIS (e.g. "How many 🍎 apples are shown? A) 2 B) 3 C) 4 D) 5"), with answerIndex
7. image: alt = "Objects from the multiple-choice questions shown as simple shapes, colourful"
8. matching: 4-5 pairs with EMOJIS (match 🍎 with "Fruit", 🥕 with "Vegetable")
9. image: alt = "Simple matching worksheet items, shapes and colours, educational"

Include 4 image blocks. Use LOTS of emojis. Make it look like a real worksheet. Return JSON with type: "exercise".`;
}

function buildHomeworkPrompt(topic: string, num: number, level: LevelInfo): string {
  return `Generate a HOMEWORK page for Lesson ${num}: ${topic}. This is for ${level.fullLabel}.

Make it look like a take-home worksheet with emojis:
1. paragraph: "Name: ___________  Date: ___________"
2. heading: "🏠 Homework — Lesson ${num} 📝"
3. image: alt = "Simple illustration of a child doing homework at home with books and pencils, colourful, for kids"
4. homework: 4-5 tasks with EMOJIS (e.g. "Count the 🍌 bananas in your kitchen", "Draw 5 ⭐ stars", "Write your name 3 times ✏️")
5. image: alt = "Simple shapes showing homework activities, colourful, educational"
6. fill-blanks: 3-4 sentences with EMOJIS and blanks
7. image: alt = "Objects from the fill-blanks shown as simple shapes, colourful"

Include 3 image blocks. Use LOTS of emojis. Return JSON with type: "homework".`;
}

function buildGlossaryPrompt(subject: SubjectInfo): string {
  return `Generate a GLOSSARY page for ${subject.name}. 10 terms with meanings and EMOJIS. Use vocabulary block. Example: 🍎 Apple — a round red fruit. Return JSON with type: "glossary".`;
}

function buildClosingPrompt(): string {
  return `Generate a CLOSING page with emojis. heading "🎉 Well Done! 🌟", paragraph (encouraging with emojis), quote, tip "💡 Keep practising every day! 📚", image (alt: "Ghanaian children celebrating with books and stars 🎉🌟📚, colourful, joyful, simple illustration"). Return JSON with type: "closing".`;
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
      const alt = b.alt?.trim() || "children's worksheet illustration";
      const seed = Math.floor(Math.random() * 1000000);
      // Use a simpler prompt for Pollinations — just basic shapes and colours
      const enc = encodeURIComponent(`${alt}. Simple flat illustration, bright colours, minimal, for children's worksheet, no text, no watermark`.slice(0, 1500));
      return { ...b, url: `https://image.pollinations.ai/prompt/${enc}?width=512&height=512&model=flux&nologo=true&seed=${seed}`, source: "generated" };
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
  if (!page) { page = { type:"lesson", title:"Lesson", blocks: [{id:makeId(),type:"heading",text:"📖 Lesson"},{id:makeId(),type:"paragraph",text:"Content could not be generated. Please edit manually. ✏️"}] }; }
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
