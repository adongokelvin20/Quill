// Quill — Database setup script.
// Runs before `prisma generate` to set the correct provider based on DATABASE_URL.
//   - If DATABASE_URL starts with "file:" → SQLite (local dev)
//   - If DATABASE_URL starts with "postgres:" or "postgresql:" → PostgreSQL (Vercel)
//
// This allows the same schema.prisma to work in both environments.

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "..", "prisma", "schema.prisma");

const dbUrl = process.env.DATABASE_URL ?? "";
const isPostgres = dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");

console.log(`[setup-db] DATABASE_URL starts with: ${dbUrl.slice(0, 20)}...`);
console.log(`[setup-db] Provider: ${isPostgres ? "postgresql" : "sqlite"}`);

let schema = readFileSync(schemaPath, "utf-8");

// Replace the provider line
schema = schema.replace(
  /provider\s*=\s*"(sqlite|postgresql)"/,
  `provider = "${isPostgres ? "postgresql" : "sqlite"}"`
);

writeFileSync(schemaPath, schema);
console.log(`[setup-db] Updated schema.prisma with provider = "${isPostgres ? "postgresql" : "sqlite"}"`);
