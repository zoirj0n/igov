import { byCategory, categories, findSource, loadCatalog } from "@/lib/sources/catalog";
import { describe, expect, it } from "vitest";

describe("sources catalog", () => {
  it("loads sources.csv", () => {
    const all = loadCatalog();
    expect(all.length).toBeGreaterThan(80);
  });

  it("filters by category", () => {
    const eco = byCategory("Economic indicators");
    expect(eco.length).toBeGreaterThan(0);
    expect(eco.every((s) => s.category === "Economic indicators")).toBe(true);
  });

  it("searches by free text", () => {
    expect(findSource("World Bank").length).toBeGreaterThan(0);
    expect(findSource("zzzz_nope").length).toBe(0);
  });

  it("exposes category list", () => {
    const cats = categories();
    expect(cats).toContain("Energy statistics");
    expect(cats.length).toBeGreaterThan(5);
  });

  it("includes recently added city-rank sources", () => {
    expect(findSource("IMD Smart City").length).toBeGreaterThan(0);
    expect(findSource("Cities in Motion").length).toBeGreaterThan(0);
    expect(findSource("Safe Cities").length).toBeGreaterThan(0);
  });
});
