import { ISO_COUNTRIES } from "@/lib/data/iso-countries";
import { REGIONS, REGION_LABELS, REGION_OF, regionOf } from "@/lib/data/regions";
import { describe, expect, it } from "vitest";

describe("regions", () => {
  it("covers every ISO country — on failure, add each printed code to its bucket", () => {
    const missing = ISO_COUNTRIES.filter((c) => !REGION_OF[c.iso3]).map((c) => c.iso3);
    expect(missing).toEqual([]);
  });
  it("spot checks", () => {
    expect(regionOf("BRA")).toBe("americas");
    expect(regionOf("DEU")).toBe("europe");
    expect(regionOf("ARE")).toBe("mea");
    expect(regionOf("SGP")).toBe("apac");
    expect(regionOf("XXX")).toBeNull();
  });
  it("labels exist for every region in both locales", () => {
    for (const r of REGIONS) {
      expect(REGION_LABELS[r].en.length).toBeGreaterThan(0);
      expect(REGION_LABELS[r].ar.length).toBeGreaterThan(0);
    }
  });
});
