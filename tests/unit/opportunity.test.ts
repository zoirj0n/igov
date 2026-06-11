import { scoreOpportunities } from "@/services/agent/opportunity";
import type { IndicatorPoint } from "@/services/agent/state";
import { describe, expect, it } from "vitest";

const uae: IndicatorPoint[] = [
  {
    code: "renew_share",
    label: "Renewables share",
    value: 30,
    unit: "%",
    year: 2024,
    source: "IEA",
  },
];
const partner: IndicatorPoint[] = [
  {
    code: "renew_share",
    label: "Renewables share",
    value: 85,
    unit: "%",
    year: 2024,
    source: "IEA",
  },
  {
    code: "energy_import_dep",
    label: "Energy import dependence",
    value: 10,
    unit: "%",
    year: 2024,
    source: "IEA",
  },
];

describe("scoreOpportunities", () => {
  it("returns ranked opportunities with numeric signals", () => {
    const r = scoreOpportunities(uae, partner, "BRA");
    expect(r.length).toBeGreaterThan(0);
    const top = r[0]!;
    const bottom = r[r.length - 1]!;
    expect(top.score).toBeGreaterThanOrEqual(bottom.score);
    expect(typeof top.signals).toBe("object");
    expect(top.partnerIso3).toBe("BRA");
  });

  it("ranks energy first when complementarity is high", () => {
    const r = scoreOpportunities(uae, partner, "BRA");
    expect(r[0]!.sector).toBe("energy");
  });

  it("is deterministic", () => {
    expect(scoreOpportunities(uae, partner, "BRA")).toEqual(
      scoreOpportunities(uae, partner, "BRA"),
    );
  });
});
