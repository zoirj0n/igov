"use client";

import { Skeleton } from "@/components/shared/Skeleton";
import { COUNTRIES } from "@/lib/data/countries";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useI18n } from "@/lib/i18n/context";
import { localeTag } from "@/utils/format";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface RadarPoint {
  axis: string;
  score: number;
  type: "risk" | "opportunity";
}

const RADAR: Record<string, RadarPoint[]> = {
  ARE: [
    { axis: "Hydrogen export", score: 82, type: "opportunity" },
    { axis: "Critical minerals access", score: 64, type: "opportunity" },
    { axis: "Sovereign AI compute", score: 71, type: "opportunity" },
    { axis: "Climate finance leadership", score: 78, type: "opportunity" },
    { axis: "Oil-price exposure", score: 58, type: "risk" },
    { axis: "Water scarcity", score: 73, type: "risk" },
    { axis: "Talent attraction", score: 81, type: "opportunity" },
    { axis: "Geopolitical hedging", score: 67, type: "risk" },
  ],
};

const BENCHMARKS = [
  { country: "ARE", renewables: 14.2, sdg: 72.3, gdp_growth: 4.4 },
  { country: "SAU", renewables: 6.1, sdg: 70.9, gdp_growth: 3.1 },
  { country: "DEU", renewables: 52.1, sdg: 81.5, gdp_growth: 0.7 },
  { country: "JPN", renewables: 24.3, sdg: 79.4, gdp_growth: 1.0 },
  { country: "KOR", renewables: 9.8, sdg: 78.2, gdp_growth: 2.1 },
];

const PREDICTABLE_METRICS: { value: string; label: string; unit: string }[] = [
  { value: "gdp_usd_nominal", label: "GDP (nominal)", unit: "USD" },
  { value: "gdp_growth_pct", label: "GDP growth", unit: "%" },
  { value: "population", label: "Population", unit: "people" },
  { value: "co2_per_capita_t", label: "CO₂ per capita", unit: "t" },
  { value: "renewables_share_pct", label: "Renewables share", unit: "%" },
  { value: "exports_usd", label: "Exports", unit: "USD" },
  { value: "fdi_inflows_usd", label: "FDI inflows", unit: "USD" },
];

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

function formatValue(v: number, unit: string, tag: string): string {
  if (unit === "USD") {
    return new Intl.NumberFormat(tag, {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(v);
  }
  if (unit === "people") {
    return new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 }).format(v);
  }
  if (unit === "%") return `${v.toFixed(2)}%`;
  if (unit === "t") return `${v.toFixed(2)} t`;
  return new Intl.NumberFormat(tag).format(v);
}

