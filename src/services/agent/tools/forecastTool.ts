/**
 * Forecast tool — thin wrapper over the existing Holt's linear-trend forecaster.
 * Projects one period ahead and returns the point + 95% band. Callers must
 * supply >= 3 historical points (Holt's requirement); nodes guard for this.
 */
import type { ForecastSummary } from "@/services/agent/state";
import { forecastHolt } from "@/services/predict/holts";

export interface ForecastInput {
  label: string;
  series: { year: number; value: number }[];
}

export function forecastTool(input: ForecastInput): ForecastSummary {
  const res = forecastHolt(input.series, 1);
  const fc = res.series[res.series.length - 1];
  if (!fc) throw new Error("forecast produced no points");
  return {
    label: input.label,
    next: fc.value,
    lowerBand: fc.lower,
    upperBand: fc.upper,
    read: `${input.label} projected to ${Math.round(fc.value).toLocaleString()} (${res.confidence} confidence, ${res.modelName}).`,
  };
}
