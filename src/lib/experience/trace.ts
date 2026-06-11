import type { AgentState } from "@/services/agent/state";

export type StepStatus = "idle" | "start" | "done" | "error";

export function statusFor(state: AgentState | null, key: string): StepStatus {
  if (!state) return "idle";
  let s: StepStatus = "idle";
  for (const t of state.trace) if (t.step === key) s = t.status as StepStatus;
  return s;
}

export function lastDetail(state: AgentState | null, key: string): string | undefined {
  if (!state) return undefined;
  let d: string | undefined;
  for (const t of state.trace) if (t.step === key) d = t.detail;
  return d;
}

export function notesFor(state: AgentState | null, key: string): string[] {
  if (!state) return [];
  return state.trace.flatMap((t) => (t.step === key && t.note ? [t.note] : []));
}

export function doneCount(state: AgentState | null, keys: readonly string[]): number {
  return keys.filter((k) => statusFor(state, k) === "done").length;
}

/**
 * CLAUDE.md "silent-fallback" tell: when the local LLM was never reached, the
 * deterministic templates set opportunity title === rationale. Surfacing this
 * honestly is a spec requirement (degraded composition mode).
 */
export function looksDegraded(state: AgentState | null): boolean {
  if (!state) return false;
  return state.opportunities.some((o) => o.title.length > 0 && o.title === o.rationale);
}
