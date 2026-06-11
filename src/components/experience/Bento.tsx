"use client";

import { initialsOf, photoProxySrc } from "@/components/experience/counterpart-utils";
import { DonutChart } from "@/components/shared/DonutChart";
import { Sparkline } from "@/components/shared/LineChart";
import { seriesFor } from "@/lib/data/timeseries";
import { fmtCompact, fmtUsd } from "@/lib/experience/format";
import type { FocusView } from "@/lib/experience/machine";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";
import { motion } from "motion/react";

/** Compact area chart for the one-pager overview — axis-light, executive-readable. */
function TrendArea({ points }: { points: { year: number; value: number }[] }) {
  if (points.length < 2) return null;
  const W = 560;
  const H = 132;
  const padX = 8;
  const padT = 14;
  const padB = 20;
  const minX = points[0]?.year ?? 0;
  const maxX = points[points.length - 1]?.year ?? 1;
  const vals = points.map((p) => p.value);
  const minY = Math.min(...vals);
  const maxY = Math.max(...vals);
  const rangeY = Math.max(1e-9, maxY - minY);
  const sx = (x: number) => padX + ((x - minX) / Math.max(1, maxX - minX)) * (W - padX * 2);
  const sy = (y: number) => padT + (H - padT - padB) * (1 - (y - minY) / rangeY);
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.year).toFixed(1)} ${sy(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${sx(maxX).toFixed(1)} ${H - padB} L ${sx(minX).toFixed(1)} ${H - padB} Z`;
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block w-full" role="img" aria-label="Trend">
      <path d={area} className="fill-accent" opacity={0.14} />
      <path d={line} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" />
      {last && <circle cx={sx(last.year)} cy={sy(last.value)} r={3.5} className="fill-accent" />}
      <text x={sx(minX)} y={H - 6} fontSize={10} className="fill-ink-400" textAnchor="start">
        {minX}
      </text>
      <text x={sx(maxX)} y={H - 6} fontSize={10} className="fill-ink-400" textAnchor="end">
        {maxX}
      </text>
    </svg>
  );
}

function Shimmer({ lines = 2 }: { lines?: number }) {
  return (
    <div className="mt-2 space-y-2">
      {Array.from({ length: lines }, (_, i) => {
        const w = 85 - i * 18;
        return (
          <div key={w} className="shimmer h-3 rounded bg-ink-150" style={{ width: `${w}%` }} />
        );
      })}
    </div>
  );
}

function Tile({
  id,
  label,
  span,
  onClick,
  children,
}: {
  id?: FocusView;
  label: string;
  span: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls = `${span} rounded-xl border border-ink-200 bg-ink-100/90 p-4 text-start shadow-card ${
    onClick ? "cursor-pointer transition hover:border-accent/50" : ""
  }`;
  const inner = (
    <>
      <div className="text-2xs font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      {children}
    </>
  );
  return onClick ? (
    <motion.button
      layout
      layoutId={id ? `tile-${id}` : undefined}
      type="button"
      onClick={onClick}
      className={cls}
    >
      {inner}
    </motion.button>
  ) : (
    <motion.div layout layoutId={id ? `tile-${id}` : undefined} className={cls}>
      {inner}
    </motion.div>
  );
}

export function Bento({
  state,
  mode,
  onFocus,
}: {
  state: AgentState | null;
  mode: "assembling" | "ready";
  onFocus?: (v: FocusView) => void;
}) {
  const { locale, t } = useI18n();
  const x = t.experience.tiles;
  const tv = t.experience.tradeView;
  const assembling = mode === "assembling";
  const b = locale === "ar" ? (state?.briefingAr ?? state?.briefing) : state?.briefing;
  const cp = state?.counterpart;
  const trade = state?.trade;
  const opps = state?.opportunities?.slice(0, 3) ?? [];
  const opp = opps[0];
  const indicators = state?.indicators?.slice(0, 3) ?? [];
  const forecast = state?.forecast;
  const dev = state?.developments;
  const fullSeries = state?.gdpSeries ?? [];
  const series = fullSeries.slice(-5);
  const maxV = Math.max(...series.map((p) => p.value), 1);
  const exportShare =
    trade && trade.totalUsd > 0 ? Math.round((trade.exportsUsd / trade.totalUsd) * 100) : 0;

  // Report rows: grounded indicator + synthetic 5y mini-trend, grouped for the one-pager.
  const iso3 = state?.scope?.iso3 ?? "";
  const allIndicators = state?.indicators ?? [];
  const reportRows = (codes: string[]) =>
    codes
      .map((code) => allIndicators.find((i) => i.code === code))
      .filter((i): i is NonNullable<typeof i> => Boolean(i))
      .map((i) => ({
        ...i,
        spark:
          i.code === "gdp" && fullSeries.length > 1
            ? fullSeries.slice(-6).map((p) => p.value)
            : seriesFor(iso3, i.code, i.value, 6).map((p) => p.value),
      }));
  const marketRows = reportRows(["gdp", "gdp_growth", "exports", "fdi"]);
  const energyRows = reportRows(["electricity_pc", "renew_share", "oil_production", "co2"]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
      {(b || assembling) && (
        <Tile
          id="brief"
          label={x.bluf}
          span="md:col-span-6"
          onClick={b && onFocus ? () => onFocus("brief") : undefined}
        >
          {b ? (
            <>
              <p className="mt-1.5 line-clamp-3 text-base font-semibold leading-snug text-ink-800">
                {b.bluf}
              </p>
              {b.heroMetric && (
                <p className="mt-2 text-sm text-tamm-cyan">
                  {b.heroMetric.label}:{" "}
                  <span className="font-display font-bold">{b.heroMetric.value}</span>{" "}
                  <span className="text-ink-500">{b.heroMetric.delta}</span>
                </p>
              )}
            </>
          ) : (
            <Shimmer lines={3} />
          )}
        </Tile>
      )}

      {(cp || assembling) && (
        <Tile
          id="counterpart"
          label={x.counterpart}
          span="md:col-span-3"
          onClick={cp && onFocus ? () => onFocus("counterpart") : undefined}
        >
          {cp ? (
            <div className="mt-1.5 flex items-center gap-3">
              {photoProxySrc(cp) ? (
                <img
                  src={photoProxySrc(cp)}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full border border-accent/40 object-cover"
                />
              ) : (
                <div
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-accent/40 bg-ink-150 text-sm font-bold text-tamm-cyan"
                  aria-hidden
                >
                  {cp.confidence === "unconfirmed" ? "?" : initialsOf(cp.name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-800">
                  {cp.confidence === "unconfirmed"
                    ? t.experience.counterpartView.unconfirmedTitle
                    : cp.name}
                </p>
                <p className="truncate text-2xs text-ink-500">{cp.role}</p>
                {cp.confidence === "unconfirmed" ? (
                  <p className="text-2xs text-tamm-olive">
                    ⚠ {t.experience.counterpartView.verifyShort}
                  </p>
                ) : (
                  <p className="text-2xs text-ink-400">{cp.identifiedAsOf}</p>
                )}
              </div>
            </div>
          ) : (
            <Shimmer />
          )}
        </Tile>
      )}

      {(trade || assembling) && (
        <Tile
          id="trade"
          label={x.trade}
          span="md:col-span-3"
          onClick={trade && onFocus ? () => onFocus("trade") : undefined}
        >
          {trade ? (
            <>
              <p className="mt-1.5 font-mono text-2xl font-bold text-ink-900">
                {fmtUsd(trade.totalUsd)}
              </p>
              <p className="mt-1 text-2xs text-ink-500">
                ↑ {fmtUsd(trade.exportsUsd)} · ↓ {fmtUsd(trade.importsUsd)}
              </p>
              <p className="mt-1 text-2xs text-ink-400">
                {trade.source} · {trade.year}
              </p>
            </>
          ) : (
            <Shimmer />
          )}
        </Tile>
      )}

      {(opp || assembling) && (
        <Tile
          id="opportunities"
          label={x.topOpportunity}
          span="md:col-span-4"
          onClick={opp && onFocus ? () => onFocus("opportunities") : undefined}
        >
          {opps.length > 0 ? (
            <ul className="mt-1.5 space-y-2.5">
              {opps.map((o) => (
                <li key={o.title}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800">
                      {o.title}
                    </p>
                    <span className="shrink-0 font-mono text-xs font-bold text-tamm-cyan">
                      {Math.round(o.score)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-150">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${o.score}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Shimmer />
          )}
        </Tile>
      )}

      {(indicators.length > 0 || assembling) && (
        <Tile
          id="profile"
          label={x.indicators}
          span="md:col-span-4"
          onClick={indicators.length > 0 && onFocus ? () => onFocus("profile") : undefined}
        >
          {indicators.length > 0 ? (
            <ul className="mt-1.5 space-y-2">
              {indicators.map((i) => (
                <li key={i.code} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-500">{i.label}</span>
                  <span className="shrink-0 text-end">
                    <span className="font-display text-lg font-bold tabular text-ink-900">
                      {fmtCompact(i.value, i.unit)}
                    </span>
                    <span className="block text-2xs leading-tight text-ink-400">
                      {i.source} · {i.year}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Shimmer lines={3} />
          )}
        </Tile>
      )}

      {(forecast || assembling) && (
        <Tile
          id="forecast"
          label={x.forecast}
          span="md:col-span-4"
          onClick={forecast && onFocus ? () => onFocus("forecast") : undefined}
        >
          {forecast ? (
            <>
              <p className="mt-1.5 text-sm text-ink-600">{forecast.label}</p>
              <div className="mt-2 flex h-10 items-end gap-1" dir="ltr">
                {series.map((p) => (
                  <div
                    key={p.year}
                    title={`${p.year}`}
                    className="w-3 rounded-sm bg-accent/70"
                    style={{ height: `${Math.max(12, (p.value / maxV) * 100)}%` }}
                  />
                ))}
                <span className="ms-2 min-w-0 self-center truncate font-mono text-lg font-bold text-tamm-cyan">
                  {fmtCompact(forecast.next, forecast.next >= 1e6 ? "USD" : "")}
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-2xs text-ink-400">{forecast.read}</p>
            </>
          ) : (
            <Shimmer />
          )}
        </Tile>
      )}

      {marketRows.length > 0 && (
        <Tile label={x.market} span="md:col-span-6">
          <ul className="mt-2 space-y-2.5">
            {marketRows.map((i) => (
              <li key={i.code} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-xs text-ink-500">{i.label}</span>
                <span dir="ltr">
                  <Sparkline values={i.spark} width={72} height={20} />
                </span>
                <span className="w-24 shrink-0 text-end font-display text-base font-bold tabular text-ink-900">
                  {fmtCompact(i.value, i.unit)}
                </span>
              </li>
            ))}
          </ul>
        </Tile>
      )}

      {energyRows.length > 0 && (
        <Tile label={x.energy} span="md:col-span-6">
          <ul className="mt-2 space-y-2.5">
            {energyRows.map((i) => (
              <li key={i.code} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-xs text-ink-500">{i.label}</span>
                <span dir="ltr">
                  <Sparkline values={i.spark} width={72} height={20} />
                </span>
                <span className="w-24 shrink-0 text-end font-display text-base font-bold tabular text-ink-900">
                  {fmtCompact(i.value, i.unit)}
                </span>
              </li>
            ))}
          </ul>
        </Tile>
      )}

      {fullSeries.length > 1 && (
        <Tile label={x.trend} span="md:col-span-8">
          <div className="flex items-baseline justify-between gap-3">
            <TrendArea points={fullSeries} />
          </div>
          <p className="mt-1 text-end font-mono text-sm font-bold text-tamm-cyan">
            {fmtCompact(fullSeries[fullSeries.length - 1]?.value ?? 0, "USD")}
          </p>
        </Tile>
      )}

      {trade && trade.totalUsd > 0 && (
        <Tile
          label={x.tradeMix}
          span="md:col-span-4"
          onClick={onFocus ? () => onFocus("trade") : undefined}
        >
          <div className="mt-2 flex justify-center">
            <DonutChart
              size={132}
              thickness={20}
              centerLabel={fmtUsd(trade.totalUsd)}
              slices={[
                { label: tv.exports, value: exportShare, color: "rgb(var(--accent))" },
                { label: tv.imports, value: 100 - exportShare, color: "oklch(0.58 0.07 250)" },
              ]}
            />
          </div>
        </Tile>
      )}

      {(dev || assembling) && (
        <Tile
          id="sources"
          label={x.developments}
          span="md:col-span-12"
          onClick={dev && onFocus ? () => onFocus("sources") : undefined}
        >
          {dev ? (
            <>
              {dev.answer && (
                <p className="mt-1.5 line-clamp-2 text-sm text-ink-600">{dev.answer}</p>
              )}
              <p className="mt-1.5 line-clamp-1 text-sm font-medium text-accent-strong">
                {dev.results[0]?.title}
              </p>
              <p className="mt-1 text-2xs text-ink-400">
                {dev.results.length} live result{dev.results.length === 1 ? "" : "s"} · via Tavily
              </p>
            </>
          ) : (
            <Shimmer />
          )}
        </Tile>
      )}
    </div>
  );
}
