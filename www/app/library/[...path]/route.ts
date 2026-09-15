import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const LIBRARY_ROOT = path.resolve(process.cwd(), "../library");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;

  const filePath = path.resolve(LIBRARY_ROOT, ...parts);

  // Prevent requests from escaping the library folder.
  if (!filePath.startsWith(LIBRARY_ROOT + path.sep)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    return new NextResponse(file, {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
