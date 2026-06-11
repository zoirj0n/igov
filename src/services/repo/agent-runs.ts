import fs from "node:fs";
import path from "node:path";
import type { AgentState } from "@/services/agent/state";
import type { Classification } from "@/types";

export interface RunSummary {
  id: string;
  title: string;
  iso3: string;
  role?: string;
  createdAt: string;
  createdBy: string;
  classification: Classification;
}

export interface RunRecord extends RunSummary {
  command: string;
  durationMs: number;
  state: AgentState;
}

declare global {
  // eslint-disable-next-line no-var
  var __ciAgentRuns: Map<string, RunRecord> | undefined;
}

function runsDir(): string {
  return process.env.RUNS_DIR ?? path.join(process.cwd(), "data", "runs");
}

function loadFromDisk(map: Map<string, RunRecord>): void {
  try {
    const d = runsDir();
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith(".json")) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(d, f), "utf8")) as RunRecord;
        if (rec?.id) map.set(rec.id, rec);
      } catch {
        /* skip corrupt file */
      }
    }
  } catch {
    /* unreadable dir — serve from memory only */
  }
}

function store(): Map<string, RunRecord> {
  if (!globalThis.__ciAgentRuns) {
    globalThis.__ciAgentRuns = new Map();
    loadFromDisk(globalThis.__ciAgentRuns);
  }
  return globalThis.__ciAgentRuns;
}

export function saveRun(input: {
  command: string;
  role?: string;
  state: AgentState;
  createdBy: string;
  durationMs: number;
}): RunRecord {
  const id = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const rec: RunRecord = {
    id,
    command: input.command,
    role: input.role,
    title: input.state.briefing?.title || input.command,
    iso3: input.state.scope?.iso3 ?? "—",
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    classification: input.state.classification,
    durationMs: input.durationMs,
    state: input.state,
  };
  store().set(id, rec);
  try {
    fs.mkdirSync(runsDir(), { recursive: true });
    fs.writeFileSync(path.join(runsDir(), `${id}.json`), JSON.stringify(rec), "utf8");
  } catch {
    /* best-effort persistence; the in-memory copy still serves this process */
  }
  return rec;
}

export function getRun(id: string): RunRecord | undefined {
  return store().get(id);
}

export function listRuns(limit = 8): RunSummary[] {
  return [...store().values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(({ state: _state, command: _command, durationMs: _durationMs, ...summary }) => summary);
}

/** Test hook: drop the memory cache so a fresh RUNS_DIR is re-scanned. */
export function __resetRunsForTest(): void {
  globalThis.__ciAgentRuns = undefined;
}
