"use client";

import { SessionProvider } from "next-auth/react";

export function QuillSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