export function InsightsView() {
  useDocumentTitle("Insights");
  const { t, locale } = useI18n();
  const numTag = localeTag(locale);
  const sp = useSearchParams();
  const initialIso = (() => {
    const q = sp?.get("country")?.toUpperCase();
    return q && COUNTRIES.some((c) => c.iso3 === q) ? q : "ARE";
  })();
  const [iso, setIso] = useState(initialIso);
  const [metric, setMetric] = useState("gdp_usd_nominal");
  const [horizon, setHorizon] = useState(5);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const country = COUNTRIES.find((c) => c.iso3 === iso);
  const metricMeta = PREDICTABLE_METRICS.find((m) => m.value === metric);
  const points = RADAR[iso] ?? RADAR.ARE!;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setForecast(null);
    fetch(`/api/insights/forecast?iso3=${iso}&metric=${metric}&horizon=${horizon}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${r.status}`);
        return d as ForecastResult;
      })
      .then((d) => {
        if (!cancelled) setForecast(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [iso, metric, horizon]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter text-ink-800">
            {t.insights.title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Risk radar · Holt's forecast · peer benchmarks
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={iso}
            onChange={(e) => setIso(e.target.value)}
            className="rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 text-sm shadow-card transition focus:border-accent"
            aria-label="country"
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso3} value={c.iso3}>
                {c.flagEmoji} {c.iso3} — {c.nameEn}
              </option>
            ))}
          </select>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 text-sm shadow-card transition focus:border-accent"
            aria-label="metric"
          >
            {PREDICTABLE_METRICS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 text-xs shadow-card">
            <span className="text-ink-500">horizon</span>
            <input
              type="number"
              min={1}
              max={15}
              value={horizon}
              onChange={(e) => setHorizon(Math.max(1, Math.min(15, Number(e.target.value))))}
              className="w-12 rounded-sm border border-ink-150 px-1.5 py-0.5 text-sm focus:border-accent focus:outline-none"
            />
            <span className="text-ink-400">yr</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.5fr]">
        <section className="card p-5">
          <h2 className="section-title">{t.insights.riskRadar}</h2>
          <div className="mt-3 space-y-2">
            {points.map((p) => (
              <div key={p.axis} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div>
                  <div className="mb-1 flex items-baseline justify-between text-[11px]">
                    <span className="text-ink-700">{p.axis}</span>
                    <span className={p.type === "risk" ? "text-signal-risk" : "text-signal-ok"}>
                      {p.type}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-xs bg-ink-100">
                    <div
                      className={
                        p.type === "risk" ? "h-full bg-signal-risk" : "h-full bg-signal-ok"
                      }
                      style={{ width: `${p.score}%` }}
                    />
                  </div>
                </div>
                <span className="tabular text-sm text-ink-800">{p.score}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">
              {t.insights.forecast} — {country?.nameEn} · {metricMeta?.label}
            </h2>
            {forecast && (
              <span
                className={
                  forecast.confidence === "high"
                    ? "chip chip-ok"
                    : forecast.confidence === "med"
                      ? "chip chip-warn"
                      : "chip chip-risk"
                }
              >
                confidence · {forecast.confidence}
              </span>
            )}
          </div>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mt-4 rounded-md border border-signal-risk/30 bg-signal-risk/5 px-3 py-2 text-xs text-signal-risk"
            >
              {error}
            </div>
          )}
          {loading && <Skeleton className="mt-4 h-64 w-full" />}
          {forecast && !loading && (
            <>
              <ForecastChart series={forecast.series} unit={metricMeta?.unit ?? ""} tag={numTag} />
              <div className="mt-3 font-mono text-2xs text-ink-400">
                {forecast.modelName} · RMSE {forecast.rmse.toExponential(2)} · history{" "}
                {forecast.series.filter((p) => p.kind === "history").length} pts
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {forecast.series
                  .filter((p) => p.kind === "forecast")
                  .slice(0, 3)
                  .map((p) => (
                    <div
                      key={p.year}
                      className="rounded-md border border-ink-100 bg-ink-50/60 p-2.5"
                    >
                      <div className="text-2xs font-medium text-ink-500">{p.year}</div>
                      <div className="tabular mt-0.5 text-sm font-semibold text-ink-800">
                        {formatValue(p.value, metricMeta?.unit ?? "", numTag)}
                      </div>
                      <div className="mt-0.5 text-2xs text-ink-400">
                        ± {formatValue((p.upper - p.lower) / 2, metricMeta?.unit ?? "", numTag)}
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="section-title">
          {t.insights.benchmarks} — {country?.nameEn} vs peers
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-ink-50">
              <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2 text-start">Country</th>
                <th className="px-4 py-2 text-start">Renewables %</th>
                <th className="px-4 py-2 text-start">SDG score</th>
                <th className="px-4 py-2 text-start">GDP growth</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARKS.map((r) => (
                <tr key={r.country} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-ink-800">{r.country}</td>
                  <td className="px-4 py-2 tabular">{r.renewables.toFixed(1)}%</td>
                  <td className="px-4 py-2 tabular">{r.sdg.toFixed(1)}</td>
                  <td className="px-4 py-2 tabular">{r.gdp_growth.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ForecastChart({
  series,
  unit,
  tag,
}: {
  series: ForecastPoint[];
  unit: string;
  tag: string;
}) {
  if (series.length < 2) return null;
  const W = 720;
  const H = 240;
  const padL = 56;
  const padR = 16;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const minX = (series[0] as ForecastPoint).year;
  const maxX = (series[series.length - 1] as ForecastPoint).year;
  const allValues = series.flatMap((p) => (p.kind === "history" ? [p.value] : [p.lower, p.upper]));
  const minY = Math.min(...allValues);
  const maxY = Math.max(...allValues);
  const rangeY = Math.max(1e-9, maxY - minY);

  const sx = (x: number): number => padL + ((x - minX) / Math.max(1, maxX - minX)) * innerW;
  const sy = (y: number): number => padT + innerH - ((y - minY) / rangeY) * innerH;

  const historyPath = series
    .filter((p) => p.kind === "history")
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.year).toFixed(1)} ${sy(p.value).toFixed(1)}`)
    .join(" ");

  const forecastPoints = series.filter((p) => p.kind === "forecast");
  const lastHist = series.filter((p) => p.kind === "history").slice(-1)[0];

  const forecastPath = (lastHist ? [lastHist, ...forecastPoints] : forecastPoints)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.year).toFixed(1)} ${sy(p.value).toFixed(1)}`)
    .join(" ");

  const bandTop = (lastHist ? [lastHist, ...forecastPoints] : forecastPoints).map(
    (p) => `${sx(p.year).toFixed(1)},${sy(p.kind === "forecast" ? p.upper : p.value).toFixed(1)}`,
  );
  const bandBot = (lastHist ? [...forecastPoints, lastHist] : [...forecastPoints])
    .reverse()
    .map(
      (p) => `${sx(p.year).toFixed(1)},${sy(p.kind === "forecast" ? p.lower : p.value).toFixed(1)}`,
    );
  const bandPolygon = [...bandTop, ...bandBot].join(" ");

  const yTicks = 5;

  function fmtTick(v: number): string {
    if (unit === "USD")
      return new Intl.NumberFormat(tag, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(v);
    if (unit === "people")
      return new Intl.NumberFormat(tag, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(v);
    if (unit === "%") return v.toFixed(1);
    return v.toFixed(1);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 block w-full" role="img" aria-label="Forecast">
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
              {fmtTick(v)}
            </text>
          </g>
        );
      })}
      {[minX, Math.round((minX + maxX) / 2), maxX].map((x) => (
        <text
          key={`xt-${x}`}
          x={sx(x)}
          y={H - padB + 14}
          fontSize={9}
          className="fill-ink-500"
          textAnchor="middle"
        >
          {x}
        </text>
      ))}
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
      {lastHist && (
        <text
          x={sx(lastHist.year) + 4}
          y={padT + 9}
          fontSize={9}
          className="fill-ink-500"
          fontFamily='"JetBrains Mono", monospace'
        >
          forecast →
        </text>
      )}
      <polygon points={bandPolygon} fill="oklch(0.58 0.07 250 / 0.15)" stroke="none" />
      <path
        d={historyPath}
        fill="none"
        className="stroke-ink-800"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path
        d={forecastPath}
        fill="none"
        stroke="oklch(0.58 0.07 250)"
        strokeWidth={1.8}
        strokeDasharray="5 4"
        strokeLinejoin="round"
      />
      {series
        .filter((p) => p.kind === "history")
        .map((p) => (
          <circle
            key={`h-${p.year}`}
            cx={sx(p.year)}
            cy={sy(p.value)}
            r={2}
            className="fill-ink-800"
          />
        ))}
      {forecastPoints.map((p) => (
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
