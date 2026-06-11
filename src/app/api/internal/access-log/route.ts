import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "logs", "access.jsonl");
let ensured = false;
async function ensureDir(): Promise<void> {
  if (ensured) return;
  await mkdir(path.dirname(FILE), { recursive: true });
  ensured = true;
}

/**
 * Receives JSON access-log lines from src/middleware.ts when
 * ACCESS_LOG_FORWARD=true. No auth — this endpoint is loopback-only.
 * If exposed publicly, add an internal-only token check here.
 */
export async function POST(req: Request) {
  if (process.env.ACCESS_LOG_FORWARD !== "true") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    await ensureDir();
    await appendFile(FILE, `${body}\n`, { encoding: "utf-8" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
