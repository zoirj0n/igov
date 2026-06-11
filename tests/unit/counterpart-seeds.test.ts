import { getSeedCounterpart } from "@/lib/data/counterparts";
import { describe, expect, it } from "vitest";

describe("counterpart seeds", () => {
  it("returns the seeded dossier for a known country/role", () => {
    const p = getSeedCounterpart("BRA", "energy");
    expect(p?.name).toBe("Alexandre Silveira");
    expect(p?.confidence).toBe("medium");
    expect(p?.citations[0]).toContain("wikipedia.org");
  });
  it("returns null for unseeded pairs", () => {
    expect(getSeedCounterpart("JPN", "energy")).toBeNull();
    expect(getSeedCounterpart("BRA", "foreign")).toBeNull();
  });
});
