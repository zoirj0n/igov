"use client";

import { LineChart } from "@/components/shared/LineChart";
import { COUNTRIES } from "@/lib/data/countries";
import type { Project } from "@/lib/data/projects";
import { seriesFor } from "@/lib/data/timeseries";
import { useI18n } from "@/lib/i18n/context";
import type { Indicator } from "@/types";
import { formatMetric } from "@/utils/format";
import { AiSummary } from "./AiSummary";
import { IndicatorCard } from "./IndicatorCard";

interface Props {
  title: string;
  summary: string;
  citations: string[];
  confidence: "high" | "med" | "low";
  indicators: Indicator[];
  projects?: Project[];
}

export function SectorPanel({
  title,
  summary,
  citations,
  confidence,
  indicators,
  projects = [],
}: Props) {
  const { t, locale } = useI18n();
  return (
    <div role="tabpanel" className="mx-auto max-w-7xl px-6 py-8">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink-800">{title}</h2>

      <AiSummary summary={summary} citations={citations} confidence={confidence} />

      <div className="mt-8">
        <h3 className="mb-3 text-sm font-semibold tracking-tight text-ink-800">
          {t.profile.keyIndicators}
        </h3>
        {indicators.length === 0 ? (
          <div className="rounded-sm border border-dashed border-ink-200 p-6 text-center text-sm text-ink-400">
            {t.profile.noData}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {indicators.map((i) => (
              <IndicatorCard key={i.id} indicator={i} />
            ))}
          </div>
        )}
      </div>

      {indicators.length > 0 && (
        <div className="mt-8 rounded-sm border border-ink-200 bg-ink-100 p-5">
          <h3 className="mb-3 text-sm font-semibold tracking-tight text-ink-800">
            {t.profile.timeSeries}
          </h3>
          <LineChart
            width={760}
            height={220}
            series={indicators.slice(0, 3).map((i, idx) => ({
              label: (t.metrics as Record<string, string>)[i.metric] ?? i.metric,
              color: ["oklch(0.58 0.07 250)", "oklch(0.62 0.07 150)", "oklch(0.72 0.08 80)"][
                idx
              ] as string,
              points: seriesFor(i.countryIso3, i.metric, i.value).map((p) => ({
                x: p.year,
                y: p.value,
              })),
            }))}
            xLabel={(x) => x.toFixed(0)}
            yLabel={(y) => (y > 1_000_000 ? `${(y / 1_000_000_000).toFixed(1)}B` : y.toFixed(0))}
          />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500">
            {indicators.slice(0, 3).map((i, idx) => (
              <span key={i.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: [
                      "oklch(0.58 0.07 250)",
                      "oklch(0.62 0.07 150)",
                      "oklch(0.72 0.08 80)",
                    ][idx],
                  }}
                />
                {(t.metrics as Record<string, string>)[i.metric] ?? i.metric}
              </span>
            ))}
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-semibold tracking-tight text-ink-800">
            {t.profile.majorProjects}
          </h3>
          <ul className="divide-y divide-ink-100 rounded-sm border border-ink-200 bg-ink-100">
            {projects.map((p) => (
              <li key={p.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-800">{p.name}</div>
                    <div className="mt-1 text-xs text-ink-500">{p.summary}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-xs bg-ink-100 px-1.5 py-0.5 text-ink-600">
                        {p.sector}
                      </span>
                      <span
                        className={
                          p.status === "operational"
                            ? "rounded-xs bg-signal-ok/15 px-1.5 py-0.5 text-signal-ok"
                            : p.status === "in_progress"
                              ? "rounded-xs bg-signal-warn/15 px-1.5 py-0.5 text-signal-warn"
                              : "rounded-xs bg-ink-100 px-1.5 py-0.5 text-ink-500"
                        }
                      >
                        {p.status.replace("_", " ")}
                      </span>
                      {p.partnersIso3.map((iso) => {
                        const c = COUNTRIES.find((x) => x.iso3 === iso);
                        return (
                          <span key={iso} className="text-ink-500" title={c?.nameEn ?? iso}>
                            {c?.flagEmoji ?? iso}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    {p.budgetUsd && (
                      <div className="tabular text-sm text-ink-800">
                        {formatMetric(p.budgetUsd, "USD", locale)}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
