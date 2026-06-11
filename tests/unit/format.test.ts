import { fmtCompact, fmtUsd } from "@/lib/experience/format";
import { describe, expect, it } from "vitest";

describe("fmtUsd", () => {
  it("scales T/B/M and falls back to locale integers", () => {
    expect(fmtUsd(2_170_000_000_000)).toBe("$2.2T");
    expect(fmtUsd(4_300_000_000)).toBe("$4.3B");
    expect(fmtUsd(145_000_000)).toBe("$145.0M");
    expect(fmtUsd(950_000)).toBe("$950,000");
  });
});

describe("fmtCompact", () => {
  it("treats USD unit variants as currency", () => {
    expect(fmtCompact(2_170_000_000_000, "USD")).toBe("$2.2T");
    expect(fmtCompact(2_170_000_000_000, "US$")).toBe("$2.2T");
    expect(fmtCompact(34_400_000_000, "$")).toBe("$34.4B");
  });
  it("rounds percentages to one decimal", () => {
    expect(fmtCompact(3.847293, "%")).toBe("3.8%");
    expect(fmtCompact(202.34, "%")).toBe("202.3%");
  });
  it("compacts large counts without inventing a currency", () => {
    expect(fmtCompact(211_140_729, "people")).toBe("211.1M");
    expect(fmtCompact(1_417_000_000, "people")).toBe("1.4B");
  });
  it("scales generic units and keeps the suffix", () => {
    expect(fmtCompact(1_234_000_000_000, "kWh")).toBe("1.2T kWh");
    expect(fmtCompact(540.5678, "TWh")).toBe("540.57 TWh");
    expect(fmtCompact(98_765, "km")).toBe("98,765 km");
  });
  it("trims long decimals on small unitless values", () => {
    expect(fmtCompact(2.906429718, "")).toBe("2.91");
  });
});
