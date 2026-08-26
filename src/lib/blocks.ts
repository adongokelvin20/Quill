// Quill — Content blocks. Shared between the editor, the generator, and the
// DOCX exporter so every part of the system speaks the same content language.

export type BlockType =
  | "heading"
  | "subheading"
  | "paragraph"
  | "image"
  | "image-caption"
  | "bulleted-list"
  | "numbered-list"
  | "table"
  | "activity"
  | "fill-blanks"
  | "multiple-choice"
  | "matching"
  | "word-bank"
  | "tracing"
  | "vocabulary"
  | "divider"
  | "spacer"
  | "quote"
  | "tip"
  | "homework";

export interface BaseBlock {
  id: string;
  type: BlockType;
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  text: string;
  level?: 1 | 2 | 3;
}

export interface SubheadingBlock extends BaseBlock {
  type: "subheading";
  text: string;
}

export interface ParagraphBlock extends BaseBlock {
  type: "paragraph";
  text: string;
}

export interface ImageBlock extends BaseBlock {
  type: "image";
  url: string;
  alt: string;
  caption?: string;
  width?: number; // in px (display size)
  align?: "left" | "center" | "right";
  source?: "generated" | "searched" | "uploaded";
}

export interface ImageCaptionBlock extends BaseBlock {
  type: "image-caption";
  text: string;
}

export interface ListBlock extends BaseBlock {
  type: "bulleted-list" | "numbered-list";
  items: string[];
}

export interface TableBlock extends BaseBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

export interface ActivityBlock extends BaseBlock {
  type: "activity";
  title: string;
  instructions: string;
  // For "complete the pattern", "draw a line", "circle the correct one" etc.
  items: string[];
}

export interface FillBlanksBlock extends BaseBlock {
  type: "fill-blanks";
  title: string;
  instructions: string;
  // Sentences with "____" marking blanks
  sentences: string[];
  // Optional word bank
  wordBank?: string[];
}

export interface MultipleChoiceBlock extends BaseBlock {
  type: "multiple-choice";
  title: string;
  instructions: string;
  questions: {
    question: string;
    options: string[];
    // 0-indexed correct option — empty for student worksheet
    answerIndex?: number;
  }[];
}

export interface MatchingBlock extends BaseBlock {
  type: "matching";
  title: string;
  instructions: string;
  pairs: { left: string; right: string }[];
}

export interface WordBankBlock extends BaseBlock {
  type: "word-bank";
  title?: string;
  words: string[];
}

export interface TracingBlock extends BaseBlock {
  type: "tracing";
  title: string;
  // Words/letters to trace
  items: string[];
}

export interface VocabularyBlock extends BaseBlock {
  type: "vocabulary";
  title: string;
  words: { word: string; meaning: string }[];
}

export interface DividerBlock extends BaseBlock {
  type: "divider";
}

export interface SpacerBlock extends BaseBlock {
  type: "spacer";
  height?: number;
}

export interface QuoteBlock extends BaseBlock {
  type: "quote";
  text: string;
  attribution?: string;
}

export interface TipBlock extends BaseBlock {
  type: "tip";
  title?: string;
  text: string;
}

export interface HomeworkBlock extends BaseBlock {
  type: "homework";
  title: string;
  instructions: string;
  items: string[];
}

export type Block =
  | HeadingBlock
  | SubheadingBlock
  | ParagraphBlock
  | ImageBlock
  | ImageCaptionBlock
  | ListBlock
  | TableBlock
  | ActivityBlock
  | FillBlanksBlock
  | MultipleChoiceBlock
  | MatchingBlock
  | WordBankBlock
  | TracingBlock
  | VocabularyBlock
  | DividerBlock
  | SpacerBlock
  | QuoteBlock
  | TipBlock
  | HomeworkBlock;

export type PageType =
  | "cover"
  | "toc"
  | "lesson"
  | "exercise"
  | "homework"
  | "glossary"
  | "activity"
  | "closing";

export interface PageContent {
  type: PageType;
  title?: string;
  blocks: Block[];
}

export function emptyPageContent(type: PageType = "lesson"): PageContent {
  return { type, blocks: [] };
}

// Helper to make ids
export function makeId(prefix = "b"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function isBlock<T extends Block>(b: Block, type: BlockType): b is T {
  return b.type === type;
}
