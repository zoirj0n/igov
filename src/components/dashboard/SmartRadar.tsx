"use client";

import { COUNTRIES } from "@/lib/data/countries";
import { useI18n } from "@/lib/i18n/context";
import { useEffect, useState } from "react";

interface Alert {
  id: string;
  iso3: string;
  category: "energy" | "growth" | "investment" | "trade" | "digital" | "sustainability";
  severity: "info" | "watch" | "high";
  title: string;
  detail: string;
  year: number;
}

const ICON: Record<Alert["category"], string> = {
  energy: "⚡",
  growth: "📈",
  investment: "💰",
  trade: "🔁",
  digital: "🌐",
  sustainability: "🌱",
};

const SEV_BORDER: Record<Alert["severity"], string> = {
  high: "border-s-signal-risk",
  watch: "border-s-tamm-olive",
  info: "border-s-accent",
};

export function SmartRadar() {
  const { locale } = useI18n();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/alerts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { alerts: [] }))
      .then((d) => {
        if (!cancelled) {
          setAlerts((d.alerts ?? []) as Alert[]);
          setLoaded(true);
        }
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const title = locale === "ar" ? "الرصد الذكي" : "Smart Radar";
  const sub =
    locale === "ar" ? "إشارات حيّة من أحدث المؤشرات" : "Live signals from the latest indicators";

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-ink-100 px-5 py-3.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tamm-cyan opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <div>
          <div className="text-sm font-semibold text-ink-800">{title}</div>
          <div className="text-2xs text-ink-400">{sub}</div>
        </div>
        <span className="ms-auto rounded-full bg-accent-subtle px-2 py-0.5 text-2xs font-bold text-accent-strong">
          {alerts.length}
        </span>
      </div>

      <ul className="max-h-[420px] divide-y divide-ink-100 overflow-y-auto">
        {alerts.map((a) => {
          const c = COUNTRIES.find((x) => x.iso3 === a.iso3);
          const name = c ? (locale === "ar" ? c.nameAr : c.nameEn) : a.iso3;
          return (
            <li key={a.id} className={`border-s-2 ${SEV_BORDER[a.severity]} px-5 py-3`}>
              <div className="flex items-center gap-2">
                <span aria-hidden>{ICON[a.category]}</span>
                <span className="text-sm font-medium text-ink-800">{a.title}</span>
                <span className="ms-auto text-2xs text-ink-400">
                  {c?.flagEmoji} {name}
                </span>
              </div>
              <p className="mt-0.5 ps-6 text-xs text-ink-500">{a.detail}</p>
            </li>
          );
        })}
        {loaded && alerts.length === 0 && (
          <li className="px-5 py-6 text-center text-xs text-ink-400">No active signals.</li>
        )}
      </ul>
    </section>
  );
}
