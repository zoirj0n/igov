import { forecastHolt } from "@/services/predict/holts";
import { describe, expect, it } from "vitest";

describe("Holt's linear trend", () => {
  it("projects steady linear series with low rmse", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ year: 2015 + i, value: 100 + i * 5 }));
    const r = forecastHolt(history, 3);
    expect(r.series.filter((p) => p.kind === "forecast")).toHaveLength(3);
    expect(r.rmse).toBeLessThan(2);
    expect(r.confidence).toBe("high");
    const lastForecast = r.series[r.series.length - 1];
    expect(lastForecast?.value).toBeGreaterThan(150);
    expect(lastForecast?.value).toBeLessThan(180);
  });

  it("widens band with horizon", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      year: 2015 + i,
      value: 100 + i * 5 + Math.sin(i) * 2,
    }));
    const r = forecastHolt(history, 5);
    const forecasts = r.series.filter((p) => p.kind === "forecast");
    const band0 =
      (forecasts[0] as { upper: number; lower: number }).upper -
      (forecasts[0] as { upper: number; lower: number }).lower;
    const band4 =
      (forecasts[4] as { upper: number; lower: number }).upper -
      (forecasts[4] as { upper: number; lower: number }).lower;
    expect(band4).toBeGreaterThan(band0);
  });

  it("rejects too-short history", () => {
    expect(() =>
      forecastHolt(
        [
          { year: 2020, value: 1 },
          { year: 2021, value: 2 },
        ],
        3,
      ),
    ).toThrow();
  });

  it("selects (alpha, beta) within bounds", () => {
    const history = Array.from({ length: 8 }, (_, i) => ({ year: 2018 + i, value: i * i }));
    const r = forecastHolt(history, 2);
    expect(r.alpha).toBeGreaterThanOrEqual(0.1);
    expect(r.alpha).toBeLessThanOrEqual(0.95);
    expect(r.beta).toBeGreaterThanOrEqual(0.05);
    expect(r.beta).toBeLessThanOrEqual(0.8);
  });
});
