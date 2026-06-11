/* eslint-disable no-console */
/**
 * log:rotate — size-based gzip + retention for jsonl streams.
 *
 *   pnpm log:rotate                # default: 10MB threshold, retain 7 archives
 *   LOG_ROTATE_BYTES=5242880 pnpm log:rotate
 *   LOG_RETAIN_FILES=14 pnpm log:rotate
 *   LOG_TARGET_DIR=logs/sub pnpm log:rotate
 *
 * Steps per file:
 *   1. If size > threshold:
 *      - Shift existing archives: file.6.jsonl.gz → file.7.jsonl.gz, etc.
 *      - Move current file → file.1.jsonl
 *      - Gzip in place → file.1.jsonl.gz
 *      - Touch a new empty file so writers continue without ENOENT
 *   2. Drop archives with index > LOG_RETAIN_FILES.
 *
 * Idempotent: re-running before file fills again is a no-op.
 * Cron suggestion (UTC nightly):  0 0 * * *  cd /path/to/v1 && pnpm log:rotate
 */

import { createReadStream, createWriteStream } from "node:fs";
import { readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

const TARGET_DIR = process.env.LOG_TARGET_DIR ?? "logs";
const ROTATE_BYTES = Number(process.env.LOG_ROTATE_BYTES ?? 10 * 1024 * 1024);
const RETAIN_FILES = Math.max(1, Number(process.env.LOG_RETAIN_FILES ?? 7));

// Streams worth rotating. Skip .md (project log) — short, human-edited.
const TRACKED = ["access.jsonl", "audit.jsonl", "llm-calls.jsonl", "retrieval.jsonl"];

async function fileSize(p: string): Promise<number | null> {
  try {
    return (await stat(p)).size;
  } catch {
    return null;
  }
}

async function gzipFile(src: string, dest: string): Promise<void> {
  await pipeline(createReadStream(src), createGzip(), createWriteStream(dest));
}

async function rotateOne(
  file: string,
): Promise<{ rotated: boolean; bytes: number; dropped: number; missing: boolean }> {
  const full = path.join(process.cwd(), TARGET_DIR, file);
  const sz = await fileSize(full);
  if (sz === null) return { rotated: false, bytes: 0, dropped: 0, missing: true };
  if (sz < ROTATE_BYTES) return { rotated: false, bytes: sz, dropped: 0, missing: false };

  // Shift existing .N.jsonl.gz down: highest index first.
  for (let i = RETAIN_FILES; i >= 1; i--) {
    const src = path.join(process.cwd(), TARGET_DIR, `${file}.${i}.gz`);
    const dst = path.join(process.cwd(), TARGET_DIR, `${file}.${i + 1}.gz`);
    try {
      await stat(src);
      await rename(src, dst);
    } catch {
      /* not present */
    }
  }

  // Rotate current → .1.gz
  const tmpPlain = path.join(process.cwd(), TARGET_DIR, `${file}.1`);
  await rename(full, tmpPlain);
  await writeFile(full, "", { encoding: "utf-8" });
  const archive = path.join(process.cwd(), TARGET_DIR, `${file}.1.gz`);
  await gzipFile(tmpPlain, archive);
  await unlink(tmpPlain);

  // Drop archives beyond retention.
  let dropped = 0;
  const dirents = await readdir(path.join(process.cwd(), TARGET_DIR));
  const re = new RegExp(`^${file.replace(/\./g, "\\.")}\\.(\\d+)\\.gz$`);
  for (const name of dirents) {
    const m = name.match(re);
    if (!m) continue;
    const idx = Number(m[1]);
    if (idx > RETAIN_FILES) {
      await unlink(path.join(process.cwd(), TARGET_DIR, name));
      dropped++;
    }
  }
  return { rotated: true, bytes: sz, dropped, missing: false };
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${n}B`;
}

async function main(): Promise<void> {
  console.log(`\n  log:rotate  threshold=${fmtBytes(ROTATE_BYTES)}  retain=${RETAIN_FILES}\n`);
  for (const f of TRACKED) {
    const r = await rotateOne(f);
    if (r.rotated) {
      console.log(
        `  ✓ ${f.padEnd(20)} ${fmtBytes(r.bytes)} → archived (.1.gz); dropped ${r.dropped} aged-out`,
      );
    } else if (r.missing) {
      console.log(`  - ${f.padEnd(20)} not present`);
    } else {
      console.log(`  · ${f.padEnd(20)} ${fmtBytes(r.bytes)} — under threshold`);
    }
  }
  // Also rotate per-session chat logs if any are large.
  try {
    const chatDir = path.join(process.cwd(), TARGET_DIR, "chat");
    const files = await readdir(chatDir);
    const large = files.filter((f) => f.endsWith(".jsonl"));
    for (const f of large) {
      const r = await rotateOne(path.join("chat", f));
      if (r.rotated) {
        console.log(`  ✓ chat/${f.padEnd(15)} ${fmtBytes(r.bytes)} → archived`);
      }
    }
  } catch {
    /* no chat dir */
  }
  console.log();
}

main().catch((err) => {
  console.error("log:rotate failed:", err);
  process.exit(1);
});
