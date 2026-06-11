import type { HistoricalPoint } from "./historical";

export interface ForecastPoint {
  year: number;
  value: number;
  lower: number;
  upper: number;
  kind: "history" | "forecast";
}

export interface ForecastResult {
  series: ForecastPoint[];
  alpha: number;
  beta: number;
  rmse: number;
  confidence: "high" | "med" | "low";
  modelName: string;
}

interface SmoothedState {
  level: number;
  trend: number;
}

function holtsStep(prev: SmoothedState, obs: number, alpha: number, beta: number): SmoothedState {
  const level = alpha * obs + (1 - alpha) * (prev.level + prev.trend);
  const trend = beta * (level - prev.level) + (1 - beta) * prev.trend;
  return { level, trend };
}

function runHolts(
  values: number[],
  alpha: number,
  beta: number,
): { states: SmoothedState[]; rmse: number } {
  if (values.length < 2) {
    throw new Error("need >= 2 historical points");
  }
  const first = values[0] as number;
  const second = values[1] as number;
  const initialTrend = second - first;
  const states: SmoothedState[] = [{ level: first, trend: initialTrend }];

  let sse = 0;
  let n = 0;
  for (let i = 1; i < values.length; i++) {
    const prev = states[i - 1] as SmoothedState;
    const obs = values[i] as number;
    const forecast = prev.level + prev.trend;
    sse += (obs - forecast) ** 2;
    n++;
    states.push(holtsStep(prev, obs, alpha, beta));
  }
  const rmse = Math.sqrt(sse / Math.max(1, n));
  return { states, rmse };
}

function gridSearch(values: number[]): { alpha: number; beta: number; rmse: number } {
  let best = { alpha: 0.5, beta: 0.1, rmse: Number.POSITIVE_INFINITY };
  for (let a = 0.1; a <= 0.95; a += 0.05) {
    for (let b = 0.05; b <= 0.8; b += 0.05) {
      const { rmse } = runHolts(values, a, b);
      if (rmse < best.rmse) best = { alpha: a, beta: b, rmse };
    }
  }
  return best;
}

export function forecastHolt(history: HistoricalPoint[], horizonYears: number): ForecastResult {
  if (history.length < 3) throw new Error("need >= 3 historical points");
  const values = history.map((p) => p.value);
  const { alpha, beta } = gridSearch(values);
  const { states, rmse } = runHolts(values, alpha, beta);
  const last = states[states.length - 1] as SmoothedState;
  const lastYear = (history[history.length - 1] as HistoricalPoint).year;

  const series: ForecastPoint[] = history.map((p) => ({
    year: p.year,
    value: p.value,
    lower: p.value,
    upper: p.value,
    kind: "history",
  }));

  for (let h = 1; h <= horizonYears; h++) {
    const pointForecast = last.level + h * last.trend;
    const bandWidth = 1.96 * rmse * Math.sqrt(h);
    series.push({
      year: lastYear + h,
      value: pointForecast,
      lower: pointForecast - bandWidth,
      upper: pointForecast + bandWidth,
      kind: "forecast",
    });
  }

  const meanAbs = values.reduce((a, b) => a + Math.abs(b), 0) / values.length || 1;
  const cv = rmse / meanAbs;
  const confidence: "high" | "med" | "low" = cv < 0.05 ? "high" : cv < 0.15 ? "med" : "low";

  return {
    series,
    alpha,
    beta,
    rmse,
    confidence,
    modelName: `Holt's linear trend (α=${alpha.toFixed(2)}, β=${beta.toFixed(2)})`,
  };
}
