"use client";

import {
  CustomSectorPanel,
  type SectorInsights,
  type SectorInsightsState,
} from "@/components/profile/CustomSectorPanel";
import { FreshnessBar, type Provenance, provenance } from "@/components/profile/FreshnessBar";
import { SectorPanel } from "@/components/profile/SectorPanel";
import { type CustomTab, type SectorKey, SectorTabs } from "@/components/profile/SectorTabs";
import { AppShell } from "@/components/shell/AppShell";
import { hasRole, useAuthedUser } from "@/lib/auth/client";
import { COUNTRIES } from "@/lib/data/countries";
import { governanceFor } from "@/lib/data/governance";
import { indicatorsByCountry } from "@/lib/data/indicators";
import { projectsByCountry } from "@/lib/data/projects";
import { summaryFor } from "@/lib/data/summaries";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useToast } from "@/lib/hooks/useToast";
import { useI18n } from "@/lib/i18n/context";
import type { Indicator } from "@/types";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

const SECTOR_METRICS: Record<SectorKey, string[]> = {
  overview: ["gdp_usd_nominal", "gdp_growth_pct", "population", "competitiveness_rank"],
  energy: [
    "oil_production_kbd",
    "gas_production_bcm",
    "electricity_consumption_twh",
    "renewables_share_pct",
  ],
  infrastructure: ["infrastructure_index", "smart_city_rank"],
  transport: [
    "airport_throughput_mppa",
    "port_container_teu",
    "logistics_index",
    "rail_km",
    "ev_share_pct",
  ],
  sustainability: ["renewables_share_pct", "co2_per_capita_t", "sdg_score"],
  trade: ["exports_usd", "fdi_inflows_usd"],
  cooperation: [],
};

const SECTOR_PROJECT_FILTER: Partial<
  Record<SectorKey, "energy" | "infrastructure" | "sustainability" | "trade">
> = {
  energy: "energy",
  infrastructure: "infrastructure",
  transport: "infrastructure",
  sustainability: "sustainability",
  trade: "trade",
};

export function CountryProfileClient({ iso3 }: { iso3: string }) {
  return (
    <Suspense fallback={null}>
      <CountryProfileClientInner iso3={iso3} />
    </Suspense>
  );
}

