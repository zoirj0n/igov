"use client";

import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";

const COPY = {
  en: {
    citations: "Citations",
    web: "Live web sources",
    data: "Datapoints",
    classification: "Classification",
  },
  ar: {
    citations: "الاستشهادات",
    web: "مصادر الويب الحية",
    data: "نقاط البيانات",
    classification: "التصنيف",
  },
};

export function SourcesView({ state }: { state: AgentState }) {
  const { locale } = useI18n();
  const c = COPY[locale === "ar" ? "ar" : "en"];
  const citations = state.briefing?.citations ?? [];

  return (
    <div className="space-y-5">
      <p className="inline-flex items-center gap-2 rounded-full border border-tamm-olive/40 bg-tamm-olive/10 px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-tamm-olive">
        {c.classification}: {state.classification}
      </p>

      {citations.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {c.citations}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {citations.map((ci) => (
              <li
                key={ci}
                className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs text-ink-600"
              >
                {ci}
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.developments && state.developments.results.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">{c.web}</h3>
          <ul className="mt-2 space-y-1">
            {state.developments.results.map((d) => (
              <li key={d.url} className="truncate text-sm">
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-strong hover:underline"
                >
                  {d.title}
                </a>
                <span className="ms-2 text-2xs text-ink-400">
                  {d.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.indicators.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">{c.data}</h3>
          <ul className="mt-2 space-y-1">
            {state.indicators.map((i) => (
              <li
                key={i.code}
                className="flex items-baseline justify-between gap-3 border-b border-ink-150 py-1.5 text-sm last:border-0"
              >
                <span className="text-ink-600">{i.label}</span>
                <span className="shrink-0 font-mono text-2xs text-ink-400">
                  {i.source} · {i.year}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
