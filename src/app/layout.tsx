import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { QuillSessionProvider } from "@/components/quill/session-provider";

// Force dynamic rendering — the app uses useSession which can't be prerendered
export const dynamic = "force-dynamic";

const fredoka = Fredoka({
  variable: "--font-quill-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const nunito = Nunito({
  variable: "--font-quill-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Quill — Bringing intelligent education to life",
  description:
    "Quill generates complete, illustrated textbooks for Ghanaian basic schools — KG1 to JHS3. AI-powered content, free image generation, web research, editable in your browser, export to Word.",
  keywords: [
    "Quill",
    "Ghana education",
    "GES curriculum",
    "textbook generator",
    "KG1",
    "JHS3",
    "basic school",
    "AI textbook",
    "worksheet generator",
  ],
  authors: [{ name: "Quill" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Quill — Bringing intelligent education to life",
    description:
      "Generate illustrated textbooks for Ghanaian basic schools. KG1 to JHS3, all subjects, all terms.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fredoka.variable} ${nunito.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "var(--font-quill-sans), system-ui, sans-serif" }}
      >
        <QuillSessionProvider>
          {children}
          <Toaster />
          <SonnerToaster position="top-right" richColors />
        </QuillSessionProvider>
      </body>
    </html>
  );
}
