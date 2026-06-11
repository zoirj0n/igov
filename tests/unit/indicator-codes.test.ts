import { INDICATOR_META, readSeedIndicators } from "@/lib/data/indicator-codes";
import { describe, expect, it } from "vitest";

describe("readSeedIndicators", () => {
  it("returns [] for an unknown country with no cache file", () => {
    expect(readSeedIndicators("ZZZ")).toEqual([]);
  });
});

describe("INDICATOR_META", () => {
  it("defines the codes the scorer and nodes rely on", () => {
    for (const code of ["gdp", "renew_share", "energy_import_dep", "infra_index", "trade_yoy"]) {
      const meta = INDICATOR_META[code];
      expect(meta).toBeTruthy();
      expect(meta!.label.length).toBeGreaterThan(0);
    }
  });
});
