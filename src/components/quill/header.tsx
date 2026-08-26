"use client";

import { useQuillStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Library, Sparkles, Home, Feather } from "lucide-react";

export function QuillHeader() {
  const { view, goHome, goLibrary, goGenerator } = useQuillStore();

  const navItems: { id: string; label: string; icon: React.ReactNode; onClick: () => void; active: boolean }[] = [
    { id: "home", label: "Home", icon: <Home className="h-4 w-4" />, onClick: goHome, active: view === "home" },
    { id: "generator", label: "Create Book", icon: <Sparkles className="h-4 w-4" />, onClick: goGenerator, active: view === "generator" },
    { id: "library", label: "Library", icon: <Library className="h-4 w-4" />, onClick: goLibrary, active: view === "library" },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <button
          onClick={goHome}
          className="group flex items-center gap-2 transition-opacity hover:opacity-90"
          aria-label="Quill home"
        >
          <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-quill to-amber-500 text-white shadow-sm transition-transform group-hover:scale-105">
            <Feather className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-xl font-semibold text-quill">Quill</span>
            <span className="text-[10px] text-muted-foreground">Bringing intelligent education to life</span>
          </span>
        </button>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                item.active
                  ? "bg-quill/10 text-quill"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.icon}
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
