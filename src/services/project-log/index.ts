import { appendFile } from "node:fs/promises";
import { type LogPrefix, logPathFor, nextId } from "./ids";

/**
 * Project-log appenders. Non-blocking — callers should never await unless
 * they specifically need the assigned ID for a response.
 *
 * Format matches existing logs/*.md:
 *   ## [YYYY-MM-DD HH:MM] <PREFIX>-NNN — <title>
 *   - <field>: <value>
 *   - <field>: <value>
 *
 * Pattern: ID allocation is sync (reads file), append is async.
 * For "fire and forget" UX use the void* variants below.
 */

function nowStamp(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatBody(kv: Record<string, unknown>): string {
  return Object.entries(kv)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");
}

async function appendEntry(
  prefix: LogPrefix,
  id: string,
  title: string,
  body: Record<string, unknown>,
): Promise<void> {
  const block = `\n## [${nowStamp()}] ${id} — ${title}\n${formatBody(body)}\n`;
  try {
    await appendFile(logPathFor(prefix), block, { encoding: "utf-8" });
  } catch (err) {
    console.error(
      `[project-log:${prefix}] append failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// ─── Errors ────────────────────────────────────────────────────────────────

export interface LogErrorInput {
  title: string;
  actor: string;
  kind?: string; // "ts" | "runtime" | "fetch" | "test" | ...
  area?: string; // path or module
  message?: string;
  stack?: string;
  classification?: "public" | "internal" | "confidential" | "secret";
  links?: string; // e.g. "TODO-026, sessionId xyz"
}

export async function logError(input: LogErrorInput): Promise<string> {
  const id = nextId("ERR");
  await appendEntry("ERR", id, input.title, {
    Actor: input.actor,
    Kind: input.kind ?? "runtime",
    Area: input.area,
    Message: input.message,
    Stack: input.stack?.slice(0, 1200),
    Classification: input.classification ?? "Internal",
    Links: input.links,
    Status: "[ ] open",
  });
  return id;
}

export function logErrorBg(input: LogErrorInput): string {
  const id = nextId("ERR");
  // Fire-and-forget on the next tick so the caller's response path is unblocked.
  setImmediate(() => {
    void appendEntry("ERR", id, input.title, {
      Actor: input.actor,
      Kind: input.kind ?? "runtime",
      Area: input.area,
      Message: input.message,
      Stack: input.stack?.slice(0, 1200),
      Classification: input.classification ?? "Internal",
      Links: input.links,
      Status: "[ ] open",
    });
  });
  return id;
}

// ─── Fixes ─────────────────────────────────────────────────────────────────

export interface LogFixInput {
  title: string;
  actor: string;
  errId?: string; // back-link, e.g. "ERR-007"
  todoId?: string; // optional TODO close
  area?: string;
  summary: string;
  commit?: string; // git sha if available
  classification?: "public" | "internal" | "confidential" | "secret";
}

export async function logFix(input: LogFixInput): Promise<string> {
  const id = nextId("FIX");
  await appendEntry("FIX", id, input.title, {
    Actor: input.actor,
    Resolves: input.errId,
    Closes: input.todoId,
    Area: input.area,
    Summary: input.summary,
    Commit: input.commit,
    Classification: input.classification ?? "Internal",
  });
  return id;
}

export function logFixBg(input: LogFixInput): string {
  const id = nextId("FIX");
  setImmediate(() => {
    void appendEntry("FIX", id, input.title, {
      Actor: input.actor,
      Resolves: input.errId,
      Closes: input.todoId,
      Area: input.area,
      Summary: input.summary,
      Commit: input.commit,
      Classification: input.classification ?? "Internal",
    });
  });
  return id;
}

// ─── TODOs ─────────────────────────────────────────────────────────────────

export interface LogTodoInput {
  title: string;
  actor: string;
  owner?: string;
  area?: string;
  priority?: "high" | "med" | "low";
  notes?: string;
  classification?: "public" | "internal" | "confidential" | "secret";
}

export async function logTodo(input: LogTodoInput): Promise<string> {
  const id = nextId("TODO");
  await appendEntry("TODO", id, input.title, {
    Actor: input.actor,
    Owner: input.owner ?? "unassigned",
    Priority: input.priority ?? "med",
    Status: "[ ] open",
    Area: input.area,
    Notes: input.notes,
    Classification: input.classification ?? "Internal",
  });
  return id;
}

export function logTodoBg(input: LogTodoInput): string {
  const id = nextId("TODO");
  setImmediate(() => {
    void appendEntry("TODO", id, input.title, {
      Actor: input.actor,
      Owner: input.owner ?? "unassigned",
      Priority: input.priority ?? "med",
      Status: "[ ] open",
      Area: input.area,
      Notes: input.notes,
      Classification: input.classification ?? "Internal",
    });
  });
  return id;
}

// ─── Milestones ────────────────────────────────────────────────────────────

export interface LogMilestoneInput {
  title: string;
  actor: string;
  area?: string;
  summary: string;
  links?: string; // PR / FIX / ERR refs
  audit?: string[]; // audit event names that should accompany
  classification?: "public" | "internal" | "confidential" | "secret";
}

export async function logMilestone(input: LogMilestoneInput): Promise<string> {
  const id = nextId("MS");
  await appendEntry("MS", id, input.title, {
    Actor: input.actor,
    Area: input.area,
    Summary: input.summary,
    Links: input.links,
    "Audit events": input.audit?.join(", "),
    Classification: input.classification ?? "Internal",
  });
  return id;
}

export function logMilestoneBg(input: LogMilestoneInput): string {
  const id = nextId("MS");
  setImmediate(() => {
    void appendEntry("MS", id, input.title, {
      Actor: input.actor,
      Area: input.area,
      Summary: input.summary,
      Links: input.links,
      "Audit events": input.audit?.join(", "),
      Classification: input.classification ?? "Internal",
    });
  });
  return id;
}
