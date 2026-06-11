import { runAgent } from "@/services/agent/graph";
import type { AgentState } from "@/services/agent/state";
/**
 * Live end-to-end smoke test for the agent graph against a running Ollama.
 * Runs in the node environment (see vitest.config environmentMatchGlobs).
 * Skipped unless RUN_LIVE=1 (makes real LLM + World Bank network calls).
 *
 *   RUN_LIVE=1 LLM_PROVIDER=local pnpm test --run agent.live
 */
import { describe, expect, it } from "vitest";

const live = process.env.RUN_LIVE === "1";

describe.skipIf(!live)("agent live smoke (Ollama)", () => {
  it("runs end-to-end and produces a grounded briefing for Brazil", async () => {
    let final: AgentState | null = null;
    const steps: string[] = [];
    for await (const ev of runAgent("Prepare me for Brazil's Energy Minister", {
      classification: "internal",
    })) {
      if (ev.event === "trace") {
        const last = ev.state.trace[ev.state.trace.length - 1];
        if (last)
          steps.push(`${last.step}:${last.status}${last.detail ? ` (${last.detail})` : ""}`);
      }
      if (ev.event === "final") final = ev.state;
      if (ev.event === "error") throw new Error(ev.message);
    }
    // eslint-disable-next-line no-console
    console.log("TRACE:\n" + steps.join("\n"));
    // eslint-disable-next-line no-console
    console.log("INDICATORS:", final?.indicators.length, "OPPS:", final?.opportunities.length);
    // eslint-disable-next-line no-console
    console.log("BRIEFING:\n" + JSON.stringify(final?.briefing, null, 2));
    expect(final).toBeTruthy();
    expect(final?.scope?.iso3).toBe("BRA");
    expect(final?.indicators.length ?? 0).toBeGreaterThan(0);
    expect(final?.briefing).toBeTruthy();
  }, 240_000);
});
