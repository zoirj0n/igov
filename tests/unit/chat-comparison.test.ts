import { buildComparison } from "@/services/chat/comparison";
import type { Indicator } from "@/types";
import { describe, expect, it } from "vitest";

function ind(countryIso3: string, metric: string, value: number, year: number): Indicator {
  return {
    countryIso3,
    metric,
    value,
    year,
    unit: "USD",
    source: "World Bank",
    confidence: "high",
  } as Indicator;
}

describe("buildComparison", () => {
  it("aligns latest values for both countries across the compare set", () => {
    const byCountry = (iso3: string) =>
      iso3 === "ARE"
        ? [ind("ARE", "gdp_usd_nominal", 5.5e11, 2024), ind("ARE", "gdp_usd_nominal", 5.0e11, 2022)]
        : [ind("SGP", "gdp_usd_nominal", 5.3e11, 2024)];
    const cmp = buildComparison(["ARE", "SGP"], byCountry);
    expect(cmp.countries).toEqual([
      { iso3: "ARE", name: "United Arab Emirates" },
      { iso3: "SGP", name: "Singapore" },
    ]);
    const gdp = cmp.rows.find((r) => r.metric === "gdp_usd_nominal");
    expect(gdp?.a?.value).toBe(5.5e11);
    expect(gdp?.a?.year).toBe(2024);
    expect(gdp?.b?.value).toBe(5.3e11);
  });
  it("returns null cells for missing metrics and keeps all six rows", () => {
    const cmp = buildComparison(["ARE", "SGP"], () => []);
    expect(cmp.rows).toHaveLength(6);
    expect(cmp.rows.every((r) => r.a === null && r.b === null)).toBe(true);
  });
});
