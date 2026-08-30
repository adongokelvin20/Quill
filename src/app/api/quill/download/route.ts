// Quill — File download API.
// GET /api/quill/download?file=/path/to/file.docx
// Serves files from /tmp (Vercel writable directory).

import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const file = url.searchParams.get("file");
  if (!file) return new Response("Missing file", { status: 400 });

  const resolved = path.resolve(file);
  // Allow files from /tmp (Vercel) or /home/z (local dev)
  if (!resolved.startsWith("/tmp") && !resolved.startsWith("/home/z/my-project/download")) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const buf = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const mime =
      ext === ".docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : ext === ".pdf"
        ? "application/pdf"
        : "application/octet-stream";

    const filename = path.basename(resolved);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buf.length),
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}
