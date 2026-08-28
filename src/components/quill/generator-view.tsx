"use client";

import { useEffect, useMemo, useState } from "react";
import { LEVELS, SUBJECTS, LevelId, subjectsForLevel } from "@/lib/curriculum";
import { useQuillStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  BookOpen,
  Calendar,
  ListChecks,
  Wand2,
  Loader2,
  Globe,
  Search,
  FileText,
  Layers,
  Zap,
  Minimize2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

interface GeneratedPage {
  pageIndex: number;
  pageType: string;
  pageTitle?: string;
  page?: { type: string; title?: string; blocks: unknown[] };
}

// Mirror of the condensing logic in src/lib/generator.ts (kept here for the
// live UI preview). The server is the source of truth — this is just for
// showing the user what will happen before they click Generate.
const FIXED_PAGES = 4;
type Mode = "full" | "condensed" | "compact";
interface Plan {
  mode: Mode;
  lessons: number;
  totalPages: number;
  sections: number;
  description: string;
}
function computePlan(targetPages: number | null, topicCount: number, useSections: boolean): Plan {
  if (!targetPages || topicCount === 0) {
    const sections = useSections ? Math.max(1, Math.ceil(topicCount / 3)) : 0;
    return {
      mode: "full",
      lessons: topicCount,
      totalPages: FIXED_PAGES + 3 * topicCount + (useSections ? sections : 0),
      sections,
      description: useSections
        ? `Section-based layout: ${sections} section${sections !== 1 ? "s" : ""}, each with ~3 lessons. Full mode (3 pages per lesson: lesson + exercise + homework).`
        : "No page limit — full mode (3 pages per lesson).",
    };
  }
  const available = Math.max(0, targetPages - FIXED_PAGES - (useSections ? Math.ceil(topicCount / 3) : 0));
  if (available >= 3 * topicCount) {
    const sections = useSections ? Math.max(1, Math.ceil(topicCount / 3)) : 0;
    return { mode: "full", lessons: topicCount, totalPages: FIXED_PAGES + 3 * topicCount + sections, sections, description: "Full mode — each lesson gets a lesson page, exercise, and homework." };
  }
  if (available >= 2 * topicCount) {
    const sections = useSections ? Math.max(1, Math.ceil(topicCount / 3)) : 0;
    return { mode: "condensed", lessons: topicCount, totalPages: FIXED_PAGES + 2 * topicCount + sections, sections, description: "Condensed mode — each lesson gets a lesson page + a combined practice & homework page." };
  }
  if (available >= topicCount) {
    const sections = useSections ? Math.max(1, Math.ceil(topicCount / 3)) : 0;
    return { mode: "compact", lessons: topicCount, totalPages: FIXED_PAGES + topicCount + sections, sections, description: "Compact mode — each lesson is a single page with an embedded exercise." };
  }
  const fit = Math.max(1, available);
  return { mode: "compact", lessons: fit, totalPages: FIXED_PAGES + fit, sections: useSections ? Math.max(1, Math.ceil(fit / 3)) : 0, description: `Compact mode (truncated) — only ${fit} of ${topicCount} topics fit in ${targetPages} pages.` };
}

const MODE_META: Record<Mode, { label: string; icon: React.ReactNode; color: string }> = {
  full: { label: "Full", icon: <Layers className="h-3.5 w-3.5" />, color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  condensed: { label: "Condensed", icon: <Zap className="h-3.5 w-3.5" />, color: "bg-amber-100 text-amber-700 border-amber-300" },
  compact: { label: "Compact", icon: <Minimize2 className="h-3.5 w-3.5" />, color: "bg-rose-100 text-rose-700 border-rose-300" },
};

export function GeneratorView() {
  const { openEditor, goLibrary } = useQuillStore();
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [level, setLevel] = useState<LevelId>("B3");
  // Step 2
  const [subject, setSubject] = useState<string>("english");
  // Step 3
  const [term, setTerm] = useState<1 | 2 | 3>(1);
  // Step 4
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [customTopics, setCustomTopics] = useState<string>("");
  const [lessons, setLessons] = useState<number>(3);
  const [research, setResearch] = useState<boolean>(true);
  const [targetPages, setTargetPages] = useState<number>(20);
  const [useTargetPages, setUseTargetPages] = useState<boolean>(false);
  const [useSections, setUseSections] = useState<boolean>(true);

  // Reset topics when subject/term/level changes
  useEffect(() => {
    setSelectedTopics([]);
  }, [subject, term]);

  const availableSubjects = useMemo(() => subjectsForLevel(level), [level]);
  const currentSubject = useMemo(
    () => SUBJECTS.find((s) => s.id === subject) ?? SUBJECTS[0],
    [subject]
  );
  const availableTopics = useMemo(
    () => currentSubject.topics[term] ?? [],
    [currentSubject, term]
  );

  // Auto-select subject if it's not available for the level
  useEffect(() => {
    if (!availableSubjects.find((s) => s.id === subject)) {
      setSubject(availableSubjects[0]?.id ?? "english");
    }
  }, [availableSubjects, subject]);

  // Combine curriculum topics + custom topics
  const allTopics = useMemo(() => {
    const custom = customTopics
      .split("\n")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return [...selectedTopics, ...custom];
  }, [selectedTopics, customTopics]);

  // Live condensing plan preview
  const plan = useMemo(
    () => computePlan(useTargetPages ? targetPages : null, allTopics.length, useSections),
    [useTargetPages, targetPages, allTopics.length, useSections]
  );

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ message: string; pageIndex?: number; totalPages?: number }>({
    message: "",
  });
  const [generatedPages, setGeneratedPages] = useState<GeneratedPage[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [bookMeta, setBookMeta] = useState<{ title: string; subtitle: string; description: string } | null>(null);

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const canProceed = () => {
    if (step === 1) return !!level;
    if (step === 2) return !!subject;
    if (step === 3) return !!term;
    if (step === 4) return allTopics.length > 0;
    return true;
  };

  const startGeneration = async () => {
    setGenerating(true);
    setProgress({ message: "Starting generation..." });
    setGeneratedPages([]);
    setBookId(null);
    setBookMeta(null);

    let localBookId: string | null = null;
    let localPageCount = 0;
    let hadError = false;

    try {
      const res = await fetch("/api/quill/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          subject,
          term,
          topics: allTopics,
          lessons,
          research: false, // Always disable research for speed
          targetPages: useTargetPages ? targetPages : undefined,
          useSections: false, // Always disable sections for speed
        }),
      });

      // Check if the response is an error JSON (not SSE stream)
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || contentType.includes("application/json")) {
        let errorMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errorMsg = errData.error;
        } catch {
          // Response wasn't JSON
        }
        throw new Error(errorMsg);
      }
      if (!res.body) throw new Error("No response body");

      // Read the SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split on double newline (SSE event delimiter)
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const evt of events) {
          const lines = evt.split("\n");
          let eventType = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr = line.slice(5).trim();
            }
          }
          if (!eventType || !dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            if (eventType === "book-created") localBookId = data.bookId as string;
            if (eventType === "page-done") localPageCount++;
            if (eventType === "error") hadError = true;

            // Handle events
            if (eventType === "book-created") {
              setBookId(data.bookId as string);
              setProgress({ message: "Creating book..." });
            } else if (eventType === "book-meta") {
              setBookMeta({ title: data.title, subtitle: data.subtitle, description: data.description });
              setProgress({ message: `Generating: ${data.title}` });
            } else if (eventType === "page-start") {
              setProgress({ message: `Generating page ${(data.pageIndex ?? 0) + 1}: ${data.pageTitle ?? ""}`, pageIndex: data.pageIndex });
            } else if (eventType === "page-done") {
              setGeneratedPages((prev) => [...prev, { pageIndex: data.pageIndex, pageType: data.pageType, pageTitle: data.pageTitle }]);
            } else if (eventType === "log") {
              setProgress({ message: data.message });
            } else if (eventType === "complete") {
              setProgress({ message: "Complete!" });
            } else if (eventType === "error") {
              toast.error("Generation error", { description: data.message });
            }
          } catch (parseErr) {
            console.error("SSE parse error:", parseErr, "data:", dataStr);
          }
        }
      }

      if (hadError) {
        throw new Error("Generation encountered an error. Please try again.");
      }
      if (localPageCount === 0) {
        throw new Error("Generation produced no pages. Please try again.");
      }

      setProgress({ message: "Book ready!" });
      toast.success("Book generated!", { description: `${localPageCount} pages created. Opening editor...` });
      if (localBookId) {
        setTimeout(() => openEditor(localBookId), 1000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Generation failed", { description: message });
      setProgress({ message: `Error: ${message}` });
    } finally {
      setGenerating(false);
    }
  };

  // Unused — kept for compatibility
  const handleSSE = (_event: string, _data: Record<string, unknown>) => {};

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {[
            { num: 1, label: "Level", icon: <GraduationCap className="h-3.5 w-3.5" /> },
            { num: 2, label: "Subject", icon: <BookOpen className="h-3.5 w-3.5" /> },
            { num: 3, label: "Term", icon: <Calendar className="h-3.5 w-3.5" /> },
            { num: 4, label: "Topics", icon: <ListChecks className="h-3.5 w-3.5" /> },
          ].map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  step === s.num
                    ? "bg-quill text-quill-foreground"
                    : step > s.num
                    ? "bg-quill/10 text-quill"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step > s.num ? <Check className="h-3.5 w-3.5" /> : s.icon}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < 3 && <div className="mx-1 h-px w-4 bg-border sm:w-8" />}
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: LEVEL */}
      {step === 1 && (
        <div className="animate-quill-fade-up space-y-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">Choose the class level</h2>
            <p className="mt-1 text-muted-foreground">
              The level determines vocabulary, sentence length, illustration style, and font size in the exported book.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLevel(l.id)}
                className={cn(
                  "group flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                  level === l.id
                    ? "border-quill bg-quill/5 ring-2 ring-quill/20"
                    : "border-border bg-card hover:border-quill/40"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-display text-xl font-bold text-quill">{l.label}</span>
                  {level === l.id && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-quill text-quill-foreground">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-foreground">{l.fullLabel}</span>
                <span className="text-xs text-muted-foreground">{l.ageRange}</span>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{l.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: SUBJECT */}
      {step === 2 && (
        <div className="animate-quill-fade-up space-y-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">Choose a subject</h2>
            <p className="mt-1 text-muted-foreground">
              Subjects available for {LEVELS.find((l) => l.id === level)?.fullLabel}.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {availableSubjects.map((s) => (
              <button
                key={s.id}
                onClick={() => setSubject(s.id)}
                className={cn(
                  "group flex items-center justify-between rounded-xl border-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                  subject === s.id
                    ? "border-quill bg-quill/5 ring-2 ring-quill/20"
                    : "border-border bg-card hover:border-quill/40"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-quill/10 font-display text-xl font-bold text-quill">
                    {s.name[0]}
                  </span>
                  <div>
                    <div className="font-semibold text-foreground">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.topics[1].length + s.topics[2].length + s.topics[3].length} topics across 3 terms
                    </div>
                  </div>
                </div>
                {subject === s.id && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-quill text-quill-foreground">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: TERM */}
      {step === 3 && (
        <div className="animate-quill-fade-up space-y-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">Choose the term</h2>
            <p className="mt-1 text-muted-foreground">
              Each term has its own set of curriculum topics. The book will cover only the selected term.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {([1, 2, 3] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTerm(t)}
                className={cn(
                  "group flex flex-col items-start gap-2 rounded-xl border-2 p-6 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                  term === t
                    ? "border-quill bg-quill/5 ring-2 ring-quill/20"
                    : "border-border bg-card hover:border-quill/40"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-display text-4xl font-bold text-quill">{t}</span>
                  {term === t && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-quill text-quill-foreground">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <span className="font-medium text-foreground">Term {t}</span>
                <span className="text-xs text-muted-foreground">
                  {currentSubject.topics[t].length} topics available
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 4: TOPICS */}
      {step === 4 && (
        <div className="animate-quill-fade-up space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-foreground">Pick the topics</h2>
              <p className="mt-1 text-muted-foreground">
                Selected: {allTopics.length} topic{allTopics.length !== 1 ? "s" : ""} ({selectedTopics.length} from curriculum + {allTopics.length - selectedTopics.length} custom).
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedTopics(availableTopics.slice())}>
                Select all curriculum
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedTopics([]); setCustomTopics(""); }}>
                Clear all
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {availableTopics.map((topic, i) => {
              const checked = selectedTopics.includes(topic);
              return (
                <label
                  key={topic}
                  htmlFor={`topic-${i}`}
                  className={cn(
                    "group flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-all hover:border-quill/40",
                    checked ? "border-quill bg-quill/5" : "border-border bg-card"
                  )}
                >
                  <Checkbox
                    id={`topic-${i}`}
                    checked={checked}
                    onCheckedChange={() => toggleTopic(topic)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-foreground">{topic}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Lesson {i + 1}
                  </Badge>
                </label>
              );
            })}
          </div>

          {/* Custom topics input */}
          <Card className="border-amber-300/60 bg-amber-soft/30">
            <CardContent className="p-4">
              <Label htmlFor="custom-topics" className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <Plus className="h-4 w-4 text-amber-600" />
                Add your own topics
              </Label>
              <p className="mb-2 text-xs text-muted-foreground">
                Type one topic per line. These will be added to the curriculum topics you selected above.
              </p>
              <Textarea
                id="custom-topics"
                value={customTopics}
                onChange={(e) => setCustomTopics(e.target.value)}
                placeholder={"e.g. The water cycle\nGhanaian independence leaders\nFractions in everyday life"}
                className="min-h-[100px] text-sm"
              />
              {customTopics.trim() && (
                <p className="mt-2 text-xs text-amber-700">
                  {customTopics.split("\n").filter((t) => t.trim()).length} custom topic(s) added
                </p>
              )}
            </CardContent>
          </Card>

          {/* Page count + condensing plan */}
          <Card className="border-quill/20 bg-quill/5">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3 border-b border-quill/10 pb-3">
                <div className="space-y-0.5">
                  <Label htmlFor="target-toggle" className="flex items-center gap-1.5 text-sm font-medium">
                    <FileText className="h-4 w-4 text-quill" />
                    Limit total pages
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Set a target page count. Quill will automatically condense the book to fit (full → condensed → compact).
                  </p>
                </div>
                <Switch id="target-toggle" checked={useTargetPages} onCheckedChange={setUseTargetPages} />
              </div>

              {useTargetPages && (
                <div className="space-y-2">
                  <Label className="flex items-center justify-between text-sm font-medium">
                    <span>Target page count</span>
                    <span className="font-bold text-quill">{targetPages ?? 20} pages</span>
                  </Label>
                  <input
                    type="range"
                    min={6}
                    max={100}
                    value={targetPages ?? 20}
                    onChange={(e) => setTargetPages(parseInt(e.target.value))}
                    className="w-full accent-quill"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>6 (1 lesson, compact)</span>
                    <span>100 (full book)</span>
                  </div>
                </div>
              )}

              {/* Live condensing plan preview */}
              {selectedTopics.length > 0 && (
                <div className="rounded-lg border border-quill/20 bg-white/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Generation plan</span>
                    <Badge variant="outline" className={cn("text-[10px]", MODE_META[plan.mode].color)}>
                      {MODE_META[plan.mode].icon}
                      <span className="ml-1">{MODE_META[plan.mode].label}</span>
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{plan.description}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">
                      Lessons: <span className="font-semibold text-foreground">{plan.lessons}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Fixed pages: <span className="font-semibold text-foreground">{FIXED_PAGES}</span>
                      <span className="text-muted-foreground/70"> (cover, TOC, glossary, closing)</span>
                    </span>
                    <span className="text-muted-foreground">
                      Total: <span className="font-bold text-quill">{plan.totalPages} pages</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Lessons slider — only shown when NOT using target pages */}
              {!useTargetPages && (
                <div className="border-t border-quill/10 pt-3">
                  <Label className="mb-2 block text-sm font-medium">
                    Number of lessons to generate: <span className="font-bold text-quill">{lessons}</span>
                  </Label>
                  <input
                    type="range"
                    min={1}
                    max={Math.min(8, selectedTopics.length || availableTopics.length)}
                    value={lessons}
                    onChange={(e) => setLessons(parseInt(e.target.value))}
                    className="w-full accent-quill"
                  />
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>1 lesson (3 pages)</span>
                    <span>{Math.min(8, selectedTopics.length || availableTopics.length)} lessons</span>
                  </div>
                </div>
              )}

              {/* Research toggle */}
              <div className="flex items-start justify-between gap-3 border-t border-quill/10 pt-3">
                <div className="space-y-0.5">
                  <Label htmlFor="research-toggle" className="flex items-center gap-1.5 text-sm font-medium">
                    <Globe className="h-4 w-4 text-quill" />
                    Research the web first
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Quill searches & scrapes authoritative sources to ground each lesson in real content. Slower but higher quality.
                  </p>
                </div>
                <Switch id="research-toggle" checked={research} onCheckedChange={setResearch} />
              </div>

              {/* Sections toggle */}
              <div className="flex items-start justify-between gap-3 border-t border-quill/10 pt-3">
                <div className="space-y-0.5">
                  <Label htmlFor="sections-toggle" className="flex items-center gap-1.5 text-sm font-medium">
                    <Layers className="h-4 w-4 text-quill" />
                    Organize into sections (units)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Group every ~3 lessons into a named section with its own divider page. Makes the book easier to navigate.
                  </p>
                </div>
                <Switch id="sections-toggle" checked={useSections} onCheckedChange={setUseSections} />
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="bg-amber-soft/40 border-amber-300/60">
            <CardContent className="p-5">
              <h3 className="mb-2 font-display font-semibold text-foreground">Summary</h3>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Level:</span>
                  <span className="font-medium">{LEVELS.find((l) => l.id === level)?.fullLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subject:</span>
                  <span className="font-medium">{currentSubject.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Term:</span>
                  <span className="font-medium">Term {term}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Topics (curriculum + custom):</span>
                  <span className="font-medium">{allTopics.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mode:</span>
                  <span className="font-medium capitalize">{plan.mode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sections:</span>
                  <span className="font-medium">{useSections ? `${plan.sections} section(s)` : "None"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated pages:</span>
                  <span className="font-medium">{plan.totalPages}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Web research:</span>
                  <span className="font-medium">{research ? "On" : "Off"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Page limit:</span>
                  <span className="font-medium">{useTargetPages ? `${targetPages} pages` : "No limit"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Generation progress */}
          {generating && (
            <Card className="border-blue-300 shadow-lg">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-700" />
                  <div className="flex-1">
                    <div className="font-medium text-blue-950">{progress.message || "Working..."}</div>
                    {bookMeta && (
                      <div className="text-xs text-blue-600">
                        {bookMeta.title} — {bookMeta.subtitle}
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-blue-900">
                      {generatedPages.length} of {plan.totalPages} pages
                    </span>
                    <span className="text-blue-600">
                      {Math.round((generatedPages.length / Math.max(plan.totalPages, 1)) * 100)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-blue-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-800 transition-all duration-500 ease-out"
                      style={{
                        width: `${Math.min((generatedPages.length / Math.max(plan.totalPages, 1)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {generatedPages.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-blue-600">
                      <span className="font-medium">Pages generated</span>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2 max-h-48 overflow-y-auto scrollbar-thin">
                      {generatedPages.map((p) => (
                        <div
                          key={p.pageIndex}
                          className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50/50 px-2 py-1.5 text-xs"
                        >
                          <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
                          <span className="flex-1 truncate text-blue-800">
                            Page {p.pageIndex + 1}: {p.pageTitle}
                          </span>
                          <Badge variant="outline" className="text-[9px] border-blue-200 text-blue-600">
                            {p.pageType}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between border-t border-border/60 pt-6">
        <Button
          variant="ghost"
          onClick={() => (step > 1 ? setStep((step - 1) as Step) : useQuillStore.getState().goHome())}
          disabled={generating}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step > 1 ? "Back" : "Home"}
        </Button>

        {step < 4 ? (
          <Button onClick={() => setStep((step + 1) as Step)} disabled={!canProceed()} className="bg-quill text-quill-foreground hover:bg-quill/90">
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={startGeneration}
            disabled={generating || allTopics.length === 0}
            className="bg-quill text-quill-foreground hover:bg-quill/90"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Generate book ({plan.totalPages} pages)
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
