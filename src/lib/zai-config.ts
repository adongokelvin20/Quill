// Quill — Z.ai SDK initialization helper.
// Ensures the .z-ai-config file exists at runtime, even on Vercel.

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// The config that gets written to disk at runtime
const ZAI_CONFIG = {
  baseUrl: "https://internal-api.z.ai/v1",
  apiKey: "Z.ai",
  chatId: "chat-3b1d9b2f-62ee-4783-913e-141c92180b84",
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE",
  userId: "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0",
};

// Ensure the config file exists at multiple locations
export function ensureZaiConfig() {
  const locations = [
    join(process.cwd(), ".z-ai-config"),
    join(homedir(), ".z-ai-config"),
    "/tmp/.z-ai-config",
  ];

  for (const loc of locations) {
    try {
      if (!existsSync(loc)) {
        // Ensure directory exists
        const dir = loc.substring(0, loc.lastIndexOf("/"));
        if (dir && !existsSync(dir)) {
          try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
        }
        writeFileSync(loc, JSON.stringify(ZAI_CONFIG), "utf-8");
      }
    } catch {
      // Ignore write errors (might be read-only filesystem)
    }
  }
}

// Call this at the top of any file that uses ZAI
ensureZaiConfig();
