"use client";

import { useQuillStore } from "@/lib/store";
import { Feather, Heart } from "lucide-react";

export function QuillFooter() {
  const goHome = useQuillStore((s) => s.goHome);
  return (
    <footer className="mt-auto border-t border-border/60 bg-muted/30">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={goHome} className="flex items-center gap-2 hover:text-quill">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-yellow-500 to-amber-700 text-white">
              <Feather className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <span className="font-display font-semibold text-quill">Quill</span>
          </button>
          <span className="text-border">•</span>
          <span>Bringing intelligent education to life</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>KG1 → JHS3</span>
          <span className="text-border">•</span>
          <span>All subjects</span>
          <span className="text-border">•</span>
          <span>GES curriculum aligned</span>
          <span className="text-border">•</span>
          <span className="inline-flex items-center gap-1">
            Built with <Heart className="h-3 w-3 fill-quill text-quill" /> for Ghana
          </span>
        </div>
      </div>
    </footer>
  );
}
