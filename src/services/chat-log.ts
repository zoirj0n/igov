import { appendFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/utils/logger";

const CHAT_LOG_DIR = path.join(process.cwd(), "logs", "chat");

export type ChatLogRole = "user" | "assistant" | "system";

export interface ChatLogEntry {
  ts: string;
  sessionId: string;
  turnId: string;
  role: ChatLogRole;
  text: string;
  citations?: string[];
  usedRealApi?: boolean;
  latencyMs?: number;
  classification?: "public" | "internal" | "confidential" | "secret";
  userAgent?: string;
  ip?: string;
  actor?: string;
  reqId?: string;
}

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g,
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\+?\d{1,3}[ -]?\(?\d{2,4}\)?[ -]?\d{3,4}[ -]?\d{3,4}/g;

function redact(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED-SECRET]");
  out = out.replace(EMAIL, "[REDACTED-EMAIL]");
  out = out.replace(PHONE, "[REDACTED-PHONE]");
  return out;
}

function fileFor(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "unknown";
  return path.join(CHAT_LOG_DIR, `${safe}.jsonl`);
}

let ensured = false;
async function ensureDir(): Promise<void> {
  if (ensured) return;
  await mkdir(CHAT_LOG_DIR, { recursive: true });
  ensured = true;
}

export function logChatTurn(entry: Omit<ChatLogEntry, "ts">): void {
  const full: ChatLogEntry = {
    ts: new Date().toISOString(),
    ...entry,
    text: redact(entry.text),
    classification: entry.classification ?? "internal",
  };
  void appendNonBlocking(full);
}

async function appendNonBlocking(entry: ChatLogEntry): Promise<void> {
  try {
    await ensureDir();
    const line = `${JSON.stringify(entry)}\n`;
    await appendFile(fileFor(entry.sessionId), line, { encoding: "utf-8" });
  } catch (err) {
    logger.error({ err, sessionId: entry.sessionId }, "chat log write failed");
  }
}

/**
 * Delete a chat session's transcript file. Returns true if file was removed,
 * false if it didn't exist. Throws on permission / fs errors.
 */
export async function deleteChatSession(sessionId: string): Promise<boolean> {
  try {
    await unlink(fileFor(sessionId));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return false;
    throw err;
  }
}
