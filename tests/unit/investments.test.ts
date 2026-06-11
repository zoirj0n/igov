import { investmentsFor, totalInvestmentUsd } from "@/lib/data/investments";
import { describe, expect, it } from "vitest";

describe("investments seed", () => {
  it("returns cited deals for a seeded country", () => {
    const deals = investmentsFor("BRA");
    expect(deals.length).toBeGreaterThan(0);
    for (const d of deals) {
      expect(d.valueUsd).toBeGreaterThan(0);
      expect(d.source.url).toMatch(/^https:\/\//);
      expect(d.year).toBeGreaterThan(2000);
    }
  });
  it("sums the headline total", () => {
    const deals = investmentsFor("BRA");
    expect(totalInvestmentUsd("BRA")).toBe(deals.reduce((a, d) => a + d.valueUsd, 0));
  });
  it("returns empty for unseeded countries (graceful)", () => {
    expect(investmentsFor("JPN")).toEqual([]);
    expect(totalInvestmentUsd("JPN")).toBe(0);
  });
});
