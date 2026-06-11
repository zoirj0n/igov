"use client";

import { useI18n } from "@/lib/i18n/context";
import { useEffect, useState } from "react";

interface Alert {
  id: string;
  iso3: string;
  category: "energy" | "growth" | "investment" | "trade" | "digital" | "sustainability";
  severity: "info" | "watch" | "high";
  title: string;
  detail: string;
}

const ICON: Record<Alert["category"], string> = {
  energy: "⚡",
  growth: "📈",
  investment: "💰",
  trade: "🔁",
  digital: "🌐",
  sustainability: "🌱",
};

const SEV_COLOR: Record<Alert["severity"], string> = {
  high: "bg-signal-risk",
  watch: "bg-tamm-olive",
  info: "bg-accent",
};

/** Big-number stat with an accent ring — leadership-readable at a glance. */
export function BigStat({
  value,
  label,
  tone,
  href,
}: {
  value: number | null;
  label: string;
  tone: "accent" | "risk" | "neutral";
  href: string;
}) {
  const ring =
    tone === "risk"
      ? "border-signal-risk/40 text-signal-risk"
      : tone === "accent"
        ? "border-accent/40 text-accent"
        : "border-ink-200 text-ink-800";
  return (
    <a
      href={href}
      className="card flex items-center gap-5 p-6 transition hover:border-accent hover:shadow-pop"
    >
      <div
        className={`grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 ${ring} text-3xl font-bold tabular`}
      >
        {value ?? "—"}
      </div>
      <div className="text-sm font-medium text-ink-700">{label}</div>
    </a>
  );
}

/** Severity mix as one stacked bar — the whole alert picture in one glance. */
function SeverityBar({ alerts }: { alerts: Alert[] }) {
  const { t } = useI18n();
  const counts = {
    high: alerts.filter((a) => a.severity === "high").length,
    watch: alerts.filter((a) => a.severity === "watch").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };
  const total = Math.max(1, alerts.length);
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-ink-100">
        {(["high", "watch", "info"] as const).map(
          (s) =>
            counts[s] > 0 && (
              <div
                key={s}
                className={SEV_COLOR[s]}
                style={{ width: `${(counts[s] / total) * 100}%` }}
                title={`${t.dashboard.exec.severity[s]}: ${counts[s]}`}
              />
            ),
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-2xs text-ink-500">
        {(["high", "watch", "info"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${SEV_COLOR[s]}`} aria-hidden />
            {t.dashboard.exec.severity[s]} · {counts[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Graphical executive overview: severity bar + the three alerts that matter,
 *  as large visual cards. Detail lives behind the "Detailed view" toggle. */
export function ExecutiveOverview() {
  const { t } = useI18n();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/alerts", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : { alerts: [] }))
      .then((d: { alerts?: Alert[] }) => {
        if (!cancelled) {
          setAlerts(d.alerts ?? []);
          setLoaded(true);
        }
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const rank: Record<Alert["severity"], number> = { high: 0, watch: 1, info: 2 };
  const top = [...alerts].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 3);

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-title">{t.dashboard.exec.watchTitle}</h2>
        <span className="font-mono text-2xs text-ink-400">{alerts.length}</span>
      </div>
      {loaded ? (
        <>
          <SeverityBar alerts={alerts} />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {top.map((a) => (
              <a
                key={a.id}
                href={`/country/${a.iso3}`}
                className="rounded-md border border-ink-150 bg-ink-50/60 p-4 transition hover:border-accent"
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl" aria-hidden>
                    {ICON[a.category]}
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${SEV_COLOR[a.severity]}`}
                    title={t.dashboard.exec.severity[a.severity]}
                  />
                </div>
                <div className="mt-2 line-clamp-2 text-sm font-medium text-ink-800">{a.title}</div>
                <div className="mt-1 font-mono text-2xs text-ink-400">{a.iso3}</div>
              </a>
            ))}
          </div>
        </>
      ) : (
        <div className="h-24 animate-pulse rounded-md bg-ink-100" />
      )}
    </section>
  );
}
