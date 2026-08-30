"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuillStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { PagePreview } from "@/components/quill/block-view";
import { Block, PageContent, makeId } from "@/lib/blocks";
import { LEVELS, SUBJECTS } from "@/lib/curriculum";
import {
  ArrowLeft,
  Download,
  Loader2,
  Plus,
  Trash2,
  Image as ImageIcon,
  Search,
  Wand2,
  Type,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Table as TableIcon,
  HelpCircle,
  Edit3,
  Sparkles,
  Save,
  FileText,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BookWithPages {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  level: string;
  subject: string;
  term: number;
  status: string;
  pages: Array<{
    id: string;
    pageNumber: number;
    type: string;
    title: string | null;
    content: string;
  }>;
}

interface ImageResult {
  url: string;
  alt: string;
  caption?: string;
}

export function EditorView() {
  const { activeBookId, goLibrary } = useQuillStore();
  const [book, setBook] = useState<BookWithPages | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load book
  useEffect(() => {
    if (!activeBookId) return;
    setLoading(true);
    fetch(`/api/quill/books/${activeBookId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.book) {
          setBook(data.book);
          setActivePageId(data.book.pages[0]?.id ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, [activeBookId]);

  const activePage = book?.pages.find((p) => p.id === activePageId) ?? null;

  const parsePageContent = (raw: string): PageContent => {
    try {
      return JSON.parse(raw) as PageContent;
    } catch {
      return { type: "lesson", blocks: [] };
    }
  };

  const updatePageContent = useCallback(
    (pageId: string, newContent: PageContent) => {
      if (!book) return;
      setBook({
        ...book,
        pages: book.pages.map((p) =>
          p.id === pageId ? { ...p, content: JSON.stringify(newContent) } : p
        ),
      });
      setDirty(true);
    },
    [book]
  );

  const handleSave = async () => {
    if (!book) return;
    setSaving(true);
    try {
      // Save all pages (batch)
      await Promise.all(
        book.pages.map((p) =>
          fetch(`/api/quill/pages/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: p.title,
              content: p.content,
              type: p.type,
            }),
          })
        )
      );
      // Save book meta
      await fetch(`/api/quill/books/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: book.title, subtitle: book.subtitle, description: book.description }),
      });
      setDirty(false);
      toast.success("Saved", { description: "All pages updated." });
    } catch (err) {
      toast.error("Save failed", { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!book) return;
    if (dirty) {
      if (!confirm("You have unsaved changes. Save before exporting?")) return;
      await handleSave();
    }
    setExporting(true);
    try {
      // The export API now returns the file directly as a blob
      const res = await fetch("/api/quill/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id }),
      });

      if (!res.ok) {
        let errorMsg = "Export failed";
        try {
          const errData = await res.json();
          if (errData.error) errorMsg = errData.error;
        } catch {}
        throw new Error(errorMsg);
      }

      // Get the file as a blob and trigger download
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${book.title.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success("DOCX downloaded!", {
        description: `${(blob.size / 1024).toFixed(0)} KB`,
      });
    } catch (err) {
      toast.error("Export failed", { description: String(err) });
    } finally {
      setExporting(false);
    }
  };

  const addBlock = (type: Block["type"]) => {
    if (!activePage) return;
    const content = parsePageContent(activePage.content);
    const newBlock = createBlock(type);
    if (!newBlock) return;
    content.blocks = [...content.blocks, newBlock];
    updatePageContent(activePage.id, content);
  };

  const updateBlock = (blockId: string, updates: Partial<Block>) => {
    if (!activePage) return;
    const content = parsePageContent(activePage.content);
    content.blocks = content.blocks.map((b) =>
      b.id === blockId ? ({ ...b, ...updates } as Block) : b
    );
    updatePageContent(activePage.id, content);
  };

  const deleteBlock = (blockId: string) => {
    if (!activePage) return;
    const content = parsePageContent(activePage.content);
    content.blocks = content.blocks.filter((b) => b.id !== blockId);
    updatePageContent(activePage.id, content);
  };

  const moveBlock = (blockId: string, direction: "up" | "down") => {
    if (!activePage) return;
    const content = parsePageContent(activePage.content);
    const idx = content.blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= content.blocks.length) return;
    const blocks = [...content.blocks];
    [blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]];
    content.blocks = blocks;
    updatePageContent(activePage.id, content);
  };

  const addImageToPage = (image: { url: string; alt: string; caption?: string }) => {
    if (!activePage) return;
    const content = parsePageContent(activePage.content);
    const newBlock: Block = {
      id: makeId("img"),
      type: "image",
      url: image.url,
      alt: image.alt,
      caption: image.caption,
      width: 400,
      align: "center",
      source: "generated",
    };
    content.blocks = [...content.blocks, newBlock];
    updatePageContent(activePage.id, content);
    toast.success("Image added", { description: "Drag it up/down to reorder." });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-quill" />
        <p className="mt-3 text-sm text-muted-foreground">Loading book...</p>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-muted-foreground">Book not found.</p>
        <Button onClick={goLibrary} variant="link">
          Back to library
        </Button>
      </div>
    );
  }

  const levelInfo = LEVELS.find((l) => l.id === book.level);
  const subjectInfo = SUBJECTS.find((s) => s.id === book.subject);
  const activeContent = activePage ? parsePageContent(activePage.content) : null;

  return (
    <div className="mx-auto max-w-[1600px] px-2 py-4 sm:px-4">
      {/* Top toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goLibrary}>
            <ArrowLeft className="h-4 w-4" />
            Library
          </Button>
          <div className="hidden h-6 w-px bg-border sm:block" />
          <div className="hidden sm:block">
            <input
              value={book.title}
              onChange={(e) => {
                setBook({ ...book, title: e.target.value });
                setDirty(true);
              }}
              className="bg-transparent font-display text-lg font-bold text-foreground outline-none focus:bg-muted/40 rounded px-1 -mx-1"
            />
            <div className="text-xs text-muted-foreground">
              {levelInfo?.label} • {subjectInfo?.name} • Term {book.term} • {book.pages.length} pages
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Badge variant="outline" className="border-amber-300 bg-amber-soft text-amber-700">
              Unsaved
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="hidden sm:inline ml-1.5">Save</span>
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting} className="bg-quill text-quill-foreground hover:bg-quill/90">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline ml-1.5">Export DOCX</span>
          </Button>
        </div>
      </div>

      {/* Main 3-column layout */}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr_320px]">
        {/* LEFT: Page panel */}
        <Card className="h-[calc(100vh-160px)] overflow-hidden border-border/60">
          <div className="border-b border-border/40 bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-quill" />
              Pages ({book.pages.length})
            </div>
          </div>
          <ScrollArea className="h-[calc(100%-41px)] scrollbar-thin">
            <div className="space-y-1 p-2">
              {book.pages.map((p) => {
                const isActive = p.id === activePageId;
                const typeColors: Record<string, string> = {
                  cover: "bg-amber-100 text-amber-700",
                  toc: "bg-blue-100 text-blue-700",
                  "section-divider": "bg-purple-100 text-purple-700",
                  lesson: "bg-quill/10 text-quill",
                  exercise: "bg-pink-100 text-pink-700",
                  homework: "bg-violet-100 text-violet-700",
                  glossary: "bg-emerald-100 text-emerald-700",
                  activity: "bg-orange-100 text-orange-700",
                  closing: "bg-rose-100 text-rose-700",
                };
                return (
                  <button
                    key={p.id}
                    onClick={() => setActivePageId(p.id)}
                    className={cn(
                      "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      isActive ? "bg-quill/10 ring-1 ring-quill/30" : "hover:bg-muted"
                    )}
                  >
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold", typeColors[p.type] ?? "bg-muted")}>
                      {p.pageNumber}
                    </span>
                    <span className="flex-1 truncate text-foreground">
                      {p.title || p.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        {/* CENTER: Page canvas */}
        <div className="space-y-3">
          {activePage && activeContent ? (
            <>
              {/* Page title editor */}
              <Card className="border-border/60">
                <CardContent className="flex items-center gap-3 p-3">
                  <Badge variant="outline" className="capitalize">
                    {activePage.type}
                  </Badge>
                  <Input
                    value={activePage.title ?? ""}
                    onChange={(e) => {
                      setBook({
                        ...book,
                        pages: book.pages.map((p) =>
                          p.id === activePage.id ? { ...p, title: e.target.value } : p
                        ),
                      });
                      setDirty(true);
                    }}
                    placeholder="Page title..."
                    className="border-0 bg-transparent px-1 font-display text-lg font-bold focus-visible:ring-0"
                  />
                </CardContent>
              </Card>

              {/* Page preview */}
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 sm:p-8">
                <div className="mx-auto max-w-2xl">
                  <PagePreview page={activeContent} />
                </div>
              </div>

              {/* Blocks editor (compact list) */}
              <Card className="border-border/60">
                <CardContent className="p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {activeContent.blocks.length} block{activeContent.blocks.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {activeContent.blocks.map((b, i) => (
                      <div
                        key={b.id}
                        className="group flex items-center gap-2 rounded-md border border-border/40 bg-card px-2 py-1.5 text-xs"
                      >
                        <Badge variant="outline" className="text-[9px]">{b.type}</Badge>
                        <span className="flex-1 truncate text-muted-foreground">
                          {"text" in b && typeof b.text === "string" ? b.text.slice(0, 80)
                            : "title" in b && typeof b.title === "string" ? b.title
                            : "items" in b && Array.isArray(b.items) ? `${b.items.length} items`
                            : "alt" in b ? b.alt
                            : ""}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveBlock(b.id, "up")} disabled={i === 0}>
                            <ChevronLeft className="h-3 w-3 rotate-90" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveBlock(b.id, "down")} disabled={i === activeContent.blocks.length - 1}>
                            <ChevronRight className="h-3 w-3 -rotate-90" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600 hover:text-red-700" onClick={() => deleteBlock(b.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-muted-foreground">
              <FileText className="h-12 w-12" />
              <p className="mt-3">Select a page from the left.</p>
            </div>
          )}
        </div>

        {/* RIGHT: Add blocks + Image panel */}
        <div className="space-y-4">
          <AddBlockPanel onAdd={addBlock} />
          <ImagePanel onAddImage={addImageToPage} />
          <EditTextPanel
            activePage={activePage}
            activeContent={activeContent}
            onUpdateBlock={updateBlock}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add block panel
// ---------------------------------------------------------------------------

function createBlock(type: Block["type"]): Block | null {
  const id = makeId();
  switch (type) {
    case "heading":
      return { id, type: "heading", text: "New Heading", level: 1 };
    case "subheading":
      return { id, type: "subheading", text: "New Subheading" };
    case "paragraph":
      return { id, type: "paragraph", text: "Write your paragraph here..." };
    case "image":
      return { id, type: "image", url: "https://placehold.co/400x300/e5e7eb/9ca3af?text=Add+image", alt: "Placeholder", width: 400, align: "center" };
    case "bulleted-list":
      return { id, type: "bulleted-list", items: ["First item", "Second item", "Third item"] };
    case "numbered-list":
      return { id, type: "numbered-list", items: ["First step", "Second step", "Third step"] };
    case "table":
      return { id, type: "table", headers: ["Column 1", "Column 2", "Column 3"], rows: [["Row 1A", "Row 1B", "Row 1C"]] };
    case "fill-blanks":
      return { id, type: "fill-blanks", title: "Fill in the Blanks", instructions: "Choose the correct word from the box.", sentences: ["The _____ is blue.", "I have a _____."], wordBank: ["sky", "book"] };
    case "multiple-choice":
      return { id, type: "multiple-choice", title: "Multiple Choice", instructions: "Choose the correct answer.", questions: [{ question: "What is 2 + 2?", options: ["3", "4", "5", "6"], answerIndex: 1 }] };
    case "matching":
      return { id, type: "matching", title: "Match the Following", instructions: "Draw a line to match.", pairs: [{ left: "Apple", right: "Fruit" }, { left: "Carrot", right: "Vegetable" }] };
    case "activity":
      return { id, type: "activity", title: "Activity", instructions: "Complete the activity.", items: ["Draw and colour the picture.", "Write the name of the animal."] };
    case "tracing":
      return { id, type: "tracing", title: "Tracing Practice", items: ["A", "B", "C"] };
    case "word-bank":
      return { id, type: "word-bank", title: "Word Bank", words: ["apple", "ball", "cat"] };
    case "vocabulary":
      return { id, type: "vocabulary", title: "Key Vocabulary", words: [{ word: "Word", meaning: "Meaning here." }] };
    case "quote":
      return { id, type: "quote", text: "An inspirational quote.", attribution: "Author" };
    case "tip":
      return { id, type: "tip", title: "Tip", text: "A helpful tip for the learner." };
    case "homework":
      return { id, type: "homework", title: "Homework", instructions: "Complete at home.", items: ["Read the lesson again.", "Practise writing 5 words."] };
    case "divider":
      return { id, type: "divider" };
    case "spacer":
      return { id, type: "spacer", height: 40 };
    default:
      return null;
  }
}

function AddBlockPanel({ onAdd }: { onAdd: (type: Block["type"]) => void }) {
  const buttons: { type: Block["type"]; label: string; icon: React.ReactNode }[] = [
    { type: "heading", label: "Heading", icon: <Heading1 className="h-4 w-4" /> },
    { type: "subheading", label: "Subheading", icon: <Heading2 className="h-4 w-4" /> },
    { type: "paragraph", label: "Paragraph", icon: <Type className="h-4 w-4" /> },
    { type: "bulleted-list", label: "Bullet List", icon: <List className="h-4 w-4" /> },
    { type: "numbered-list", label: "Numbered List", icon: <ListOrdered className="h-4 w-4" /> },
    { type: "table", label: "Table", icon: <TableIcon className="h-4 w-4" /> },
    { type: "fill-blanks", label: "Fill Blanks", icon: <Edit3 className="h-4 w-4" /> },
    { type: "multiple-choice", label: "Multi Choice", icon: <HelpCircle className="h-4 w-4" /> },
    { type: "matching", label: "Matching", icon: <Sparkles className="h-4 w-4" /> },
    { type: "tracing", label: "Tracing", icon: <Type className="h-4 w-4" /> },
    { type: "word-bank", label: "Word Bank", icon: <BookOpen className="h-4 w-4" /> },
    { type: "vocabulary", label: "Vocabulary", icon: <BookOpen className="h-4 w-4" /> },
    { type: "tip", label: "Tip Box", icon: <Sparkles className="h-4 w-4" /> },
    { type: "quote", label: "Quote", icon: <Type className="h-4 w-4" /> },
    { type: "homework", label: "Homework", icon: <Edit3 className="h-4 w-4" /> },
    { type: "activity", label: "Activity", icon: <Edit3 className="h-4 w-4" /> },
    { type: "divider", label: "Divider", icon: <Plus className="h-4 w-4" /> },
  ];
  return (
    <Card className="border-border/60">
      <CardContent className="p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4 text-quill" />
          Add block
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {buttons.map((b) => (
            <Button
              key={b.type}
              size="sm"
              variant="outline"
              onClick={() => onAdd(b.type)}
              className="h-9 justify-start text-xs"
            >
              {b.icon}
              <span className="ml-1.5 truncate">{b.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Image panel — generate via Pollinations, search via z-ai
// ---------------------------------------------------------------------------

function ImagePanel({ onAddImage }: { onAddImage: (img: { url: string; alt: string; caption?: string }) => void }) {
  const [tab, setTab] = useState<"generate" | "search">("generate");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/quill/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          width,
          height,
          model: "flux",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      // Pollinations returns the URL directly — instant. The image itself renders on-demand.
      setResults([
        {
          url: data.image.url,
          alt: prompt,
          caption: prompt.slice(0, 60),
        },
        ...results,
      ]);
      toast.success("Image generated", { description: "Click the image to add it to the page." });
    } catch (err) {
      toast.error("Generation failed", { description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!prompt.trim()) {
      toast.error("Enter a search query first");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/quill/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, source: "search" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");

      if (data.images && data.images.length > 0) {
        setResults(data.images);
        toast.success(`Found ${data.images.length} images`);
      } else {
        // Fallback: web search returned nothing — generate an image based on the
        // search query instead. This is common when z-ai's image search is unavailable.
        toast.info("Web search returned no images. Generating an illustration based on your query instead...");
        const genRes = await fetch("/api/quill/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, width: 1024, height: 1024, model: "flux" }),
        });
        const genData = await genRes.json();
        if (!genRes.ok || genData.error) throw new Error(genData.error ?? "Generation failed");
        setResults([
          {
            url: genData.image.url,
            alt: prompt,
            caption: `Generated: ${prompt.slice(0, 60)}`,
          },
        ]);
      }
    } catch (err) {
      toast.error("Search failed", { description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/60">
      <CardContent className="p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ImageIcon className="h-4 w-4 text-quill" />
          Illustrations
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "generate" | "search")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate" className="text-xs">
              <Wand2 className="mr-1 h-3 w-3" /> Generate
            </TabsTrigger>
            <TabsTrigger value="search" className="text-xs">
              <Search className="mr-1 h-3 w-3" /> Web
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="mt-3 space-y-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A colourful cartoon of a Ghanaian child reading a book under a mango tree..."
              className="text-xs"
              rows={3}
            />
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Size:</span>
              <select
                value={`${width}x${height}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split("x").map(Number);
                  setWidth(w);
                  setHeight(h);
                }}
                className="rounded-md border border-border bg-background px-2 py-1"
              >
                <option value="1024x1024">Square 1:1</option>
                <option value="1024x768">Landscape 4:3</option>
                <option value="768x1024">Portrait 3:4</option>
                <option value="1280x720">Wide 16:9</option>
              </select>
            </div>
            <Button onClick={handleGenerate} disabled={loading} className="w-full bg-quill text-quill-foreground hover:bg-quill/90" size="sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Generate image
            </Button>
          </TabsContent>

          <TabsContent value="search" className="mt-3 space-y-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Search for: butterfly life cycle diagram, Ghana map, Kwame Nkrumah..."
              className="text-xs"
              rows={3}
            />
            <Button onClick={handleSearch} disabled={loading} className="w-full" size="sm" variant="outline">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search the web
            </Button>
          </TabsContent>
        </Tabs>

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto scrollbar-thin border-t border-border/40 pt-3">
            {results.map((img, i) => (
              <div key={i} className="group relative overflow-hidden rounded-md border border-border/40">
                <img
                  src={img.url}
                  alt={img.alt}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="sm"
                    onClick={() => onAddImage(img)}
                    className="m-2 bg-quill text-quill-foreground hover:bg-quill/90"
                  >
                    <Plus className="h-3 w-3" /> Add to page
                  </Button>
                </div>
                <div className="bg-muted/60 px-2 py-1 text-[10px] text-muted-foreground line-clamp-1">
                  {img.alt}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Edit text panel — quick inline editing of the active page's blocks
// ---------------------------------------------------------------------------

function EditTextPanel({
  activePage,
  activeContent,
  onUpdateBlock,
}: {
  activePage: { id: string; title: string | null; content: string } | null;
  activeContent: PageContent | null;
  onUpdateBlock: (blockId: string, updates: Partial<Block>) => void;
}) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  if (!activeContent || activeContent.blocks.length === 0) return null;

  return (
    <Card className="border-border/60">
      <CardContent className="p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Edit3 className="h-4 w-4 text-quill" />
          Edit blocks
        </div>
        <ScrollArea className="max-h-72 scrollbar-thin">
          <div className="space-y-2">
            {activeContent.blocks.map((b) => (
              <div key={b.id} className="rounded-md border border-border/40 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <Badge variant="outline" className="text-[9px]">
                    {b.type}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={() => setEditingBlockId(editingBlockId === b.id ? null : b.id)}
                  >
                    {editingBlockId === b.id ? <X className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
                  </Button>
                </div>
                {editingBlockId === b.id ? (
                  <BlockEditor block={b} onUpdate={(u) => onUpdateBlock(b.id, u)} />
                ) : (
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {"text" in b ? b.text
                      : "title" in b ? b.title
                      : "items" in b ? `${b.items.length} items`
                      : "alt" in b ? b.alt
                      : "—"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function BlockEditor({ block, onUpdate }: { block: Block; onUpdate: (updates: Partial<Block>) => void }) {
  // For brevity, only show the most common editable fields.
  const update = (key: string, value: unknown) => onUpdate({ [key]: value } as Partial<Block>);

  if (block.type === "heading" || block.type === "subheading" || block.type === "paragraph" || block.type === "image-caption" || block.type === "quote") {
    return (
      <Textarea
        value={(block as { text: string }).text}
        onChange={(e) => update("text", e.target.value)}
        className="text-xs"
        rows={3}
      />
    );
  }
  if (block.type === "image") {
    return (
      <div className="space-y-1.5">
        <Input
          value={block.url}
          onChange={(e) => update("url", e.target.value)}
          className="text-xs"
          placeholder="Image URL"
        />
        <Input
          value={block.alt}
          onChange={(e) => update("alt", e.target.value)}
          className="text-xs"
          placeholder="Alt text"
        />
        <Input
          value={block.caption ?? ""}
          onChange={(e) => update("caption", e.target.value)}
          className="text-xs"
          placeholder="Caption (optional)"
        />
        <div className="flex gap-2">
          <Input
            type="number"
            value={block.width ?? 400}
            onChange={(e) => update("width", parseInt(e.target.value) || 400)}
            className="text-xs"
            placeholder="Width"
          />
          <select
            value={block.align ?? "center"}
            onChange={(e) => update("align", e.target.value as "left" | "center" | "right")}
            className="rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>
    );
  }
  if (block.type === "tip") {
    return (
      <div className="space-y-1.5">
        <Input
          value={block.title ?? ""}
          onChange={(e) => update("title", e.target.value)}
          className="text-xs"
          placeholder="Title"
        />
        <Textarea
          value={block.text}
          onChange={(e) => update("text", e.target.value)}
          className="text-xs"
          rows={3}
        />
      </div>
    );
  }
  if (block.type === "bulleted-list" || block.type === "numbered-list") {
    return (
      <Textarea
        value={block.items.join("\n")}
        onChange={(e) => update("items", e.target.value.split("\n").filter(Boolean))}
        className="text-xs"
        rows={4}
        placeholder="One item per line"
      />
    );
  }
  if ("title" in block && typeof block.title === "string") {
    return (
      <Input
        value={block.title}
        onChange={(e) => update("title", e.target.value)}
        className="text-xs"
        placeholder="Title"
      />
    );
  }
  return <div className="text-xs text-muted-foreground">No quick editor for this block type.</div>;
}
