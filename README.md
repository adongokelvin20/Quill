# Quill — Bringing intelligent education to life

A comprehensive AI-powered textbook generation platform for Ghanaian basic schools (KG1 to JHS3). Generates complete, illustrated textbooks aligned with the GES Common Curriculum — with high-definition illustrations, interactive exercises, homework, and section-based organization.

![Quill](public/quill-images/quill-pen.jpg)

## Features

- **17 GES Subjects**: English, Mathematics, Science, RME, OWOP, History, Computing, Creative Arts, French, Career Tech, Ghanaian Language, Social Studies, PE, Music, Agriculture, Arabic, ICT
- **11 Class Levels**: KG1 → JHS3 with level-appropriate content, vocabulary, and illustration styles
- **510+ Curriculum Topics**: 10 topics per subject per term, aligned with GES standards
- **HD Image Generation**: 1024×1024 illustrations via Z.ai API (free Pollinations fallback)
- **Section-Based Books**: Lessons grouped into named sections with divider pages
- **Page-Count Condensing**: Full (3pp/lesson) → Condensed (2pp) → Compact (1pp) modes
- **Custom Topics**: Add your own topics alongside curriculum topics
- **Web Research**: Optional scraping of authoritative sources to ground lessons
- **Rich Editor**: 19 block types — headings, paragraphs, images, tables, fill-blanks, multiple-choice, matching, tracing, word-banks, vocabulary, tips, quotes, homework, activities
- **DOCX Export**: A4 page size, kid-friendly fonts, embedded HD images, headers/footers, page numbers
- **Authentication**: NextAuth v4 with email/password (JWT sessions, per-user libraries)
- **Responsive**: Works on desktop, tablet, and mobile

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Database**: Prisma ORM (SQLite dev / PostgreSQL production)
- **Auth**: NextAuth.js v4 (Credentials provider, JWT strategy)
- **AI**: Z.ai SDK (LLM, image generation, web search, web reader, VLM)
- **Images**: Z.ai (primary, 1024×1024) + Pollinations.ai (fallback, free, no API key)
- **Export**: `docx` package for Word document generation
- **Fonts**: Fredoka (display) + Nunito (body)

## Quick Start

```bash
# Install dependencies
bun install

# Set up the database
bun run db:push

# Start the dev server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Create a `.env` file:

```env
DATABASE_URL="file:./db/custom.db"
NEXTAUTH_SECRET="your-secret-here"  # Generate with: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
```

## Deploy to Vercel

1. Push to GitHub
2. Create a Vercel Postgres store
3. Import the repo into Vercel
4. Set environment variables: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
5. Change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma`
6. Run `npx prisma db push`
7. Deploy!

See `DEPLOYMENT.md` for detailed instructions.

## Project Structure

```
src/
├── app/
│   ├── api/quill/          # API routes (generate, image, research, books, pages, export)
│   ├── page.tsx            # Main page (home, generator, library, editor)
│   ├── layout.tsx          # Root layout with SessionProvider
│   └── globals.css         # Navy + gold theme
├── components/
│   ├── quill/              # Quill components (header, footer, home, generator, library, editor, auth)
│   └── ui/                 # shadcn/ui components
└── lib/
    ├── auth.ts             # NextAuth config
    ├── blocks.ts           # 19 block type definitions
    ├── curriculum.ts       # 17 subjects, 11 levels, 510+ topics
    ├── db.ts               # Prisma client
    ├── docx-exporter.ts    # Block tree → A4 DOCX
    ├── generator.ts        # Streaming LLM book generator
    ├── images.ts           # Z.ai + Pollinations image utilities
    ├── research.ts         # Web search + scrape
    └── store.ts            # Zustand state
```

## License

MIT — Free for educational use.

---

**Quill** — Bringing intelligent education to life.
