/* eslint-disable no-console */
/**
 * log:trace — joined timeline view of all log streams for one reqId.
 *
 * Usage:
 *   pnpm log:trace <reqId>
 *   pnpm log:trace 0c49fd52-99ff-471d-8271-e8d48e7153f3
 *
 * Output: chronological merge of access / audit / llm-calls / retrieval / chat
 * filtered to events whose reqId matches. Each line color-coded by stream.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

interface AnyEvent {
  ts: string;
  stream: "access" | "audit" | "llm" | "retrieval" | "chat";
  reqId?: string;
  raw: Record<string, unknown>;
}

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const STREAM_COLOR: Record<AnyEvent["stream"], string> = {
  access: C.blue,
  audit: C.green,
  llm: C.magenta,
  retrieval: C.cyan,
  chat: C.yellow,
};

async function readJsonl(file: string): Promise<Record<string, unknown>[]> {
  try {
    const raw = await readFile(file, "utf-8");
    const out: Record<string, unknown>[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return [];
  }
}

function matchReqId(entry: Record<string, unknown>, reqId: string): boolean {
  if (entry.reqId === reqId) return true;
  if ((entry as { meta?: { reqId?: string } }).meta?.reqId === reqId) return true;
  return false;
}

async function loadAll(reqId: string): Promise<AnyEvent[]> {
  const root = process.cwd();
  const out: AnyEvent[] = [];

  const streamsToFiles: { stream: AnyEvent["stream"]; file: string }[] = [
    { stream: "access", file: path.join(root, "logs", "access.jsonl") },
    { stream: "audit", file: path.join(root, "logs", "audit.jsonl") },
    { stream: "llm", file: path.join(root, "logs", "llm-calls.jsonl") },
    { stream: "retrieval", file: path.join(root, "logs", "retrieval.jsonl") },
  ];

  for (const { stream, file } of streamsToFiles) {
    const rows = await readJsonl(file);
    for (const r of rows) {
      if (!matchReqId(r, reqId)) continue;
      const ts = typeof r.ts === "string" ? r.ts : "";
      out.push({ ts, stream, reqId: r.reqId as string | undefined, raw: r });
    }
  }

  // Chat lives per-session — scan all session files
  const chatDir = path.join(root, "logs", "chat");
  try {
    const files = await readdir(chatDir);
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const rows = await readJsonl(path.join(chatDir, f));
      for (const r of rows) {
        if (!matchReqId(r, reqId)) continue;
        const ts = typeof r.ts === "string" ? r.ts : "";
        out.push({ ts, stream: "chat", reqId: r.reqId as string | undefined, raw: r });
      }
    }
  } catch {
    /* no chat dir */
  }

  out.sort((a, b) => a.ts.localeCompare(b.ts));
  return out;
}

function summarize(ev: AnyEvent): string {
  const r = ev.raw;
  switch (ev.stream) {
    case "access":
      return `${r.method} ${r.path} actor=${r.actorHint ?? "—"}`;
    case "audit": {
      const cls = r.classification ? ` class=${r.classification}` : "";
      const res = r.resourceId ? ` res=${String(r.resourceId).slice(0, 32)}` : "";
      return `${r.action} actor=${r.actor}${cls}${res}`;
    }
    case "llm": {
      const cost =
        typeof r.costUsd === "number" && r.costUsd > 0
          ? ` $${(r.costUsd as number).toFixed(4)}`
          : "";
      const tokens =
        r.promptTokens && r.completionTokens
          ? ` ${r.promptTokens}→${r.completionTokens}t`
          : ` ${r.promptChars}p→${r.completionChars}c`;
      return `${r.step} ${r.provider}/${r.model}${tokens}${cost} ${r.durationMs}ms${r.errorClass ? ` ERR=${r.errorClass}` : ""}`;
    }
    case "retrieval": {
      const ents = Array.isArray(r.entities) ? `[${(r.entities as string[]).join(",")}]` : "[]";
      const ab = r.abstained ? " ABSTAINED" : "";
      const inj = (r.injectionFlagged as number) > 0 ? ` inj=${r.injectionFlagged}` : "";
      return `entities=${ents} passages=${(r.passageIds as unknown[])?.length ?? 0} top=${Number(r.topScore).toFixed(2)} ${r.durationMs}ms${ab}${inj}`;
    }
    case "chat": {
      const text = String(r.text ?? "")
        .replace(/\s+/g, " ")
        .slice(0, 120);
      return `${r.role} "${text}"`;
    }
  }
}

async function main(): Promise<void> {
  const reqId = process.argv[2];
  if (!reqId) {
    console.error("usage: pnpm log:trace <reqId>");
    process.exit(2);
  }

  // Confirm log dir exists
  try {
    await stat(path.join(process.cwd(), "logs"));
  } catch {
    console.error("no logs/ dir at " + process.cwd());
    process.exit(2);
  }

  const events = await loadAll(reqId);
  if (events.length === 0) {
    console.log(`\n  No events found for reqId=${reqId}\n`);
    console.log("  Tip: check logs/access.jsonl for valid reqIds via");
    console.log("    tail logs/access.jsonl | jq -r '.reqId'\n");
    process.exit(1);
  }

  const startTs = new Date(events[0]!.ts).getTime();
  console.log(`\n  ${C.bold}Trace ${reqId}${C.reset}`);
  console.log(
    `  ${events.length} events across ${new Set(events.map((e) => e.stream)).size} streams\n`,
  );

  let totalCost = 0;
  let totalDur = 0;
  for (const ev of events) {
    const dt = new Date(ev.ts).getTime() - startTs;
    const offset = `+${dt.toString().padStart(5, " ")}ms`;
    const tag = `[${ev.stream}]`.padEnd(11);
    const col = STREAM_COLOR[ev.stream];
    console.log(`  ${C.dim}${offset}${C.reset}  ${col}${tag}${C.reset} ${summarize(ev)}`);
    if (ev.stream === "llm") {
      const c = (ev.raw as { costUsd?: number }).costUsd;
      const d = (ev.raw as { durationMs?: number }).durationMs;
      if (typeof c === "number") totalCost += c;
      if (typeof d === "number") totalDur += d;
    }
  }
  console.log();
  if (totalCost > 0 || totalDur > 0) {
    console.log(
      `  ${C.bold}Totals${C.reset}  LLM cost: $${totalCost.toFixed(4)}  ·  LLM time: ${totalDur}ms\n`,
    );
  }
}

main().catch((err) => {
  console.error("trace failed:", err);
  process.exit(1);
});
