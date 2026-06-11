import { forecastTool } from "@/services/agent/tools/forecastTool";
import { describe, expect, it } from "vitest";

describe("forecastTool", () => {
  it("projects an upward series beyond its last value", () => {
    const r = forecastTool({
      label: "GDP",
      series: [
        { year: 2019, value: 1 },
        { year: 2020, value: 2 },
        { year: 2021, value: 3 },
        { year: 2022, value: 4 },
      ],
    });
    expect(r.next).toBeGreaterThan(4);
    expect(r.upperBand).toBeGreaterThanOrEqual(r.next);
    expect(r.lowerBand).toBeLessThanOrEqual(r.next);
    expect(r.read).toContain("GDP");
  });
});