function CountryProfileClientInner({ iso3 }: { iso3: string }) {
  const upper = iso3.toUpperCase();
  const country = COUNTRIES.find((c) => c.iso3 === upper);
  // country is guaranteed to exist (server page.tsx checked it), but guard for TS
  if (!country) return null;

  const sp = useSearchParams();
  const SECTOR_VALUES: SectorKey[] = [
    "overview",
    "energy",
    "infrastructure",
    "transport",
    "sustainability",
    "trade",
    "cooperation",
  ];
  const initialSector = (() => {
    const q = sp?.get("sector");
    if ((SECTOR_VALUES as string[]).includes(q ?? "")) return q as SectorKey;
    if (q?.startsWith("custom:")) return q; // resolved against stored tabs after mount
    return "overview";
  })();
  const [active, setActiveState] = useState<string>(initialSector);
  function setActive(next: string): void {
    setActiveState(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("sector", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  // ---- Custom AI-researched sector tabs -------------------------------------
  const tabsLsKey = `customSectors:${upper}`;
  const insightsLsKey = `sectorInsights:${upper}`;
  const [customTabs, setCustomTabs] = useState<CustomTab[]>([]);
  const [insights, setInsights] = useState<Record<string, SectorInsightsState>>({});

  useEffect(() => {
    try {
      const tabs = JSON.parse(localStorage.getItem(tabsLsKey) ?? "[]") as CustomTab[];
      const cached = JSON.parse(localStorage.getItem(insightsLsKey) ?? "{}") as Record<
        string,
        SectorInsights
      >;
      setCustomTabs(tabs);
      const restored: Record<string, SectorInsightsState> = {};
      for (const tb of tabs) {
        const data = cached[tb.id];
        if (data) restored[tb.id] = { status: "ready", data };
      }
      setInsights(restored);
      setActiveState((cur) =>
        cur.startsWith("custom:") && !tabs.some((tb) => tb.id === cur) ? "overview" : cur,
      );
    } catch {
      // corrupted local storage — start clean
      setCustomTabs([]);
      setInsights({});
    }
  }, [tabsLsKey, insightsLsKey]);

  function researchSector(tab: CustomTab): void {
    setInsights((m) => ({ ...m, [tab.id]: { status: "loading" } }));
    fetch(`/api/countries/${upper}/sector-insights`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sector: tab.label }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${r.status}`);
        return d as SectorInsights;
      })
      .then((data) => {
        setInsights((m) => {
          const next = { ...m, [tab.id]: { status: "ready", data } as SectorInsightsState };
          try {
            const cached = Object.fromEntries(
              Object.entries(next).flatMap(([id, s]) =>
                s.status === "ready" ? [[id, s.data]] : [],
              ),
            );
            localStorage.setItem(insightsLsKey, JSON.stringify(cached));
          } catch {
            // quota / private mode — cache is best-effort
          }
          return next;
        });
      })
      .catch((err) => {
        setInsights((m) => ({
          ...m,
          [tab.id]: {
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          },
        }));
      });
  }

  function addSector(sector: string): void {
    const slug = sector
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const id = `custom:${slug || Date.now().toString(36)}`;
    const existing = customTabs.find((tb) => tb.id === id);
    if (!existing) {
      const next = [...customTabs, { id, label: sector }];
      setCustomTabs(next);
      try {
        localStorage.setItem(tabsLsKey, JSON.stringify(next));
      } catch {
        // best-effort persistence
      }
    }
    setActive(id);
    const state = insights[id];
    if (!existing || !state || state.status === "error") {
      researchSector({ id, label: sector });
    }
  }

  function removeCustomTab(id: string): void {
    const next = customTabs.filter((tb) => tb.id !== id);
    setCustomTabs(next);
    setInsights((m) => {
      const { [id]: _drop, ...rest } = m;
      return rest;
    });
    try {
      localStorage.setItem(tabsLsKey, JSON.stringify(next));
      const cached = JSON.parse(localStorage.getItem(insightsLsKey) ?? "{}") as Record<
        string,
        unknown
      >;
      delete cached[id];
      localStorage.setItem(insightsLsKey, JSON.stringify(cached));
    } catch {
      // best-effort persistence
    }
    if (active === id) setActive("overview");
  }

  const activeBuiltin: SectorKey | null = (SECTOR_VALUES as string[]).includes(active)
    ? (active as SectorKey)
    : null;
  const activeCustom = customTabs.find((tb) => tb.id === active) ?? null;

  // A custom tab opened without cached research (e.g. deep link after reload) starts it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire only when the active tab changes
  useEffect(() => {
    if (activeCustom && !insights[activeCustom.id]) researchSector(activeCustom);
  }, [activeCustom?.id]);
  const [provFilter, setProvFilter] = useState<Provenance | null>(null);
  const { locale, t } = useI18n();
  const { push } = useToast();
  const router = useRouter();
  const { user } = useAuthedUser();
  const canGenerate = hasRole(user, "analyst");
  useDocumentTitle(country ? (locale === "ar" ? country.nameAr : country.nameEn) : null);

  const [liveAll, setLiveAll] = useState<Indicator[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLiveAll(null);
    setFetchError(null);
    fetch(`/api/countries/${country.iso3}/indicators`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${r.status}`);
        return d as { indicators: Indicator[] };
      })
      .then((d) => {
        if (!cancelled) setLiveAll(d.indicators);
      })
      .catch((err) => {
        if (!cancelled) setFetchError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [country.iso3]);

  const all = useMemo(() => liveAll ?? indicatorsByCountry(country.iso3), [country.iso3, liveAll]);
  const hasLive = (liveAll ?? []).some((i) => i.source === "World Bank");
  const projects = useMemo(() => projectsByCountry(country.iso3), [country.iso3]);
  const gov = governanceFor(country.iso3);

  const indicators = useMemo(() => {
    const keys = activeBuiltin ? SECTOR_METRICS[activeBuiltin] : [];
    return all
      .filter((i) => keys.includes(i.metric))
      .filter((i) => (provFilter ? provenance(i.source) === provFilter : true));
  }, [activeBuiltin, all, provFilter]);

  const panelProjects = useMemo(() => {
    if (!activeBuiltin) return [];
    if (activeBuiltin === "overview" || activeBuiltin === "cooperation") return projects;
    const filter = SECTOR_PROJECT_FILTER[activeBuiltin];
    return filter ? projects.filter((p) => p.sector === filter) : [];
  }, [activeBuiltin, projects]);

  const summary = summaryFor(country.iso3, activeBuiltin ?? "overview");
  const name = locale === "ar" ? country.nameAr : country.nameEn;

  return (
    <AppShell>
      <section className="border-b border-ink-100 bg-ink-100" lang={locale}>
        <div className="mx-auto max-w-7xl px-6 pb-8 pt-7">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-wide text-ink-500 transition hover:text-ink-800"
          >
            ← {t.common.back}
          </a>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <div
              className="grid h-16 w-16 shrink-0 place-items-center rounded-md bg-gradient-to-br from-ink-100 to-ink-50 text-4xl leading-none shadow-card"
              aria-hidden
            >
              {country.flagEmoji}
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tighter text-ink-800">{name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                <span className="rounded-xs bg-ink-100 px-1.5 py-0.5 font-mono font-medium text-ink-700">
                  {country.iso3}
                </span>
                <span>{country.region}</span>
                {gov && (
                  <>
                    <span className="text-ink-300">·</span>
                    <span>{locale === "ar" ? gov.capitalAr : gov.capitalEn}</span>
                    <span className="text-ink-300">·</span>
                    <span>FY {gov.fiscalYear}</span>
                  </>
                )}
              </div>
            </div>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              {hasLive && (
                <span className="chip chip-ok">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal-ok" />
                  live · World Bank
                </span>
              )}
              {fetchError && (
                <span className="chip chip-risk" title={fetchError}>
                  fetch error
                </span>
              )}
              <button
                type="button"
                onClick={() => router.push(`/chat?context=country:${country.iso3}`)}
                className="btn-ghost"
                title={`Ask AI about ${name}`}
              >
                💬 Ask AI
              </button>
              <button
                type="button"
                onClick={() => router.push(`/insights?country=${country.iso3}`)}
                className="btn-ghost"
                title="Forecasts + risk radar"
              >
                📈 Forecast
              </button>
              <button
                type="button"
                onClick={() => router.push(`/cooperation?partner=${country.iso3}`)}
                className="btn-ghost"
                title="Cooperation opportunities"
              >
                🤝 Cooperation
              </button>
              <button
                type="button"
                onClick={() => router.push(`/compare?add=${country.iso3}`)}
                className="btn-ghost"
              >
                {t.common.compare}
              </button>
              {canGenerate && (
                <button
                  type="button"
                  onClick={() => {
                    push({
                      kind: "info",
                      title: "Briefing draft started",
                      detail: `Country: ${country.iso3}`,
                    });
                    router.push(`/briefings/new?country=${country.iso3}`);
                  }}
                  className="btn-primary"
                >
                  + {t.common.generate}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="border-b border-ink-100 bg-white/40">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <FreshnessBar
            indicators={all}
            active={provFilter}
            onToggle={(p) => setProvFilter((cur) => (cur === p ? null : p))}
          />
        </div>
      </div>

      <SectorTabs
        active={active}
        onChange={setActive}
        customTabs={customTabs}
        onAddSector={canGenerate ? addSector : undefined}
      />

      {active === "overview" && gov && (
        <section className="border-b border-ink-100 bg-white/60">
          <div className="mx-auto grid max-w-7xl gap-5 px-6 py-7 lg:grid-cols-3">
            <div className="card p-5">
              <h3 className="text-2xs font-medium uppercase tracking-wide text-ink-500">
                {t.profile.governmentStructure}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-800">
                {locale === "ar" ? gov.systemAr : gov.systemEn}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {locale === "ar" ? gov.leaderAr : gov.leaderEn}
              </p>
            </div>
            <div className="card p-5">
              <h3 className="text-2xs font-medium uppercase tracking-wide text-ink-500">
                {t.profile.nationalPriorities}
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                {gov.priorities.map((p, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      aria-hidden
                    />
                    <span>{locale === "ar" ? p.ar : p.en}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <h3 className="text-2xs font-medium uppercase tracking-wide text-ink-500">
                {t.profile.keyInitiatives}
              </h3>
              <ul className="mt-3 space-y-3.5 text-sm">
                {gov.initiatives.map((it, i) => (
                  <li key={i} className="border-s-2 border-accent/40 ps-3">
                    <div className="font-medium text-ink-800">
                      {locale === "ar" ? it.titleAr : it.titleEn}
                    </div>
                    <div className="mt-0.5 text-xs leading-relaxed text-ink-500">
                      {locale === "ar" ? it.descAr : it.descEn}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {activeBuiltin && (
        <SectorPanel
          title={t.profile[activeBuiltin]}
          summary={summary.summary}
          citations={summary.citations}
          confidence={summary.confidence}
          indicators={indicators}
          projects={panelProjects}
        />
      )}

      {activeCustom && (
        <CustomSectorPanel
          label={activeCustom.label}
          state={insights[activeCustom.id] ?? { status: "loading" }}
          onRetry={() => researchSector(activeCustom)}
          onRemove={() => removeCustomTab(activeCustom.id)}
        />
      )}
    </AppShell>
  );
}
