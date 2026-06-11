"use client";

import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";

const COPY = {
  en: {
    deals: "Deal pipeline",
    risks: "Risks",
    position: "UAE position",
    offers: "Offers",
    asks: "Asks",
    redLines: "Red lines",
    horizon: { near: "Near", mid: "Mid", long: "Long" } as Record<string, string>,
  },
  ar: {
    deals: "خط الصفقات",
    risks: "المخاطر",
    position: "موقف الإمارات",
    offers: "العروض",
    asks: "المطالب",
    redLines: "الخطوط الحمراء",
    horizon: { near: "قريب", mid: "متوسط", long: "بعيد" } as Record<string, string>,
  },
};

export function OpportunitiesView({ state }: { state: AgentState }) {
  const { locale } = useI18n();
  const c = COPY[locale === "ar" ? "ar" : "en"];
  // Deals / position / risks are translated in briefingAr — follow the locale
  // so this tab localizes with the brief, not only its labels.
  const b = locale === "ar" ? (state.briefingAr ?? state.briefing) : state.briefing;

  return (
    <div className="space-y-5">
      {b && b.deals.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">{c.deals}</h3>
          <ul className="mt-2 space-y-2.5">
            {b.deals.map((d) => (
              <li key={d.title} className="rounded-lg border border-ink-200 bg-ink-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink-800">{d.title}</span>
                  <span className="flex items-center gap-2 text-2xs text-ink-500">
                    <span className="rounded-full border border-ink-200 px-2 py-0.5">
                      {c.horizon[d.horizon] ?? d.horizon}
                    </span>
                    <span className="rounded-full border border-ink-200 px-2 py-0.5">
                      {d.confidence}
                    </span>
                    <span className="font-mono text-tamm-cyan">{Math.round(d.score)}/100</span>
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink-600">{d.rationale}</p>
                {d.evidence && <p className="mt-1 font-mono text-2xs text-ink-400">{d.evidence}</p>}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-150">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${d.score}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {b && (
        <section className="grid gap-3 sm:grid-cols-3">
          {(
            [
              [c.offers, b.position.offers],
              [c.asks, b.position.asks],
              [c.redLines, b.position.redLines],
            ] as const
          ).map(([label, items]) => (
            <div key={label} className="rounded-lg border border-ink-200 bg-ink-50 p-4">
              <h4 className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                {label}
              </h4>
              <ul className="mt-1.5 list-disc space-y-1 ps-4 text-sm text-ink-700">
                {items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {b && b.risks.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">{c.risks}</h3>
          <ul className="mt-2 space-y-1.5">
            {b.risks.map((r) => (
              <li
                key={r.text}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm"
              >
                <span className="text-ink-700">{r.text}</span>
                <span className="shrink-0 font-mono text-2xs text-ink-400">
                  {r.likelihood} · impact {r.impact}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
