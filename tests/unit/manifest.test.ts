import {
  categoryKeys,
  findCategory,
  findSourceByCacheKey,
  loadManifest,
  searchManifest,
} from "@/lib/sources/manifest";
import { describe, expect, it } from "vitest";

describe("agent-resources manifest", () => {
  it("loads manifest", () => {
    const m = loadManifest();
    expect(m.version).toBe("1.0.0");
    expect(Object.keys(m.categories).length).toBeGreaterThan(5);
  });

  it("exposes category list", () => {
    const keys = categoryKeys();
    expect(keys).toContain("energy-statistics");
    expect(keys).toContain("competitiveness-indexes");
  });

  it("finds a known source by cache key", () => {
    const wb = findSourceByCacheKey("world-bank-open-data");
    expect(wb).toBeDefined();
    expect(wb?.source.url).toContain("worldbank.org");
  });

  it("search returns matches across categories", () => {
    const hits = searchManifest("smart city");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("findCategory returns sources for known slug", () => {
    const cat = findCategory("competitiveness-indexes");
    expect(cat).toBeDefined();
    expect(cat?.sources.length ?? 0).toBeGreaterThan(0);
  });
});
