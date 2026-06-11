"use client";

import { RadarChart } from "@/components/shared/RadarChart";
import { iso3Name } from "@/lib/data/iso-countries";
import { FEATURED_ISO3 } from "@/lib/experience/featured";
import { useI18n } from "@/lib/i18n/context";
import type { MetricKey } from "@/lib/i18n/messages";
import type { Indicator } from "@/types";
import { formatMetric } from "@/utils/format";
import { useEffect, useState } from "react";

// Same 6-metric set as the legacy CompareView
const METRIC_SET: MetricKey[] = [
  "gdp_usd_nominal",
  "gdp_growth_pct",
  "renewables_share_pct",
  "co2_per_capita_t",
  "exports_usd",
  "fdi_inflows_usd",
];

interface CountrySeries {
  iso3: string;
  label: string;
  color: string;
  indicators: Indicator[];
}

/** Latest-year value for a given metric from a set of indicators. */
function latestValue(indicators: Indicator[], metric: string): Indicator | undefined {
  return indicators.filter((i) => i.metric === metric).sort((a, b) => b.year - a.year)[0];
}

async function fetchIndicators(iso3: string): Promise<Indicator[]> {
  const res = await fetch(`/api/countries/${iso3}/indicators`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { indicators: Indicator[] };
  return data.indicators ?? [];
}

export function CompareFocusView({
  iso3,
  countryName,
}: {
  iso3: string;
  countryName: string;
}) {
  const { t, locale } = useI18n();
  const x = t.experience.compareView;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [series, setSeries] = useState<CountrySeries[]>([]);
  // Optional third peer (from select)
  const peerOptions = FEATURED_ISO3.filter((c) => c !== iso3 && c !== "ARE");
  const [peerIso3, setPeerIso3] = useState<string>("");

  useEffect(() => {
    let on = true;
    setStatus("loading");

    const toFetch: Array<{ iso3: string; label: string; color: string }> = [
      { iso3, label: countryName, color: "#d7bc6d" },
      { iso3: "ARE", label: "United Arab Emirates", color: "#c0c171" },
    ];
    if (peerIso3) {
      toFetch.push({ iso3: peerIso3, label: iso3Name(peerIso3) ?? peerIso3, color: "#8b8c98" });
    }

    Promise.all(
      toFetch.map(async (entry) => ({
        ...entry,
        indicators: await fetchIndicators(entry.iso3),
      })),
    )
      .then((loaded) => {
        if (!on) return;
        setSeries(loaded);
        setStatus("ready");
      })
      .catch(() => {
        if (!on) return;
        setStatus("error");
      });

    return () => {
      on = false;
    };
  }, [iso3, countryName, peerIso3]);

  if (status === "loading")
    return <p className="py-10 text-center text-sm text-ink-500">{x.loading}</p>;
  if (status === "error" || series.length === 0)
    return <p className="py-10 text-center text-sm text-ink-500">{x.unavailable}</p>;

  // Compute per-metric max across all loaded series for normalization (0–100 per axis)
  const maxPerMetric = new Map<MetricKey, number>();
  for (const metric of METRIC_SET) {
    const vals = series
      .map((s) => latestValue(s.indicators, metric)?.value ?? 0)
      .filter((v) => v > 0);
    maxPerMetric.set(metric, vals.length ? Math.max(...vals) : 1);
  }

  const radarAxes = METRIC_SET.map((m) => t.metrics[m]);
  const radarSeries = series.map((s) => ({
    label: s.label,
    color: s.color,
    values: METRIC_SET.map((m) => {
      const ind = latestValue(s.indicators, m);
      const max = maxPerMetric.get(m) ?? 1;
      return ind ? ind.value / max : 0;
    }),
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-600">
          {countryName} · <span className="text-ink-400">{x.vsUae}</span>
        </p>
        <select
          value={peerIso3}
          onChange={(e) => setPeerIso3(e.target.value)}
          className="rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 text-sm shadow-card transition focus:border-accent"
          aria-label={x.addPeer}
        >
          <option value="">{x.addPeer}</option>
          {peerOptions.map((iso) => (
            <option key={iso} value={iso}>
              {iso3Name(iso) ?? iso}
            </option>
          ))}
        </select>
      </div>

      {/* Radar */}
      <div className="flex justify-center rounded-xl border border-ink-200 bg-ink-50 p-5">
        <RadarChart size={320} axes={radarAxes} series={radarSeries} />
      </div>

      {/* Compact value table */}
      <div className="overflow-x-auto rounded-xl border border-ink-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/60">
              <th className="px-4 py-2.5 text-start text-2xs font-medium uppercase tracking-wide text-ink-500">
                {x.metric}
              </th>
              {series.map((s) => (
                <th
                  key={s.iso3}
                  className="px-4 py-2.5 text-start text-xs font-medium text-ink-700"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    {s.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_SET.map((metric) => (
              <tr key={metric} className="border-b border-ink-100 last:border-0">
                <th className="px-4 py-2.5 text-start text-xs font-normal text-ink-600">
                  {t.metrics[metric]}
                </th>
                {series.map((s) => {
                  const ind = latestValue(s.indicators, metric);
                  return (
                    <td key={s.iso3} className="px-4 py-2.5 tabular text-sm text-ink-800">
                      {ind ? (
                        <span>
                          {formatMetric(ind.value, ind.unit, locale)}{" "}
                          <span className="text-2xs text-ink-400">·{ind.year}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
