"use client";

import { useQuillStore } from "@/lib/store";
import { LEVELS, SUBJECTS } from "@/lib/curriculum";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  BookOpen,
  Image as ImageIcon,
  Globe,
  Download,
  Edit3,
  Clock,
  Shield,
  Languages,
  Layers,
  Wand2,
  ArrowRight,
  Feather,
  GraduationCap,
  Search,
} from "lucide-react";

export function HomeView() {
  const goGenerator = useQuillStore((s) => s.goGenerator);
  const goLibrary = useQuillStore((s) => s.goLibrary);

  return (
    <div className="animate-quill-fade-up">
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-soft via-background to-quill/5">
        {/* Decorative background dots */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, oklch(0.7 0.06 195 / 0.25) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Decorative gradient blobs */}
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-gradient-to-br from-amber-300/30 to-quill/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-gradient-to-tr from-quill/20 to-amber-200/30 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <Badge className="mb-4 inline-flex items-center gap-1.5 bg-quill/10 text-quill hover:bg-quill/15">
                <Sparkles className="h-3.5 w-3.5" />
                AI-powered textbook generation
              </Badge>
              <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                <span className="text-quill">Quill</span> brings intelligent
                <br />
                education to life.
              </h1>
              <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
                Generate complete, illustrated textbooks for Ghanaian basic schools — from{" "}
                <span className="font-semibold text-foreground">KG1 to JHS3</span>. Every subject, every term,
                with exercises, homework, and beautiful illustrations that match each class level.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  onClick={goGenerator}
                  className="h-12 bg-quill text-quill-foreground hover:bg-quill/90"
                >
                  <Wand2 className="mr-2 h-5 w-5" />
                  Create a book
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={goLibrary}
                  className="h-12 border-quill/30 text-quill hover:bg-quill/5"
                >
                  <BookOpen className="mr-2 h-5 w-5" />
                  Browse library
                </Button>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-quill" /> GES curriculum aligned
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Languages className="h-4 w-4 text-quill" /> English (Ghanaian)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-quill" /> No timeouts
                </span>
              </div>
            </div>

            {/* Hero illustration: preview of a generated page */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-quill/10 to-amber-300/20 blur-2xl" />
              <div className="relative aspect-[3/4] rotate-2 overflow-hidden rounded-2xl border border-border/60 bg-white shadow-2xl transition-transform hover:rotate-0">
                <div className="border-b-2 border-dashed border-amber-400/60 bg-amber-soft/60 px-4 py-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-bold text-quill">Quill • KG 2 English</span>
                    <span className="text-muted-foreground">Term 1</span>
                  </div>
                  <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
                    <span>Name: _______________</span>
                    <span>Date: ____________</span>
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-quill px-3 py-1 text-xs font-bold text-quill-foreground">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-quill">1</span>
                    FRUITS NAME
                  </div>
                  <p className="text-xs text-muted-foreground">Look at the pictures and write the names.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {["🍎", "🍌", "🍇", "🍊", "🥭", "🍉"].map((emoji, i) => (
                      <div key={i} className="flex flex-col items-center gap-1 rounded-lg bg-muted/40 p-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-xl">
                          {emoji}
                        </div>
                        <div className="h-px w-8 border-b border-dashed border-muted-foreground/50" />
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border-2 border-pink-300 bg-pink-50/50 p-2">
                    <div className="inline-flex items-center gap-2 text-xs font-bold text-pink-600">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-white">2</span>
                      WORD FAMILIES
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">Circle the correct word for each.</p>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 -left-4 flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-border/60">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-soft">
                  <Feather className="h-4 w-4 text-quill" />
                </span>
                <div className="text-xs">
                  <div className="font-semibold text-foreground">Great Work!</div>
                  <div className="text-muted-foreground">Keep it up!</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-10 text-center">
          <Badge variant="outline" className="mb-3 border-quill/30 text-quill">
            Everything in one place
          </Badge>
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            A complete textbook studio in your browser
          </h2>
          <p className="mt-3 text-muted-foreground">
            Generate, research, illustrate, edit, and export — without leaving Quill.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: <Wand2 className="h-5 w-5" />,
              title: "Class-level aware generation",
              body: "KG1 gets colourful picture-heavy pages; JHS3 gets structured paragraphs and exam-style questions. The system adapts vocabulary, sentence length, and illustration style per level.",
              accent: "from-quill to-teal-500",
            },
            {
              icon: <ImageIcon className="h-5 w-5" />,
              title: "Free image generation",
              body: "Every illustration is generated with Pollinations.ai (Flux) — a free image API that needs no key. We also fall back to Z.ai image generation, and you can pull real images from the web.",
              accent: "from-amber-500 to-orange-500",
            },
            {
              icon: <Globe className="h-5 w-5" />,
              title: "Web research built-in",
              body: "Quill scrapes authoritative sources to ground each lesson in real, up-to-date content. Topics are researched before content is generated, then cited in the teaching notes.",
              accent: "from-pink-500 to-rose-500",
            },
            {
              icon: <Edit3 className="h-5 w-5" />,
              title: "Fully editable",
              body: "Drag, drop, type, replace. The in-browser editor lets you tweak any block — paragraph, image, activity, table — and see the result instantly. No re-generation needed.",
              accent: "from-violet-500 to-purple-500",
            },
            {
              icon: <Download className="h-5 w-5" />,
              title: "DOCX export, A4 ready",
              body: "One click exports to a Word document — A4 page size, kid-friendly fonts, embedded images, headers, footers, page numbers. Ready to print, share, or hand to a teacher.",
              accent: "from-emerald-500 to-green-500",
            },
            {
              icon: <Layers className="h-5 w-5" />,
              title: "Whole-term books",
              body: "Each book covers a full term: cover, table of contents, lessons, exercises, homework, glossary, and a closing page. Pick the topics; Quill builds the rest.",
              accent: "from-blue-500 to-indigo-500",
            },
          ].map((f, i) => (
            <Card
              key={i}
              className="group relative overflow-hidden border-border/60 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <CardContent className="p-6">
                <div
                  className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.accent} text-white shadow-sm transition-transform group-hover:scale-110`}
                >
                  {f.icon}
                </div>
                <h3 className="mb-2 font-display text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* LEVELS */}
      <section className="bg-muted/30 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <Badge variant="outline" className="mb-3 border-quill/30 text-quill">
              <GraduationCap className="mr-1 h-3.5 w-3.5" />
              KG1 → JHS3
            </Badge>
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
              Every level of Ghanaian basic school
            </h2>
            <p className="mt-3 text-muted-foreground">
              From Kindergarten to BECE preparation — content, illustrations, and activities tuned for each age.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {LEVELS.map((level) => {
              const bgColors = [
                "from-rose-100 to-pink-50",
                "from-amber-100 to-yellow-50",
                "from-emerald-100 to-teal-50",
                "from-blue-100 to-sky-50",
                "from-violet-100 to-purple-50",
                "from-orange-100 to-amber-50",
              ];
              const color = bgColors[LEVELS.indexOf(level) % bgColors.length];
              return (
                <button
                  key={level.id}
                  onClick={goGenerator}
                  className={`group flex flex-col items-start gap-1 rounded-xl bg-gradient-to-br ${color} p-4 text-left ring-1 ring-inset ring-border/40 transition-all hover:ring-quill/40 hover:shadow-md hover:-translate-y-0.5`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-display text-xl font-bold text-quill">{level.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-quill/40 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <span className="text-xs font-medium text-foreground/80">{level.fullLabel}</span>
                  <span className="text-[10px] text-muted-foreground">{level.ageRange}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* SUBJECTS */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-10 text-center">
          <Badge variant="outline" className="mb-3 border-quill/30 text-quill">
            <BookOpen className="mr-1 h-3.5 w-3.5" />
            GES subjects
          </Badge>
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            All basic-school subjects covered
          </h2>
          <p className="mt-3 text-muted-foreground">
            English, Mathematics, Science, Our World Our People, RME, Computing, Creative Arts, French and Career Tech.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUBJECTS.map((subject, i) => {
            const colors = [
              "text-rose-600 bg-rose-50",
              "text-amber-600 bg-amber-50",
              "text-emerald-600 bg-emerald-50",
              "text-blue-600 bg-blue-50",
              "text-violet-600 bg-violet-50",
              "text-orange-600 bg-orange-50",
              "text-pink-600 bg-pink-50",
              "text-teal-600 bg-teal-50",
              "text-purple-600 bg-purple-50",
            ];
            return (
              <button
                key={subject.id}
                onClick={goGenerator}
                className="group flex items-center justify-between rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:border-quill/30 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors[i % colors.length]} font-display font-bold`}>
                    {subject.name[0]}
                  </span>
                  <div>
                    <div className="font-semibold text-foreground">{subject.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {subject.topics[1].length + subject.topics[2].length + subject.topics[3].length} topics across 3 terms
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-quill" />
              </button>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-gradient-to-br from-quill/5 to-amber-soft/40 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <Badge variant="outline" className="mb-3 border-quill/30 text-quill">
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              From idea to printed book in minutes
            </Badge>
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">How Quill works</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {[
              {
                step: "01",
                title: "Pick level, subject, term",
                body: "Choose from KG1 to JHS3, then the subject and term you want to cover.",
                icon: <GraduationCap className="h-5 w-5" />,
              },
              {
                step: "02",
                title: "Select topics",
                body: "Quill shows the official curriculum topics. Tick the ones you want — or add your own.",
                icon: <Search className="h-5 w-5" />,
              },
              {
                step: "03",
                title: "Generate & illustrate",
                body: "Quill researches, writes the lessons, exercises and homework, and generates matching illustrations — page by page.",
                icon: <Wand2 className="h-5 w-5" />,
              },
              {
                step: "04",
                title: "Edit & export",
                body: "Tweak anything in the editor, swap images, then export to a print-ready A4 Word document.",
                icon: <Download className="h-5 w-5" />,
              },
            ].map((s) => (
              <div key={s.step} className="relative">
                <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-quill text-quill-foreground">
                      {s.icon}
                    </span>
                    <span className="font-display text-2xl font-bold text-quill/20">{s.step}</span>
                  </div>
                  <h3 className="mb-1 font-display font-semibold text-foreground">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Button size="lg" onClick={goGenerator} className="h-12 bg-quill text-quill-foreground hover:bg-quill/90">
              <Wand2 className="mr-2 h-5 w-5" />
              Create your first book
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
