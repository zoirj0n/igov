"use client";

import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";
import { useEffect, useState } from "react";

interface ForecastPoint {
  year: number;
  value: number;
  lower: number;
  upper: number;
  kind: "history" | "forecast";
}

interface ForecastResult {
  iso3: string;
  metric: string;
  horizon: number;
  series: ForecastPoint[];
  alpha: number;
  beta: number;
  rmse: number;
  confidence: "high" | "med" | "low";
  modelName: string;
}

const METRIC_OPTIONS: { value: string; label: string; unit: string }[] = [
  { value: "gdp_usd_nominal", label: "GDP (nominal)", unit: "USD" },
  { value: "gdp_growth_pct", label: "GDP growth", unit: "%" },
  { value: "renewables_share_pct", label: "Renewables share", unit: "%" },
];

function fmtTick(v: number, unit: string): string {
  if (unit === "USD") {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);
  }
  return v.toFixed(1);
}

function ForecastChart({ series, unit }: { series: ForecastPoint[]; unit: string }) {
  if (series.length < 2) return null;

  const W = 720;
  const H = 240;
  const padL = 56;
  const padR = 16;
  const padT = 12;
  const padB = 36; // extra bottom for year ticks with (f)/(e) markers

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const historyPts = series.filter((p) => p.kind === "history");
  const forecastPts = series.filter((p) => p.kind === "forecast");
  const lastHist = historyPts[historyPts.length - 1];

  const minX = (series[0] as ForecastPoint).year;
  const maxX = (series[series.length - 1] as ForecastPoint).year;
  const allValues = series.flatMap((p) => (p.kind === "history" ? [p.value] : [p.lower, p.upper]));
  const minY = Math.min(...allValues);
  const maxY = Math.max(...allValues);
  const rangeY = Math.max(1e-9, maxY - minY);

  const sx = (x: number): number => padL + ((x - minX) / Math.max(1, maxX - minX)) * innerW;
  const sy = (y: number): number => padT + innerH - ((y - minY) / rangeY) * innerH;

  const historyPath = historyPts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.year).toFixed(1)} ${sy(p.value).toFixed(1)}`)
    .join(" ");

  const forecastPath = (lastHist ? [lastHist, ...forecastPts] : forecastPts)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.year).toFixed(1)} ${sy(p.value).toFixed(1)}`)
    .join(" ");

  const bandBase = lastHist ? [lastHist, ...forecastPts] : forecastPts;
  const bandTop = bandBase.map(
    (p) => `${sx(p.year).toFixed(1)},${sy(p.kind === "forecast" ? p.upper : p.value).toFixed(1)}`,
  );
  const bandBot = [...bandBase]
    .reverse()
    .map(
      (p) => `${sx(p.year).toFixed(1)},${sy(p.kind === "forecast" ? p.lower : p.value).toFixed(1)}`,
    );
  const bandPolygon = [...bandTop, ...bandBot].join(" ");

  const yTicks = 5;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-4 block w-full"
      role="img"
      aria-label="Forecast chart"
    >
      {/* Y gridlines */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const y = padT + (innerH / yTicks) * i;
        const v = maxY - (rangeY / yTicks) * i;
        return (
          <g key={`yt-${i}`}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y}
              y2={y}
              className="stroke-ink-150"
              strokeWidth={1}
            />
            <text x={padL - 6} y={y + 3} fontSize={9} className="fill-ink-500" textAnchor="end">
              {fmtTick(v, unit)}
            </text>
          </g>
        );
      })}

      {/* X year ticks — thinned so labels never collide. Anchor years (first, last
          history "(e)", last forecast "(f)") are placed first; remaining years fill
          in only where a minimum pixel gap to already-placed labels remains. */}
      {(() => {
        const minGapPx = 48; // "2026 (f)" at 9px ≈ 40px wide + breathing room
        const lastForecast = forecastPts[forecastPts.length - 1];
        const anchors = new Set([series[0], lastHist, lastForecast].filter(Boolean));
        const ordered = [...series].sort((a, b) => Number(anchors.has(b)) - Number(anchors.has(a)));
        const placedX: number[] = [];
        const labeled = ordered.filter((p) => {
          const x = sx(p.year);
          if (placedX.some((q) => Math.abs(q - x) < minGapPx)) return false;
          placedX.push(x);
          return true;
        });
        return labeled.map((p) => {
          const isLastHistory = p === lastHist;
          const isForecast = p.kind === "forecast";
          const suffix = isLastHistory ? " (e)" : isForecast ? " (f)" : "";
          return (
            <text
              key={`xt-${p.year}`}
              x={sx(p.year)}
              y={H - padB + 16}
              fontSize={9}
              className={isForecast ? undefined : "fill-ink-500"}
              fill={isForecast ? "oklch(0.58 0.07 250)" : undefined}
              textAnchor="middle"
            >
              {p.year}
              {suffix}
            </text>
          );
        });
      })()}

      {/* Vertical divider at forecast start */}
      {lastHist && (
        <line
          x1={sx(lastHist.year)}
          x2={sx(lastHist.year)}
          y1={padT}
          y2={H - padB}
          className="stroke-ink-300"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
      )}

      {/* Confidence band */}
      <polygon points={bandPolygon} fill="oklch(0.58 0.07 250 / 0.15)" stroke="none" />

      {/* History polyline — solid */}
      <path
        d={historyPath}
        fill="none"
        className="stroke-ink-800"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />

      {/* Forecast polyline — dashed */}
      <path
        d={forecastPath}
        fill="none"
        stroke="oklch(0.58 0.07 250)"
        strokeWidth={1.8}
        strokeDasharray="5 4"
        strokeLinejoin="round"
      />

      {/* History dots */}
      {historyPts.map((p) => (
        <circle
          key={`h-${p.year}`}
          cx={sx(p.year)}
          cy={sy(p.value)}
          r={2}
          className="fill-ink-800"
        />
      ))}

      {/* Forecast dots */}
      {forecastPts.map((p) => (
        <circle
          key={`f-${p.year}`}
          cx={sx(p.year)}
          cy={sy(p.value)}
          r={2.5}
          fill="oklch(0.58 0.07 250)"
        />
      ))}
    </svg>
  );
}

