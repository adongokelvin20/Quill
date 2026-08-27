"use client";

import { useEffect, useState } from "react";
import { useQuillStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  BookOpen,
  Search,
  Trash2,
  Download,
  Edit3,
  Wand2,
  Loader2,
  FileText,
  Calendar,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { LEVELS, SUBJECTS } from "@/lib/curriculum";
import { cn } from "@/lib/utils";

interface BookItem {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  level: string;
  subject: string;
  term: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: { pages: number };
}

export function LibraryView() {
  const { openEditor, goGenerator } = useQuillStore();
  const [books, setBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);

  const loadBooks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quill/books");
      const data = await res.json();
      setBooks(data.books ?? []);
    } catch {
      toast.error("Failed to load books");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBooks();
  }, []);

  const filtered = books.filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) ||
      b.subtitle?.toLowerCase().includes(q) ||
      b.description?.toLowerCase().includes(q) ||
      b.level.toLowerCase().includes(q) ||
      b.subject.toLowerCase().includes(q)
    );
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this book? This cannot be undone.")) return;
    try {
      await fetch(`/api/quill/books/${id}`, { method: "DELETE" });
      setBooks((prev) => prev.filter((b) => b.id !== id));
      toast.success("Book deleted");
    } catch {
      toast.error("Failed to delete book");
    }
  };

  const handleExport = async (id: string) => {
    setExporting(id);
    try {
      const res = await fetch("/api/quill/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Export failed");

      // Trigger download
      const file = data.filePath as string;
      const url = `/api/quill/download?file=${encodeURIComponent(file)}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = file.split("/").pop() ?? "book.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();

      toast.success("DOCX exported!", {
        description: `${(data.fileSize / 1024).toFixed(0)} KB — check your downloads.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Export failed", { description: message });
    } finally {
      setExporting(null);
    }
  };

  const levelInfo = (id: string) => LEVELS.find((l) => l.id === id);
  const subjectInfo = (id: string) => SUBJECTS.find((s) => s.id === id);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Your Library</h1>
          <p className="mt-1 text-muted-foreground">
            {books.length} book{books.length !== 1 ? "s" : ""} • Click to edit, export to Word, or delete.
          </p>
        </div>
        <Button onClick={goGenerator} className="bg-quill text-quill-foreground hover:bg-quill/90">
          <Wand2 className="mr-2 h-4 w-4" />
          Create new book
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, subject, or level..."
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-quill" />
          <p className="mt-3 text-sm">Loading books...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && books.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/60 bg-muted/20 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-quill/10">
            <BookOpen className="h-8 w-8 text-quill" />
          </div>
          <h3 className="mt-4 font-display text-xl font-semibold text-foreground">No books yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create your first textbook — Quill will research, write, illustrate, and lay it out for you in minutes.
          </p>
          <Button onClick={goGenerator} className="mt-5 bg-quill text-quill-foreground hover:bg-quill/90">
            <Wand2 className="mr-2 h-4 w-4" />
            Create your first book
          </Button>
        </div>
      )}

      {/* Empty search */}
      {!loading && books.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-muted/20 py-16 text-center">
          <Search className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No books match &ldquo;{search}&rdquo;</p>
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((book) => {
            const li = levelInfo(book.level);
            const si = subjectInfo(book.subject);
            return (
              <Card
                key={book.id}
                className="group flex flex-col overflow-hidden border-border/60 transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                {/* Cover */}
                <button
                  onClick={() => openEditor(book.id)}
                  className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-amber-400/20 via-yellow-50 to-amber-200/30 p-4 text-left"
                >
                  <div className="flex h-full flex-col">
                    <div className="mb-2 flex items-start justify-between">
                      <Badge className="bg-white/80 text-amber-800 hover:bg-white/90">
                        {li?.label ?? book.level}
                      </Badge>
                      <Badge variant="outline" className="bg-white/60 text-foreground/70">
                        Term {book.term}
                      </Badge>
                    </div>
                    <div className="mt-auto">
                      <div className="font-display text-xl font-bold leading-tight text-foreground">
                        {book.title}
                      </div>
                      {book.subtitle && (
                        <div className="mt-1 text-xs text-foreground/70">{book.subtitle}</div>
                      )}
                      <div className="mt-2 text-[10px] text-foreground/60">
                        Quill • Bringing intelligent education to life
                      </div>
                    </div>
                  </div>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-amber-600/80 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-quill shadow-lg">
                      <Edit3 className="h-4 w-4" />
                      Open editor
                    </span>
                  </div>
                </button>

                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  {/* Meta */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      {li?.fullLabel ?? book.level}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {si?.name ?? book.subject}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {book._count.pages} pages
                    </span>
                  </div>

                  {book.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{book.description}</p>
                  )}

                  {book.status !== "ready" && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "w-fit",
                        book.status === "generating" && "border-amber-300 bg-amber-soft text-amber-700",
                        book.status === "error" && "border-red-300 bg-red-50 text-red-700",
                        book.status === "draft" && "border-blue-300 bg-blue-50 text-blue-700"
                      )}
                    >
                      {book.status}
                    </Badge>
                  )}

                  {/* Actions */}
                  <div className="mt-auto flex items-center gap-2 border-t border-border/40 pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditor(book.id)}
                      className="flex-1 border-quill/30 text-quill hover:bg-quill/5"
                    >
                      <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExport(book.id)}
                      disabled={exporting === book.id}
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    >
                      {exporting === book.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1.5 hidden sm:inline">DOCX</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(book.id)}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
