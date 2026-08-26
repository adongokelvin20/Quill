# Quill — Production Deployment Guide

This guide walks you through deploying Quill to Vercel with a managed PostgreSQL database and full authentication.

---

## Prerequisites

- A [Vercel account](https://vercel.com/signup) (free tier works)
- A [GitHub](https://github.com) account (to host the repo)
- The Quill source code (this project)

---

## Step 1 — Push the code to GitHub

```bash
git init
git add .
git commit -m "Quill — Bringing intelligent education to life"
git branch -M main
git remote add origin https://github.com/<your-username>/quill.git
git push -u origin main
```

---

## Step 2 — Create a Vercel Postgres database

1. Go to <https://vercel.com/dashboard/stores>
2. Click **Create** → **Postgres**
3. Name it `quill-db`
4. Select the region closest to your users (e.g. `iad1` for US East, `fra1` for Europe, `sin1` for Singapore)
5. Click **Create**

Vercel will give you a connection string that looks like:
```
postgres://default:xxxxxxxx@xxx.pg.vercel-store.com/verceldb
```

---

## Step 3 — Import the project into Vercel

1. Go to <https://vercel.com/new>
2. Import your GitHub repo
3. Vercel will auto-detect Next.js — keep the defaults
4. Under **Environment Variables**, add:

| Name | Value | Environments |
|------|-------|--------------|
| `DATABASE_URL` | `postgres://default:xxxx@xxx.pg.vercel-store.com/verceldb` | Production, Preview |
| `NEXTAUTH_SECRET` | (run `openssl rand -base64 32` and paste the output) | Production, Preview |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` (Vercel will tell you the URL after first deploy) | Production |

5. Click **Deploy**

The first deploy will fail because the Prisma schema is still configured for SQLite. That's expected — we'll fix it next.

---

## Step 4 — Switch Prisma to PostgreSQL

Open `prisma/schema.prisma` and change the provider:

```diff
 datasource db {
-  provider = "sqlite"
+  provider = "postgresql"
   url      = env("DATABASE_URL")
 }
```

Commit and push:

```bash
git add prisma/schema.prisma
git commit -m "Switch Prisma to PostgreSQL for production"
git push
```

Vercel will auto-redeploy. The `buildCommand` in `vercel.json` runs `prisma generate` before `next build`, so the Prisma Client will be regenerated for Postgres.

---

## Step 5 — Create the database tables

After the deploy succeeds, run the Prisma migration. The easiest way is to use Vercel's CLI:

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Link your local project to Vercel
vercel link

# Pull the production env vars into .env.local
vercel env pull .env.local

# Push the schema to the Postgres database
npx prisma db push
```

Alternatively, you can run `npx prisma db push` from your local machine with the `DATABASE_URL` set to your Vercel Postgres connection string.

---

## Step 6 — Verify the deployment

1. Visit your Vercel URL (e.g. `https://quill-xxx.vercel.app`)
2. You should see the Quill landing page
3. Click **Sign in** → **Create account** → make an account
4. Click **Create Book** → pick KG1 → English → Term 1 → 2 topics → set **Limit total pages** to 10 → **Generate book**
5. Watch the streaming progress, then the editor opens
6. Click **Export DOCX** — you should get a Word file download

If anything fails, check the Vercel function logs:
```bash
vercel logs <deployment-url>
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string from Vercel Postgres |
| `NEXTAUTH_SECRET` | ✅ | Random 32+ char string (generate with `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | ✅ | Your app's canonical URL (e.g. `https://quill.vercel.app`) |

---

## Notes on Serverless Constraints

- **Image proxy cache**: `/api/quill/img` writes cached images to `/tmp` (the only writable directory on Vercel serverless). The cache is per-instance and ephemeral — on cold starts the cache is empty. This is fine because Pollinations CDN caches the actual images.
- **Function timeouts**: The `generate` route has `maxDuration = 300` (5 minutes, requires Vercel Pro). On the free Hobby plan, the max is 60s — large books may time out. Upgrade to Pro or generate fewer lessons at a time.
- **Streaming**: The `generate` route uses SSE streaming, which Vercel supports. The client renders pages progressively as they arrive.
- **Database connection pooling**: Vercel Postgres uses PgBouncer by default. Prisma handles this automatically when you use `?pgbouncer=true` in the connection string.

---

## Updating the Curriculum

To add or modify topics, edit `src/lib/curriculum.ts` and redeploy. No database migration needed — the curriculum is code, not data.

---

## Troubleshooting

**"Prisma Client did not initialize yet"**
→ Run `npx prisma generate` locally and push the regenerated `node_modules/.prisma` (or rely on the `buildCommand` in `vercel.json`).

**"NEXTAUTH_SECRET is missing"**
→ Set it in Vercel Project Settings → Environment Variables.

**Images don't load in the editor**
→ Pollinations sometimes takes 15-30s to generate an image on first request. The proxy retries 3 times. If it still fails, check the function logs for `/api/quill/img` errors.

**DOCX export fails**
→ The export fetches every image synchronously. For books with many images, this can hit the 180s timeout. Reduce the number of topics or use the "Limit total pages" feature with a smaller target.
