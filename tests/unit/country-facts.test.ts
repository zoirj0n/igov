import { fetchCountryFacts, parseWbMrnev } from "@/services/live/countryFacts";
import { describe, expect, it } from "vitest";

describe("country facts", () => {
  it("parseWbMrnev maps the most-recent value", () => {
    const j = [{ page: 1 }, [{ value: 2.17e12, date: "2024" }]];
    expect(parseWbMrnev(j)).toEqual({ value: 2.17e12, year: 2024 });
    expect(parseWbMrnev([{ page: 1 }, []])).toBeNull();
    expect(parseWbMrnev([{ page: 1 }, [{ value: null, date: "2024" }]])).toBeNull();
    expect(parseWbMrnev("junk")).toBeNull();
  });
  it("air-gapped (vitest): seeded country serves the dated seed", async () => {
    const f = await fetchCountryFacts("BRA");
    expect(f?.capital).toBe("Brasília");
    expect(f?.sectors?.services).toBeGreaterThan(50);
    expect(f?.live).toBe(false);
  });
  it("air-gapped: unseeded country returns static-less minimal facts (null)", async () => {
    expect(await fetchCountryFacts("JPN")).not.toBeNull();
    expect(await fetchCountryFacts("XKX")).toBeNull();
  });
});
