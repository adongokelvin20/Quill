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
  CheckCircle2,
  Users,
} from "lucide-react";

export function HomeView() {
  const goGenerator = useQuillStore((s) => s.goGenerator);
  const goLibrary = useQuillStore((s) => s.goLibrary);

  return (
    <div className="animate-quill-fade-up">
      {/* HERO — navy background with library image + gold accents */}
      <section className="relative overflow-hidden bg-blue-950">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{
            backgroundImage: "url('/quill-images/library.jpg')",
          }}
        />
        {/* Navy gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950/80" />
        {/* Gold pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,215,0,0.4) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Gold glow */}
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-yellow-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:py-32">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-1.5 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs font-medium text-yellow-200">AI-powered textbook generation for Ghanaian schools</span>
            </div>

            <h1 className="font-display text-5xl font-bold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl">
              <span className="bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 bg-clip-text text-transparent">
                Quill
              </span>
            </h1>
            <p className="mt-2 font-display text-2xl font-medium text-blue-100 sm:text-3xl">
              Bringing intelligent education to life.
            </p>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-blue-100/80 sm:text-lg">
              A comprehensive AI-powered platform that generates complete, illustrated textbooks
              for Ghanaian basic schools — from{" "}
              <span className="font-semibold text-yellow-300">KG1 to JHS3</span>. Aligned with the
              GES Common Curriculum, with high-definition illustrations, interactive exercises,
              and homework for every lesson. Fully editable in your browser, export to Word in one click.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={goGenerator}
                className="h-12 border-0 bg-gradient-to-r from-yellow-500 to-amber-500 text-blue-950 shadow-lg shadow-yellow-500/20 hover:from-yellow-400 hover:to-amber-400"
              >
                <Wand2 className="mr-2 h-5 w-5" />
                Create a book
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={goLibrary}
                className="h-12 border-yellow-500/40 bg-white/5 text-yellow-100 backdrop-blur-sm hover:bg-white/10 hover:text-white"
              >
                <BookOpen className="mr-2 h-5 w-5" />
                Browse library
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-blue-200/70">
              <span className="inline-flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-yellow-400" /> GES curriculum aligned
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Languages className="h-4 w-4 text-yellow-400" /> English (Ghanaian)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-yellow-400" /> No timeouts
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4 text-yellow-400" /> KG1 → JHS3
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR — gold on white */}
      <section className="border-b border-blue-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { value: "17", label: "GES Subjects" },
              { value: "11", label: "Class Levels (KG1–JHS3)" },
              { value: "510+", label: "Curriculum Topics" },
              { value: "1024px", label: "HD Illustrations" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="font-display text-4xl font-bold text-blue-900 sm:text-5xl">{stat.value}</div>
                <div className="mt-1 text-xs font-medium text-blue-600/70 sm:text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES — white cards with navy + gold accents */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-10 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-50 px-4 py-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-medium text-amber-800">Everything in one place</span>
          </div>
          <h2 className="font-display text-3xl font-bold text-blue-950 sm:text-4xl">
            A complete textbook studio in your browser
          </h2>
          <p className="mt-3 text-blue-700/70">
            Generate, research, illustrate, edit, and export — without leaving Quill.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: <Wand2 className="h-5 w-5" />,
              title: "Class-level aware generation",
              body: "KG1 gets colourful picture-heavy pages; JHS3 gets structured paragraphs and exam-style questions. The system adapts vocabulary, sentence length, and illustration style per level.",
              accent: "from-blue-600 to-blue-800",
            },
            {
              icon: <ImageIcon className="h-5 w-5" />,
              title: "HD image generation",
              body: "Every illustration is generated at 1024×1024 using Z.ai's image API — crisp, professional, and kid-friendly. Pollinations.ai serves as a free fallback so images always load.",
              accent: "from-amber-500 to-yellow-600",
            },
            {
              icon: <Globe className="h-5 w-5" />,
              title: "Web research built-in",
              body: "Quill scrapes authoritative sources to ground each lesson in real, up-to-date content. Topics are researched before content is generated, then cited in the teaching notes.",
              accent: "from-blue-700 to-cyan-700",
            },
            {
              icon: <Edit3 className="h-5 w-5" />,
              title: "Fully editable",
              body: "Drag, drop, type, replace. The in-browser editor lets you tweak any block — paragraph, image, activity, table — and see the result instantly. No re-generation needed.",
              accent: "from-amber-600 to-orange-600",
            },
            {
              icon: <Download className="h-5 w-5" />,
              title: "DOCX export, A4 ready",
              body: "One click exports to a Word document — A4 page size, kid-friendly fonts, embedded HD images, headers, footers, page numbers. Ready to print, share, or hand to a teacher.",
              accent: "from-blue-800 to-indigo-800",
            },
            {
              icon: <Layers className="h-5 w-5" />,
              title: "Section-based books",
              body: "Books are organized into named sections (units) with divider pages. Each lesson comes with exercises and homework. Cover, TOC, glossary, and closing pages included automatically.",
              accent: "from-yellow-600 to-amber-700",
            },
          ].map((f, i) => (
            <Card
              key={i}
              className="group relative overflow-hidden border-blue-100 bg-white shadow-sm transition-all hover:shadow-xl hover:shadow-blue-100/50 hover:-translate-y-1"
            >
              <CardContent className="p-6">
                <div
                  className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.accent} text-white shadow-md transition-transform group-hover:scale-110`}
                >
                  {f.icon}
                </div>
                <h3 className="mb-2 font-display text-lg font-semibold text-blue-950">{f.title}</h3>
                <p className="text-sm leading-relaxed text-blue-700/70">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* IMAGE SHOWCASE — uploaded images on light background */}
      <section className="bg-gradient-to-b from-blue-50/50 to-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5">
              <Feather className="h-3.5 w-3.5 text-blue-700" />
              <span className="text-xs font-medium text-blue-800">Built for real classrooms</span>
            </div>
            <h2 className="font-display text-3xl font-bold text-blue-950 sm:text-4xl">
              From kindergarten to BECE — beautifully illustrated
            </h2>
            <p className="mt-3 text-blue-700/70">
              Every book is filled with high-definition illustrations that match the class level and subject.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Quill pen image */}
            <div className="group relative overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm transition-all hover:shadow-xl hover:shadow-blue-100/40">
              <div className="aspect-[4/3] overflow-hidden bg-blue-50">
                <img
                  src="/quill-images/quill-pen.jpg"
                  alt="Quill pen — symbol of writing and education"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <h3 className="font-display font-semibold text-blue-950">The Quill Standard</h3>
                <p className="mt-1 text-sm text-blue-700/70">
                  Professional, curriculum-aligned content written by AI that understands the Ghanaian classroom.
                </p>
              </div>
            </div>

            {/* Student image */}
            <div className="group relative overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm transition-all hover:shadow-xl hover:shadow-blue-100/40">
              <div className="aspect-[4/3] overflow-hidden bg-blue-50">
                <img
                  src="/quill-images/student.jpg"
                  alt="Student studying with textbooks"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <h3 className="font-display font-semibold text-blue-950">Learner-Centred</h3>
                <p className="mt-1 text-sm text-blue-700/70">
                  Each book includes exercises, homework, and activities designed for the student's reading level.
                </p>
              </div>
            </div>

            {/* Classroom image */}
            <div className="group relative overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm transition-all hover:shadow-xl hover:shadow-blue-100/40">
              <div className="aspect-[4/3] overflow-hidden bg-blue-50">
                <img
                  src="/quill-images/classroom.jpg"
                  alt="Classroom with teacher reading to students"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <h3 className="font-display font-semibold text-blue-950">Classroom-Ready</h3>
                <p className="mt-1 text-sm text-blue-700/70">
                  Print-ready A4 Word documents with clear fonts, colour-coded activities, and page numbers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LEVELS */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-10 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-1.5">
            <GraduationCap className="h-3.5 w-3.5 text-amber-700" />
            <span className="text-xs font-medium text-amber-800">KG1 → JHS3</span>
          </div>
          <h2 className="font-display text-3xl font-bold text-blue-950 sm:text-4xl">
            Every level of Ghanaian basic school
          </h2>
          <p className="mt-3 text-blue-700/70">
            From Kindergarten to BECE preparation — content, illustrations, and activities tuned for each age.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {LEVELS.map((level) => (
            <button
              key={level.id}
              onClick={goGenerator}
              className="group flex flex-col items-start gap-1 rounded-xl border border-blue-100 bg-white p-4 text-left shadow-sm transition-all hover:border-amber-400/60 hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-display text-xl font-bold text-blue-900">{level.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-blue-300 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-500" />
              </div>
              <span className="text-xs font-medium text-blue-800">{level.fullLabel}</span>
              <span className="text-[10px] text-blue-500/60">{level.ageRange}</span>
            </button>
          ))}
        </div>
      </section>

      {/* SUBJECTS */}
      <section className="bg-gradient-to-b from-blue-50/50 to-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5">
              <BookOpen className="h-3.5 w-3.5 text-blue-700" />
              <span className="text-xs font-medium text-blue-800">All 17 GES subjects</span>
            </div>
            <h2 className="font-display text-3xl font-bold text-blue-950 sm:text-4xl">
              Every basic-school subject covered
            </h2>
            <p className="mt-3 text-blue-700/70">
              English, Mathematics, Science, RME, OWOP, History, Computing, Creative Arts, French, Career Tech, and more.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SUBJECTS.map((subject, i) => {
              const isEven = i % 2 === 0;
              return (
                <button
                  key={subject.id}
                  onClick={goGenerator}
                  className="group flex items-center justify-between rounded-xl border border-blue-100 bg-white p-4 text-left shadow-sm transition-all hover:border-amber-400/50 hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-lg font-display font-bold ${isEven ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                      {subject.name[0]}
                    </span>
                    <div>
                      <div className="font-semibold text-blue-950">{subject.name}</div>
                      <div className="text-xs text-blue-500/70">
                        {subject.topics[1].length + subject.topics[2].length + subject.topics[3].length} topics across 3 terms
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-blue-300 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-500" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — navy background with gold accents */}
      <section className="bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs font-medium text-yellow-200">From idea to printed book in minutes</span>
            </div>
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">How Quill works</h2>
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
                title: "Select topics & add your own",
                body: "Quill shows the official curriculum topics. Tick the ones you want — or type your own custom topics.",
                icon: <Search className="h-5 w-5" />,
              },
              {
                step: "03",
                title: "Generate & illustrate",
                body: "Quill researches, writes the lessons, exercises and homework, and generates matching HD illustrations — page by page.",
                icon: <Wand2 className="h-5 w-5" />,
              },
              {
                step: "04",
                title: "Edit & export",
                body: "Tweak anything in the editor, swap images, then export to a print-ready A4 Word document.",
                icon: <Download className="h-5 w-5" />,
              },
            ].map((s) => (
              <div key={s.step} className="rounded-xl border border-yellow-500/15 bg-white/5 p-5 backdrop-blur-sm transition-colors hover:border-yellow-500/30 hover:bg-white/10">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-yellow-500 to-amber-500 text-blue-950 shadow-md">
                    {s.icon}
                  </span>
                  <span className="font-display text-3xl font-bold text-yellow-500/20">{s.step}</span>
                </div>
                <h3 className="mb-1 font-display font-semibold text-white">{s.title}</h3>
                <p className="text-sm text-blue-100/70">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Button size="lg" onClick={goGenerator} className="h-12 border-0 bg-gradient-to-r from-yellow-500 to-amber-500 text-blue-950 shadow-lg shadow-yellow-500/20 hover:from-yellow-400 hover:to-amber-400">
              <Wand2 className="mr-2 h-5 w-5" />
              Create your first book
            </Button>
          </div>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <Card className="overflow-hidden border-blue-200 bg-gradient-to-br from-white via-blue-50/50 to-amber-50/30 shadow-lg">
          <CardContent className="flex flex-col items-center gap-6 p-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-900 to-blue-700 text-yellow-400 shadow-lg ring-1 ring-yellow-500/30">
              <Feather className="h-8 w-8" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="font-display text-3xl font-bold text-blue-950">
                Ready to bring intelligent education to life?
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-blue-700/70">
                Join teachers across Ghana who use Quill to create professional, illustrated textbooks
                in minutes — not weeks. Free to use, no API keys required, export to Word anytime.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={goGenerator} className="h-12 border-0 bg-gradient-to-r from-blue-700 to-blue-900 text-white shadow-lg hover:from-blue-600 hover:to-blue-800">
                <Wand2 className="mr-2 h-5 w-5" />
                Create a book now
              </Button>
              <Button size="lg" variant="outline" onClick={goLibrary} className="h-12 border-amber-400/50 text-amber-700 hover:bg-amber-50">
                <BookOpen className="mr-2 h-5 w-5" />
                View library
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-blue-600/60">
              {["No signup required to try", "Free image generation", "GES curriculum aligned", "Export to Word"].map((item) => (
                <span key={item} className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" />
                  {item}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
