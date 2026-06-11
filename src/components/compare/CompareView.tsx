"use client";

import { RadarChart } from "@/components/shared/RadarChart";
import { COUNTRIES } from "@/lib/data/countries";
import { INDICATORS, indicatorFor } from "@/lib/data/indicators";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useI18n } from "@/lib/i18n/context";
import type { MetricKey } from "@/lib/i18n/messages";
import { formatMetric } from "@/utils/format";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

const PALETTE = [
  "oklch(0.58 0.07 250)",
  "oklch(0.62 0.07 150)",
  "oklch(0.72 0.08 80)",
  "oklch(0.60 0.10 20)",
  "oklch(0.55 0.08 320)",
  "oklch(0.50 0.06 200)",
];

// All six are real World Bank values for every country (post data-unify), so the
// radar/table are fully populated for any combination — no fabricated gaps.
const METRIC_SET: MetricKey[] = [
  "gdp_usd_nominal",
  "gdp_growth_pct",
  "renewables_share_pct",
  "co2_per_capita_t",
  "exports_usd",
  "fdi_inflows_usd",
];

const DEFAULT_ISO3 = ["ARE", "SAU", "DEU", "JPN"];

export function CompareView() {
  useDocumentTitle("Compare");
  const { t, locale } = useI18n();
  const sp = useSearchParams();
  const initial = (() => {
    const add = sp?.get("add")?.toUpperCase();
    if (add && COUNTRIES.some((c) => c.iso3 === add) && !DEFAULT_ISO3.includes(add)) {
      return [add, ...DEFAULT_ISO3];
    }
    return DEFAULT_ISO3;
  })();
  const [selected, setSelected] = useState<string[]>(initial);

  const available = COUNTRIES.filter((c) => !selected.includes(c.iso3));

  function addCountry(iso3: string): void {
    setSelected((s) => (s.includes(iso3) ? s : [...s, iso3]));
  }
  function removeCountry(iso3: string): void {
    setSelected((s) => s.filter((x) => x !== iso3));
  }

  const maxValues = useMemo(() => {
    const map = new Map<string, number>();
    for (const metric of METRIC_SET) {
      const values = INDICATORS.filter((i) => i.metric === metric).map((i) => i.value);
      map.set(metric, values.length ? Math.max(...values) : 1);
    }
    return map;
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter text-ink-800">
            {t.compare.title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Side-by-side indicator comparison · {selected.length} of {COUNTRIES.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            onChange={(e) => {
              if (e.target.value) addCountry(e.target.value);
              e.target.value = "";
            }}
            className="rounded-md border border-ink-150 bg-ink-100 px-3.5 py-2 text-sm shadow-card transition focus:border-accent"
            defaultValue=""
            aria-label={t.compare.addCountry}
          >
            <option value="" disabled>
              {t.compare.addCountry}
            </option>
            {available.map((c) => (
              <option key={c.iso3} value={c.iso3}>
                {c.flagEmoji} {locale === "ar" ? c.nameAr : c.nameEn}
              </option>
            ))}
          </select>
        </div>
      </header>

      {selected.length === 0 && (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="text-2xl" aria-hidden>
            📊
          </div>
          <h2 className="text-sm font-medium text-ink-700">No countries selected</h2>
          <p className="max-w-md text-xs text-ink-500">
            Pick countries from the dropdown above to start comparing indicators.
          </p>
          <button
            type="button"
            onClick={() => setSelected(DEFAULT_ISO3)}
            className="btn-primary text-xs"
          >
            Reset to defaults
          </button>
        </div>
      )}

      {selected.length > 0 && (
        <section className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60">
                <th className="px-5 py-3 text-start text-2xs font-medium uppercase tracking-wide text-ink-500">
                  {t.compare.indicators}
                </th>
                {selected.map((iso) => {
                  const c = COUNTRIES.find((x) => x.iso3 === iso);
                  const name = c ? (locale === "ar" ? c.nameAr : c.nameEn) : iso;
                  return (
                    <th key={iso} className="px-4 py-3 text-start text-xs font-medium text-ink-700">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          {c?.flagEmoji} {name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCountry(iso)}
                          className="text-ink-400 hover:text-signal-risk"
                          aria-label={`${t.compare.removeRow} ${iso}`}
                        >
                          ×
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {METRIC_SET.map((metric) => {
                const max = maxValues.get(metric) ?? 1;
                return (
                  <tr key={metric} className="border-b border-ink-100 last:border-0">
                    <th className="px-4 py-3 text-start text-xs font-normal text-ink-600">
                      {t.metrics[metric]}
                    </th>
                    {selected.map((iso) => {
                      const ind = indicatorFor(iso, metric);
                      const pct = ind ? (ind.value / max) * 100 : 0;
                      return (
                        <td key={iso} className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 w-24 overflow-hidden rounded-xs bg-ink-100">
                              <div
                                className="h-full bg-accent"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="tabular text-sm text-ink-800">
                              {ind ? formatMetric(ind.value, ind.unit, locale) : "—"}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {selected.length > 0 && (
        <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="card p-5">
            <h2 className="section-title">{t.compare.radarTitle}</h2>
            <div className="mt-4 flex justify-center">
              <RadarChart
                size={360}
                axes={METRIC_SET.map((m) => t.metrics[m])}
                series={selected.map((iso, i) => {
                  const country = COUNTRIES.find((c) => c.iso3 === iso);
                  return {
                    label: `${country?.flagEmoji ?? ""} ${iso}`,
                    color: PALETTE[i % PALETTE.length] as string,
                    values: METRIC_SET.map((m) => {
                      const ind = indicatorFor(iso, m);
                      const max = maxValues.get(m) ?? 1;
                      return ind ? ind.value / max : 0;
                    }),
                  };
                })}
              />
            </div>
          </div>
          <div className="card p-5">
            <h2 className="section-title">Notes</h2>
            <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-ink-700">
              <li>Bars normalized per metric (max across catalog).</li>
              <li>Currency uses compact USD; ranks shown as #N.</li>
              <li>Missing values render as “—” with no fabricated estimate.</li>
              <li>Radar polygons share normalization with table bars.</li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
