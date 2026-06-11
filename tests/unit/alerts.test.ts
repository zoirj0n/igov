import type { IndicatorPoint } from "@/services/agent/state";
import { alertsForCountry, buildAlerts } from "@/services/alerts";
import { describe, expect, it } from "vitest";

const ind = (code: string, value: number): IndicatorPoint => ({
  code,
  label: code,
  value,
  unit: "",
  year: 2024,
  source: "World Bank",
});

describe("alertsForCountry", () => {
  it("flags a clean-energy + high-growth country", () => {
    const a = alertsForCountry("BRA", [ind("renew_share", 46.5), ind("gdp_growth", 6.1)]);
    expect(a.some((x) => x.category === "energy")).toBe(true);
    expect(a.some((x) => x.category === "growth" && x.severity === "high")).toBe(true);
  });

  it("emits nothing below thresholds", () => {
    expect(alertsForCountry("XXX", [ind("renew_share", 5), ind("gdp_growth", 1)])).toEqual([]);
  });
});

describe("buildAlerts", () => {
  it("ranks high severity before info", () => {
    const ranked = buildAlerts([
      { iso3: "AAA", rows: [ind("internet_users", 95)] }, // info
      { iso3: "BBB", rows: [ind("exports", 2e12)] }, // high
    ]);
    expect(ranked[0]!.severity).toBe("high");
  });
});
