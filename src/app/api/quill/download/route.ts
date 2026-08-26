// Quill — File download API.
// GET /api/quill/download?file=/path/to/file.docx

import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_BASE = "/home/z/my-project/download";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const file = url.searchParams.get("file");
  if (!file) return new Response("Missing file", { status: 400 });

  const resolved = path.resolve(file);
  if (!resolved.startsWith(ALLOWED_BASE)) {
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
