import { doneCount, lastDetail, looksDegraded, notesFor, statusFor } from "@/lib/experience/trace";
import type { AgentState } from "@/services/agent/state";
import { describe, expect, it } from "vitest";

function stateWith(trace: AgentState["trace"], extra?: Partial<AgentState>): AgentState {
  return {
    command: "x",
    indicators: [],
    passages: [],
    opportunities: [],
    risks: [],
    deliverables: {},
    trace,
    classification: "internal",
    ...extra,
  };
}

describe("trace helpers", () => {
  const s = stateWith([
    { step: "scope", status: "start", atMs: 1 },
    { step: "scope", status: "done", detail: "BRA · energy", atMs: 5 },
    { step: "research", status: "start", note: "World Bank: GDP", atMs: 6 },
    { step: "research", status: "start", note: "Comtrade: $4.3B", atMs: 9 },
  ]);

  it("statusFor returns the LAST status per step, idle when absent or null state", () => {
    expect(statusFor(s, "scope")).toBe("done");
    expect(statusFor(s, "research")).toBe("start");
    expect(statusFor(s, "briefing")).toBe("idle");
    expect(statusFor(null, "scope")).toBe("idle");
  });

  it("lastDetail and notesFor aggregate per step", () => {
    expect(lastDetail(s, "scope")).toBe("BRA · energy");
    expect(notesFor(s, "research")).toEqual(["World Bank: GDP", "Comtrade: $4.3B"]);
    expect(notesFor(s, "scope")).toEqual([]);
  });

  it("doneCount counts done steps among the given keys", () => {
    expect(doneCount(s, ["scope", "research", "briefing"])).toBe(1);
    expect(doneCount(null, ["scope"])).toBe(0);
  });

  it("looksDegraded flags the template-fallback signature (title === rationale)", () => {
    expect(looksDegraded(null)).toBe(false);
    expect(looksDegraded(s)).toBe(false);
    const degraded = stateWith([], {
      opportunities: [
        {
          partnerIso3: "BRA",
          sector: "energy",
          title: "Smart-port & digital-infrastructure standards",
          score: 70,
          rationale: "Smart-port & digital-infrastructure standards",
          signals: {},
        },
      ],
    });
    expect(looksDegraded(degraded)).toBe(true);
  });
});
