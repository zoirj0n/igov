import { clamp, formatCurrency, formatNumber, formatPercent } from "@/utils/helpers";
import { describe, expect, it } from "vitest";

describe("helpers", () => {
  it("formats numbers in en", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("formats currency in en", () => {
    expect(formatCurrency(1000, "USD")).toMatch(/\$1,000/);
  });

  it("formats percent", () => {
    expect(formatPercent(0.1234)).toMatch(/12\.3%/);
  });

  it("uses Western (latn) digits in Arabic — UAE convention, pinned across engines", () => {
    const out = formatNumber(1234567, "ar");
    expect(out).toContain("1");
    expect(out).not.toMatch(/[٠-٩]/); // no Eastern Arabic-Indic digits
    expect(formatPercent(0.1234, "ar")).toMatch(/12\.3/);
    expect(formatCurrency(1000, "USD", "ar")).not.toMatch(/[٠-٩]/);
  });

  it("clamps", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
