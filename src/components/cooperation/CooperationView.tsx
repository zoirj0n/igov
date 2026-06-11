"use client";

import { Modal } from "@/components/shared/Modal";
import { type RelationshipEdge, RelationshipGraph } from "@/components/shared/RelationshipGraph";
import { COUNTRIES } from "@/lib/data/countries";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useTablistKeys } from "@/lib/hooks/useTablistKeys";
import { useI18n } from "@/lib/i18n/context";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Stage = "scoping" | "proposal" | "negotiation" | "signed";

interface Opportunity {
  id: string;
  partnerIso3: string;
  title: string;
  sector: string;
  score: number;
  stage: Stage;
  rationale: string;
}

// Opportunities are computed server-side from real indicator complementarity
// (GET /api/cooperation) — see useEffect below. No hardcoded list.

const stageOrder: Stage[] = ["scoping", "proposal", "negotiation", "signed"];

type CoopView = "matchmaker" | "pipeline" | "graph";
const COOP_VIEWS: CoopView[] = ["matchmaker", "pipeline", "graph"];

export function CooperationView() {
  useDocumentTitle("Cooperation");
  const { t, locale } = useI18n();
  const sp = useSearchParams();
  const partnerFilter = sp?.get("partner")?.toUpperCase() ?? null;
  const initialView = (() => {
    const v = sp?.get("view");
    return (COOP_VIEWS as string[]).includes(v ?? "") ? (v as CoopView) : "matchmaker";
  })();
  const [view, setViewState] = useState<CoopView>(initialView);
  function setView(next: CoopView): void {
    setViewState(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", next);
      window.history.replaceState(null, "", url.toString());
    }
  }
  const [openId, setOpenId] = useState<string | null>(null);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cooperation", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { opportunities: [] }))
      .then((d) => {
        if (!cancelled) setOpps((d.opportunities ?? []) as Opportunity[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const active = openId ? opps.find((o) => o.id === openId) : null;
  const activeCountry = active ? COUNTRIES.find((c) => c.iso3 === active.partnerIso3) : null;
  const visibleOpps = useMemo(
    () => (partnerFilter ? opps.filter((o) => o.partnerIso3 === partnerFilter) : opps),
    [partnerFilter, opps],
  );
  const partnerCountry = partnerFilter ? COUNTRIES.find((c) => c.iso3 === partnerFilter) : null;
  const partnerName = partnerCountry
    ? locale === "ar"
      ? partnerCountry.nameAr
      : partnerCountry.nameEn
    : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter text-ink-800">
            {t.cooperation.title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Opportunity matchmaker · stage pipeline · relationship graph
          </p>
          {partnerFilter && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs">
              <span className="text-ink-700">
                Filtered to partner: {partnerCountry?.flagEmoji} {partnerName ?? partnerFilter}
              </span>
              <a href="/cooperation" className="text-accent transition hover:text-accent-strong">
                clear ×
              </a>
            </div>
          )}
        </div>
        <div
          className="inline-flex rounded-md border border-ink-150 bg-ink-100 p-0.5 text-xs shadow-card"
          role="tablist"
          aria-label="Cooperation views"
          onKeyDown={useTablistKeys(COOP_VIEWS, view, setView)}
        >
          {COOP_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              data-tab={v}
              role="tab"
              tabIndex={view === v ? 0 : -1}
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={
                view === v
                  ? "rounded-sm bg-accent px-3.5 py-1.5 font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  : "rounded-sm px-3.5 py-1.5 text-ink-500 transition hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              }
            >
              {v === "matchmaker"
                ? t.cooperation.matchmaker
                : v === "pipeline"
                  ? t.cooperation.pipeline
                  : t.cooperation.relationships}
            </button>
          ))}
        </div>
      </header>

      {view === "matchmaker" && (
        <section className="card overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-ink-50/60">
              <tr className="border-b border-ink-100 text-2xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-5 py-3 text-start">Opportunity</th>
                <th className="px-5 py-3 text-start">Partner</th>
                <th className="px-5 py-3 text-start">Sector</th>
                <th className="px-5 py-3 text-start">{t.cooperation.score}</th>
                <th className="px-5 py-3 text-start">Stage</th>
              </tr>
            </thead>
            <tbody>
              {[...visibleOpps]
                .sort((a, b) => b.score - a.score)
                .map((o) => {
                  const c = COUNTRIES.find((x) => x.iso3 === o.partnerIso3);
                  const name = c ? (locale === "ar" ? c.nameAr : c.nameEn) : o.partnerIso3;
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setOpenId(o.id)}
                      className="cursor-pointer border-b border-ink-100 last:border-0 transition hover:bg-ink-150"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink-800">{o.title}</div>
                        <div className="mt-0.5 text-xs text-ink-500">{o.rationale}</div>
                      </td>
                      <td className="px-4 py-3 text-ink-700">
                        {c?.flagEmoji} {name}
                      </td>
                      <td className="px-4 py-3 text-ink-600">{o.sector}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-20 overflow-hidden rounded-xs bg-ink-100">
                            <div className="h-full bg-accent" style={{ width: `${o.score}%` }} />
                          </div>
                          <span className="tabular font-medium text-ink-800">{o.score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-xs bg-ink-100 px-2 py-0.5 text-[11px] text-ink-700">
                          {t.cooperation.stage[o.stage]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      )}

      {view === "pipeline" && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stageOrder.map((stage) => {
            const rows = visibleOpps.filter((o) => o.stage === stage);
            return (
              <div key={stage} className="rounded-sm border border-ink-200 bg-ink-100">
                <header className="border-b border-ink-200 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-700">
                      {t.cooperation.stage[stage]}
                    </h3>
                    <span className="text-[11px] text-ink-400">{rows.length}</span>
                  </div>
                </header>
                <ul className="space-y-2 p-2">
                  {rows.map((o) => {
                    const c = COUNTRIES.find((x) => x.iso3 === o.partnerIso3);
                    return (
                      <li
                        key={o.id}
                        onClick={() => setOpenId(o.id)}
                        className="cursor-pointer rounded-sm border border-ink-100 bg-ink-100 p-2 transition hover:border-accent"
                      >
                        <div className="text-sm font-medium text-ink-800">{o.title}</div>
                        <div className="mt-0.5 text-[11px] text-ink-500">
                          {c?.flagEmoji} {o.partnerIso3} · {o.sector}
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                          <div className="h-1 w-12 overflow-hidden rounded-xs bg-ink-100">
                            <div className="h-full bg-accent" style={{ width: `${o.score}%` }} />
                          </div>
                          <span className="tabular text-ink-700">{o.score}</span>
                        </div>
                      </li>
                    );
                  })}
                  {rows.length === 0 && (
                    <li className="px-2 py-3 text-center text-xs text-ink-400">—</li>
                  )}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {view === "graph" && (
        <section className="rounded-sm border border-ink-200 bg-ink-100 p-5">
          <h2 className="text-sm font-semibold tracking-tight text-ink-800">
            {t.cooperation.relationships}
          </h2>
          <div className="mt-4">
            <RelationshipGraph
              hubIso3="ARE"
              size={520}
              edges={visibleOpps.map(
                (o): RelationshipEdge => ({
                  partnerIso3: o.partnerIso3,
                  strength: o.score,
                  stage: o.stage,
                }),
              )}
            />
          </div>
        </section>
      )}

      <Modal
        open={Boolean(active)}
        onClose={() => setOpenId(null)}
        title={active?.title ?? ""}
        width="lg"
      >
        {active && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{activeCountry?.flagEmoji}</span>
              <div>
                <div className="font-medium text-ink-800">
                  {activeCountry
                    ? locale === "ar"
                      ? activeCountry.nameAr
                      : activeCountry.nameEn
                    : active.partnerIso3}
                </div>
                <div className="text-xs text-ink-500">
                  {active.sector} · stage {t.cooperation.stage[active.stage]} · score {active.score}
                </div>
              </div>
            </div>
            <p className="text-ink-700">{active.rationale}</p>
            <div className="rounded-md border border-ink-150 bg-ink-50/60 p-3 text-xs text-ink-600">
              <div className="mb-2 text-2xs font-medium uppercase tracking-wide text-ink-500">
                Next actions
              </div>
              <ul className="space-y-1.5">
                <li>
                  <a
                    href={`/chat?context=country:${active.partnerIso3}`}
                    className="text-accent hover:text-accent-strong"
                  >
                    💬 Draft talking points with AI
                  </a>
                </li>
                <li>
                  <a
                    href={`/briefings/new?country=${active.partnerIso3}`}
                    className="text-accent hover:text-accent-strong"
                  >
                    📝 Generate executive briefing
                  </a>
                </li>
                <li>
                  <a
                    href={`/country/${active.partnerIso3}`}
                    className="text-accent hover:text-accent-strong"
                  >
                    🌐 Open{" "}
                    {activeCountry
                      ? locale === "ar"
                        ? activeCountry.nameAr
                        : activeCountry.nameEn
                      : active.partnerIso3}{" "}
                    profile
                  </a>
                </li>
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
