"use client";

import { Sparkline } from "@/components/shared/LineChart";
import { Skeleton } from "@/components/shared/Skeleton";
import { COUNTRIES } from "@/lib/data/countries";
import { INDICATORS, indicatorFor as mockIndicatorFor } from "@/lib/data/indicators";
import { seriesFor } from "@/lib/data/timeseries";
import { useI18n } from "@/lib/i18n/context";
import type { Indicator } from "@/types";
import { formatMetric } from "@/utils/format";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export function CountryGrid() {
  const { locale, t } = useI18n();
  const [q, setQ] = useState("");
  const [live, setLive] = useState<Indicator[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/indicators?metric=gdp_usd_nominal")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${r.status}`);
        return d as { indicators: Indicator[] };
      })
      .then((d) => {
        if (!cancelled) setLive(d.indicators);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const gdpByIso = useMemo(() => {
    const map = new Map<string, Indicator>();
    const src = live ?? INDICATORS.filter((i) => i.metric === "gdp_usd_nominal");
    for (const r of src) map.set(r.countryIso3, r);
    return map;
  }, [live]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return COUNTRIES.filter((c) => {
      if (!needle) return true;
      return (
        c.iso3.toLowerCase().includes(needle) ||
        c.nameEn.toLowerCase().includes(needle) ||
        c.nameAr.toLowerCase().includes(needle) ||
        c.region.toLowerCase().includes(needle)
      );
    });
  }, [q]);

  const isLoading = live === null && !error;
  const hasLive = live ? live.some((i) => i.source === "World Bank") : false;

  return (
    <section className="rounded-sm border border-ink-200 bg-ink-100">
      <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-ink-800">
            {t.dashboard.watchlist}
          </h2>
          {hasLive && (
            <span className="rounded-xs bg-signal-ok/15 px-1.5 py-0.5 text-[10px] uppercase text-signal-ok">
              live
            </span>
          )}
        </div>
        <Link href="/compare" className="text-xs text-accent">
          {t.common.viewAll} →
        </Link>
      </header>
      <div className="border-b border-ink-200 px-5 py-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.common.search}
          className="w-full rounded-sm border border-ink-200 bg-ink-100 px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none"
          aria-label="filter countries"
        />
      </div>
      {error && (
        <div className="border-b border-signal-risk/30 bg-signal-risk/10 px-5 py-2 text-[11px] text-signal-risk">
          {error}
        </div>
      )}
      <ul className="divide-y divide-ink-100 max-h-[480px] overflow-y-auto">
        {isLoading && (
          <li className="space-y-2 px-5 py-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </li>
        )}
        {!isLoading && rows.length === 0 && (
          <li className="px-5 py-6 text-center text-xs text-ink-400">{t.shell.noResults}</li>
        )}
        {!isLoading &&
          rows.map((c) => {
            const gdp = gdpByIso.get(c.iso3) ?? mockIndicatorFor(c.iso3, "gdp_usd_nominal");
            const name = locale === "ar" ? c.nameAr : c.nameEn;
            const spark = gdp
              ? seriesFor(c.iso3, "gdp_usd_nominal", gdp.value).map((p) => p.value)
              : [];
            const sourceLive = gdp?.source === "World Bank";
            return (
              <li key={c.iso3}>
                <Link
                  href={`/country/${c.iso3}`}
                  className="flex items-center justify-between gap-3 px-5 py-2.5 transition hover:bg-ink-150"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="text-lg">
                      {c.flagEmoji}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink-800">{name}</div>
                      <div className="text-xs text-ink-400">
                        {c.iso3} · {c.region}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {spark.length >= 2 && <Sparkline values={spark} width={60} height={20} />}
                    <div className="text-end">
                      <div className="tabular text-sm text-ink-800">
                        {gdp ? formatMetric(gdp.value, "USD", locale) : "—"}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 text-[11px] text-ink-400">
                        {sourceLive && (
                          <span
                            className="h-1 w-1 rounded-full bg-signal-ok"
                            aria-hidden
                            title="live source: World Bank"
                          />
                        )}
                        <span>{gdp?.year ?? ""}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
