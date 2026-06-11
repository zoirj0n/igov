import { COUNTRY_COORDS, coordsFor } from "@/lib/data/country-coords";
import { ISO_COUNTRIES } from "@/lib/data/iso-countries";
import { describe, expect, it } from "vitest";

describe("country coords", () => {
  it("covers every ISO country (any partner can be mapped)", () => {
    const missing = ISO_COUNTRIES.filter((c) => !COUNTRY_COORDS[c.iso3]).map((c) => c.iso3);
    expect(missing).toEqual([]);
  });
  it("returns sane centroids in range", () => {
    for (const [iso3, [lat, lon]] of Object.entries(COUNTRY_COORDS)) {
      expect(Math.abs(lat), `${iso3} lat`).toBeLessThanOrEqual(90);
      expect(Math.abs(lon), `${iso3} lon`).toBeLessThanOrEqual(180);
    }
  });
  it("spot checks + unknown handling", () => {
    expect(coordsFor("MAR")?.[0]).toBeCloseTo(31.8, 0);
    expect(coordsFor("are")?.[1]).toBe(54.0);
    expect(coordsFor("XXX")).toBeNull();
  });
});
