"use client";

import { useQuillStore } from "@/lib/store";
import { QuillHeader } from "@/components/quill/header";
import { QuillFooter } from "@/components/quill/footer";
import { HomeView } from "@/components/quill/home-view";
import { GeneratorView } from "@/components/quill/generator-view";
import { LibraryView } from "@/components/quill/library-view";
import { EditorView } from "@/components/quill/editor-view";

export default function Home() {
  const view = useQuillStore((s) => s.view);

  return (
    <div className="flex min-h-screen flex-col">
      <QuillHeader />
      <main className="flex-1">
        {view === "home" && <HomeView />}
        {view === "generator" && <GeneratorView />}
        {view === "library" && <LibraryView />}
        {view === "editor" && <EditorView />}
      </main>
      <QuillFooter />
    </div>
  );
}