export function ForecastView({
  state,
  iso3,
}: {
  state: AgentState;
  iso3: string;
}) {
  const { t } = useI18n();
  const x = t.experience.forecastView;

  const [metric, setMetric] = useState("gdp_usd_nominal");
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let on = true;
    setStatus("loading");
    setResult(null);

    fetch(`/api/insights/forecast?iso3=${iso3}&metric=${metric}&horizon=5`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ForecastResult;
      })
      .then((d) => {
        if (!on) return;
        setResult(d);
        setStatus("ready");
      })
      .catch(() => {
        if (!on) return;
        setStatus("error");
      });

    return () => {
      on = false;
    };
  }, [iso3, metric]);

  const metricMeta = METRIC_OPTIONS.find((m) => m.value === metric);
  const scenarios = state.briefing?.scenarios ?? [];
  const watchlist = state.briefing?.watchlist ?? [];

  return (
    <div className="space-y-5">
      {/* Metric selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-ink-500">{x.metricLabel}</label>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 text-sm shadow-card transition focus:border-accent"
          aria-label={x.metricLabel}
        >
          {METRIC_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        {result && (
          <span
            className={
              result.confidence === "high"
                ? "chip chip-ok"
                : result.confidence === "med"
                  ? "chip chip-warn"
                  : "chip chip-risk"
            }
          >
            {x.confidence} · {result.confidence}
          </span>
        )}
      </div>

      {/* Chart area */}
      <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
        {status === "loading" && (
          <p className="py-10 text-center text-sm text-ink-500">{x.loading}</p>
        )}
        {status === "error" && (
          <p className="py-10 text-center text-sm text-ink-500">{x.unavailable}</p>
        )}
        {status === "ready" && result && (
          <>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs text-ink-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-6 bg-ink-800" aria-hidden />
                {x.history}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-6"
                  style={{
                    background: "oklch(0.58 0.07 250)",
                    borderTop: "1px dashed oklch(0.58 0.07 250)",
                  }}
                  aria-hidden
                />
                {x.forecast}
              </span>
            </div>

            <ForecastChart series={result.series} unit={metricMeta?.unit ?? ""} />

            {/* State forecast read */}
            {state.forecast?.read && (
              <p className="mt-3 text-sm italic text-ink-600">{state.forecast.read}</p>
            )}

            {/* Model footer */}
            <p className="mt-3 font-mono text-2xs text-ink-400">
              {x.model}: {result.modelName} · RMSE {result.rmse.toExponential(2)}
            </p>
          </>
        )}
      </div>

      {/* Scenario cards */}
      {scenarios.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {x.scenarios}
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {scenarios.map((s) => (
              <div key={s.name} className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
                <p className="font-semibold text-ink-800">{s.name}</p>
                <p className="mt-0.5 text-xs text-ink-600">{s.outlook}</p>
                <p className="mt-1 text-2xs text-ink-400">{s.likelihood}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Watchlist chips */}
      {watchlist.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {x.watchlist}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {watchlist.map((item) => (
              <span
                key={item}
                className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs text-ink-700"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
