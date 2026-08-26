"use client";

import { create } from "zustand";

export type View = "home" | "library" | "generator" | "editor" | "loading";

interface QuillState {
  view: View;
  activeBookId: string | null;
  // Set when navigating to the editor from elsewhere
  openEditor: (bookId: string) => void;
  goHome: () => void;
  goLibrary: () => void;
  goGenerator: () => void;
  setLoading: (msg: string | null) => void;
  loadingMsg: string | null;
}

export const useQuillStore = create<QuillState>((set) => ({
  view: "home",
  activeBookId: null,
  loadingMsg: null,
  openEditor: (bookId) => set({ view: "editor", activeBookId: bookId }),
  goHome: () => set({ view: "home", activeBookId: null, loadingMsg: null }),
  goLibrary: () => set({ view: "library", activeBookId: null, loadingMsg: null }),
  goGenerator: () => set({ view: "generator", activeBookId: null, loadingMsg: null }),
  setLoading: (msg) => set({ loadingMsg: msg }),
}));
