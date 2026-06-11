"use client";

import { CountryGrid } from "@/components/dashboard/CountryGrid";
import { BigStat, ExecutiveOverview } from "@/components/dashboard/ExecutiveOverview";
import { FreshnessTile } from "@/components/dashboard/FreshnessTile";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { RecentBriefings } from "@/components/dashboard/RecentBriefings";
import { SmartRadar } from "@/components/dashboard/SmartRadar";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { WorldMap } from "@/components/shared/WorldMap";
import { AppShell } from "@/components/shell/AppShell";
import { type Role, hasRole, useAuthedUser } from "@/lib/auth/client";
import { COUNTRIES } from "@/lib/data/countries";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useToast } from "@/lib/hooks/useToast";
import { useI18n } from "@/lib/i18n/context";
import { useEffect, useState } from "react";

interface KpiState {
  partnersTracked: number;
  indicatorsTotal: number;
  liveIndicators: number;
  briefingsThisMonth: number;
}

const DEFAULT_MAP_PINS = ["ARE", "DEU", "JPN", "IND", "KOR", "FRA"];

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const { user } = useAuthedUser();
  const isExec = user?.role === "executive";
  // Executives get the simple, graphical layout; the toggle opens the full
  // analyst-grade detail on demand.
  const [detailed, setDetailed] = useState(false);
  const execSimple = isExec && !detailed;
  useDocumentTitle("Dashboard");
  const [kpi, setKpi] = useState<KpiState>({
    partnersTracked: COUNTRIES.length,
    indicatorsTotal: 0,
    liveIndicators: 0,
    briefingsThisMonth: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<number>(Date.now());
  const [mapPins, setMapPins] = useState<string[]>(DEFAULT_MAP_PINS);
  // Bumped on Refresh to force child widgets to re-mount + re-fetch.
  const [reloadKey, setReloadKey] = useState(0);

  async function loadLiveCounts(): Promise<Partial<KpiState> | null> {
    try {
      const [briefRes, freshRes] = await Promise.all([
        fetch("/api/briefings", { cache: "no-store" }),
        fetch("/api/insights/freshness", { cache: "no-store" }),
      ]);
      const out: Partial<KpiState> = {};
      if (briefRes.ok) {
        const d = (await briefRes.json()) as { briefings?: { createdAt: string }[] };
        const now = new Date();
        const monthPrefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        out.briefingsThisMonth = (d.briefings ?? []).filter((b) =>
          b.createdAt?.startsWith(monthPrefix),
        ).length;
      }
      if (freshRes.ok) {
        const d = (await freshRes.json()) as {
          grandTotal?: number;
          totals?: { authoritative?: number };
        };
        if (typeof d.grandTotal === "number") out.indicatorsTotal = d.grandTotal;
        if (typeof d.totals?.authoritative === "number")
          out.liveIndicators = d.totals.authoritative;
      }
      return out;
    } catch {
      return null;
    }
  }

  // Map pins derived from recent briefings' country distribution.
  async function loadMapPins(): Promise<string[] | null> {
    try {
      const r = await fetch("/api/briefings", { cache: "no-store" });
      if (!r.ok) return null;
      const d = (await r.json()) as { briefings?: { countryIso3: string }[] };
      if (!d.briefings) return null;
      const counts = new Map<string, number>();
      for (const b of d.briefings) {
        counts.set(b.countryIso3, (counts.get(b.countryIso3) ?? 0) + 1);
      }
      const sorted = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([iso]) => iso);
      // Fall back to defaults if no briefings yet, so the map isn't empty.
      return sorted.length > 0 ? sorted : DEFAULT_MAP_PINS;
    } catch {
      return null;
    }
  }

  async function refresh(): Promise<void> {
    setRefreshing(true);
    const [live, pins] = await Promise.all([loadLiveCounts(), loadMapPins()]);
    setKpi((k) => ({
      partnersTracked: COUNTRIES.length,
      indicatorsTotal: live?.indicatorsTotal ?? k.indicatorsTotal,
      liveIndicators: live?.liveIndicators ?? k.liveIndicators,
      briefingsThisMonth: live?.briefingsThisMonth ?? k.briefingsThisMonth,
    }));
    if (pins) setMapPins(pins);
    setRefreshedAt(Date.now());
    setReloadKey((n) => n + 1);
    setRefreshing(false);
    push({
      kind: "success",
      title: t.dashboard.refreshedTitle,
      detail: t.dashboard.refreshedDetail,
    });
  }

  useEffect(() => {
    let cancelled = false;
    loadLiveCounts().then((live) => {
      if (cancelled || !live) return;
      setKpi((k) => ({ ...k, ...live }));
    });
    loadMapPins().then((pins) => {
      if (!cancelled && pins) setMapPins(pins);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Executive variant: count of high-severity alerts for the KPI row.
  const [highAlerts, setHighAlerts] = useState<number | null>(null);
  useEffect(() => {
    if (!isExec) return;
    let cancelled = false;
    fetch("/api/alerts", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d: { alerts?: { severity: string }[] } | null) => {
        if (!cancelled && d?.alerts)
          setHighAlerts(d.alerts.filter((a) => a.severity === "high").length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isExec]);

  // Tick the "Xs ago" label so it doesn't freeze between refreshes.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => (n + 1) % 1000), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ago = secondsAgo(refreshedAt);
  void tick; // keep ago re-evaluating

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-6 py-10" lang={locale}>
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tighter text-ink-800">
              {t.dashboard.title}
            </h1>
            <p className="mt-1.5 text-sm text-ink-500">{t.dashboard.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            {isExec && (
              <button
                type="button"
                onClick={() => setDetailed((d) => !d)}
                className="btn-ghost text-xs"
                aria-pressed={detailed}
              >
                {detailed ? t.dashboard.exec.simple : t.dashboard.exec.detailed}
              </button>
            )}
            <span
              className="font-mono text-2xs text-ink-400"
              title={new Date(refreshedAt).toLocaleString()}
            >
              {t.shell.lastRefreshed}{" "}
              {ago < 60
                ? t.shell.agoSeconds.replace("{n}", String(ago))
                : ago < 3600
                  ? t.shell.agoMinutes.replace("{n}", String(Math.floor(ago / 60)))
                  : t.shell.agoHours.replace("{n}", String(Math.floor(ago / 3600)))}
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="btn-ghost inline-flex items-center gap-1.5"
            >
              <span
                className={refreshing ? "inline-block animate-spin" : "inline-block"}
                aria-hidden
              >
                ↻
              </span>
              {refreshing ? t.shell.loading : t.shell.refresh}
            </button>
          </div>
        </header>

        <a
          href="/agent"
          className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-gradient-to-r from-ae-gold to-ae-goldDark px-6 py-5 text-white shadow-card transition hover:brightness-105"
        >
          <div>
            <div className="text-lg font-extrabold">Strategic Advisor</div>
            <div className="text-sm text-white/85">
              One command → a full, grounded meeting brief in seconds. Runs on-prem.
            </div>
          </div>
          <span className="rounded-md bg-white/20 px-4 py-2 text-sm font-semibold">
            Prepare me for a meeting →
          </span>
        </a>

        {execSimple ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <BigStat
              value={kpi.briefingsThisMonth}
              label={t.dashboard.kpi.briefingsThisMonth}
              tone="accent"
              href="/briefings"
            />
            <BigStat
              value={kpi.partnersTracked}
              label={t.dashboard.kpi.partnersTracked}
              tone="neutral"
              href="/compare"
            />
            <BigStat
              value={highAlerts}
              label={t.dashboard.kpi.highAlerts}
              tone="risk"
              href="/activity"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label={t.dashboard.kpi.partnersTracked}
              value={
                <AnimatedNumber
                  value={kpi.partnersTracked}
                  format={(v) => Math.round(v).toString()}
                />
              }
              delta="catalog"
              trend="flat"
              source="COUNTRIES"
            />
            <KpiTile
              label="Indicators tracked"
              value={
                <AnimatedNumber
                  value={kpi.indicatorsTotal}
                  format={(v) => Math.round(v).toString()}
                />
              }
              delta="live"
              trend="up"
              source="insights/freshness"
            />
            <KpiTile
              label="Authoritative datapoints"
              value={
                <AnimatedNumber
                  value={kpi.liveIndicators}
                  format={(v) => Math.round(v).toString()}
                />
              }
              delta={
                kpi.indicatorsTotal > 0
                  ? `${Math.round((kpi.liveIndicators / kpi.indicatorsTotal) * 100)}%`
                  : "—"
              }
              trend="up"
              source="provenance: authoritative"
            />
            <KpiTile
              label="Briefings this month"
              value={
                <AnimatedNumber
                  value={kpi.briefingsThisMonth}
                  format={(v) => Math.round(v).toString()}
                />
              }
              delta="live"
              trend="up"
              source="repo/briefings"
            />
          </div>
        )}

        <QuickActions />

        {execSimple ? (
          // Graphical, decision-first: one severity bar + top-3 alert cards,
          // the engagement map, then briefings. Analyst-grade data lives
          // behind the "Detailed view" toggle.
          <div className="mt-8 space-y-6">
            <ExecutiveOverview key={`eo-${reloadKey}`} />
            <WorldMap partnerIso3={mapPins} />
            <RecentBriefings key={`rb-${reloadKey}`} />
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <WorldMap partnerIso3={mapPins} />
              <RecentBriefings key={`rb-${reloadKey}`} />
            </div>
            <div className="space-y-6">
              <SmartRadar key={`sr-${reloadKey}`} />
              <FreshnessTile key={`ft-${reloadKey}`} />
              <CountryGrid key={`cg-${reloadKey}`} />
            </div>
          </div>
        )}

        <footer className="mt-16 border-t border-ink-100 pt-6 text-2xs text-ink-400">
          v1 · sources: World Bank · IEA · IRENA · FCSC · MoFA · classification: internal preview
        </footer>
      </div>
    </AppShell>
  );
}

function secondsAgo(ts: number): number {
  if (typeof window === "undefined") return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / 1000));
}

interface QuickAction {
  href: string;
  label: string;
  hint: string;
  icon: string;
  minRole: Role;
}

// Tailored per role: executives lead with the advisor and decision surfaces;
// data tooling appears from analyst up. Hierarchical (minRole), same rule as
// the sidebar — UI shaping only, API-side RBAC still enforces access.
const QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/agent",
    label: "Prepare me",
    hint: "One-command meeting brief",
    icon: "🎯",
    minRole: "viewer",
  },
  {
    href: "/briefings/new",
    label: "Draft briefing",
    hint: "AI-generate brief",
    icon: "📝",
    minRole: "analyst",
  },
  { href: "/chat", label: "Ask AI", hint: "Open chat session", icon: "💬", minRole: "viewer" },
  {
    href: "/compare",
    label: "Compare",
    hint: "Side-by-side indicators",
    icon: "📊",
    minRole: "viewer",
  },
  {
    href: "/insights",
    label: "Forecast",
    hint: "Holt's projection",
    icon: "📈",
    minRole: "analyst",
  },
  {
    href: "/cooperation",
    label: "Cooperation",
    hint: "Opportunities + pipeline",
    icon: "🤝",
    minRole: "analyst",
  },
  {
    href: "/sources",
    label: "Sources",
    hint: "Browse + ingest catalog",
    icon: "🗂️",
    minRole: "analyst",
  },
];

function QuickActions() {
  const { user } = useAuthedUser();
  const visible = QUICK_ACTIONS.filter((a) => hasRole(user, a.minRole)).slice(0, 6);
  if (visible.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="section-title mb-3">Quick actions</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {visible.map((a) => (
          <a
            key={a.href}
            href={a.href}
            className="card flex flex-col items-start gap-1.5 p-4 transition hover:border-accent hover:shadow-pop"
          >
            <span className="text-2xl leading-none" aria-hidden>
              {a.icon}
            </span>
            <span className="text-sm font-medium text-ink-800">{a.label}</span>
            <span className="text-2xs text-ink-500">{a.hint}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
