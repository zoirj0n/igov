import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SSRF guard: only Wikimedia's image CDN may be proxied. */
export function isAllowedPhotoSrc(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === "https:" && u.hostname === "upload.wikimedia.org";
  } catch {
    return false;
  }
}

/**
 * Cache key for a photo source URL. Must hash the FULL url: Wikimedia thumbnail
 * urls share their first ~30 bytes, so any prefix-truncation scheme collides and
 * serves one person's photo for everyone.
 */
export function cacheKeyFor(src: string): string {
  return createHash("sha256").update(src).digest("hex").slice(0, 40);
}

function cacheDir(): string {
  return process.env.PHOTO_CACHE_DIR ?? path.join(process.cwd(), "data", "cache", "counterparts");
}

const MAX_BYTES = 3 * 1024 * 1024;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const src = new URL(req.url).searchParams.get("src") ?? "";
  if (!isAllowedPhotoSrc(src)) {
    return NextResponse.json({ error: "src not allowed" }, { status: 400 });
  }

  const file = path.join(cacheDir(), cacheKeyFor(src));
  try {
    if (fs.existsSync(file)) {
      return new Response(new Uint8Array(fs.readFileSync(file)), {
        headers: {
          "content-type": fs.existsSync(`${file}.ct`)
            ? fs.readFileSync(`${file}.ct`, "utf8")
            : "image/jpeg",
          "cache-control": "private, max-age=86400",
        },
      });
    }
    const res = await fetch(src, { signal: AbortSignal.timeout(10_000) });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.startsWith("image/")) {
      return NextResponse.json({ error: "upstream not an image" }, { status: 502 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "image too large" }, { status: 502 });
    }
    try {
      fs.mkdirSync(cacheDir(), { recursive: true });
      fs.writeFileSync(file, buf);
      fs.writeFileSync(`${file}.ct`, ct, "utf8");
    } catch {
      /* cache is best-effort */
    }
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": ct, "cache-control": "private, max-age=86400" },
    });
  } catch {
    return NextResponse.json({ error: "photo unavailable" }, { status: 502 });
  }
}
