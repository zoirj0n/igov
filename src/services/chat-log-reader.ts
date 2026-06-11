import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ChatLogEntry } from "./chat-log";

const CHAT_LOG_DIR = path.join(process.cwd(), "logs", "chat");

export interface SessionSummary {
  sessionId: string;
  firstTs: string;
  lastTs: string;
  turns: number;
  preview: string;
  classification: ChatLogEntry["classification"];
  actor?: string;
}

async function listSessionFiles(): Promise<string[]> {
  try {
    const files = await readdir(CHAT_LOG_DIR);
    return files.filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }
}

export async function readSession(sessionId: string): Promise<ChatLogEntry[]> {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
  if (!safe) return [];
  try {
    const raw = await readFile(path.join(CHAT_LOG_DIR, `${safe}.jsonl`), "utf-8");
    const out: ChatLogEntry[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as ChatLogEntry);
      } catch {
        // skip bad line
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function listSessions(opts: {
  actor?: string;
  includeAnon?: boolean;
  limit?: number;
}): Promise<SessionSummary[]> {
  const files = await listSessionFiles();
  const out: SessionSummary[] = [];
  for (const f of files) {
    const sid = f.replace(/\.jsonl$/, "");
    if (!opts.includeAnon && sid.startsWith("anon-")) continue;
    const entries = await readSession(sid);
    if (entries.length === 0) continue;
    const firstUser = entries.find((e) => e.role === "user");
    const owner = entries.find((e) => e.actor)?.actor;
    if (opts.actor && owner && owner !== opts.actor) continue;
    if (opts.actor && !owner) continue;
    const first = entries[0]!;
    const last = entries[entries.length - 1]!;
    out.push({
      sessionId: sid,
      firstTs: first.ts,
      lastTs: last.ts,
      turns: entries.filter((e) => e.role === "user" || e.role === "assistant").length,
      preview: (firstUser?.text ?? entries[0]?.text ?? "").slice(0, 80),
      classification: last.classification ?? first.classification,
      actor: owner,
    });
  }
  out.sort((a, b) => b.lastTs.localeCompare(a.lastTs));
  return opts.limit ? out.slice(0, opts.limit) : out;
}
