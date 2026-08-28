"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuillStore } from "@/lib/store";
import { QuillHeader } from "@/components/quill/header";
import { QuillFooter } from "@/components/quill/footer";
import { HomeView } from "@/components/quill/home-view";
import { GeneratorView } from "@/components/quill/generator-view";
import { LibraryView } from "@/components/quill/library-view";
import { EditorView } from "@/components/quill/editor-view";

// Separate component that uses useSearchParams — must be wrapped in Suspense
function LibraryRedirect() {
  const goLibrary = useQuillStore((s) => s.goLibrary);
  const searchParams = useSearchParams();

  useEffect(() => {
    const viewParam = searchParams.get("view");
    if (viewParam === "library") {
      goLibrary();
    }
  }, [searchParams, goLibrary]);

  return null;
}

export default function Home() {
  const view = useQuillStore((s) => s.view);

  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={null}>
        <LibraryRedirect />
      </Suspense>
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
