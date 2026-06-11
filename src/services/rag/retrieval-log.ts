import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Classification } from "@/types";

export interface RetrievalLogEntry {
  ts: string;
  actor: string;
  reqId?: string;
  sessionId?: string;
  questionHash: string; // sha256 trunc — links across runs without storing literal question
  questionLength: number;
  intent: string;
  lang: "en" | "ar";
  entities: string[];
  classification: Classification;
  passageIds: string[];
  passageScores: number[];
  topScore: number;
  factIds: string[];
  abstained: boolean;
  abstainReasons?: string[];
  embedVendor: string;
  rerankVendor: string;
  providerTier: string;
  injectionFlagged: number;
  durationMs: number;
}

const FILE = path.join(process.cwd(), "logs", "retrieval.jsonl");
let ensured = false;
async function ensureDir(): Promise<void> {
  if (ensured) return;
  await mkdir(path.dirname(FILE), { recursive: true });
  ensured = true;
}

export function hashQuestion(q: string): string {
  return createHash("sha256").update(q.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export function logRetrieval(entry: Omit<RetrievalLogEntry, "ts">): void {
  const full: RetrievalLogEntry = { ts: new Date().toISOString(), ...entry };
  setImmediate(async () => {
    try {
      await ensureDir();
      await appendFile(FILE, `${JSON.stringify(full)}\n`, { encoding: "utf-8" });
    } catch (err) {
      console.error("[retrieval-log] append failed:", err instanceof Error ? err.message : err);
    }
  });
}
