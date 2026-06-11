"use client";

import { useI18n } from "@/lib/i18n/context";

interface Props {
  summary: string;
  citations: string[];
  confidence: "high" | "med" | "low";
}

export function AiSummary({ summary, citations, confidence }: Props) {
  const { t } = useI18n();
  const confidenceClass =
    confidence === "high"
      ? "bg-signal-ok/15 text-signal-ok"
      : confidence === "med"
        ? "bg-signal-warn/15 text-signal-warn"
        : "bg-signal-risk/15 text-signal-risk";
  return (
    <section className="rounded-sm border border-accent/30 bg-accent-subtle/40 p-5">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-xs bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            AI
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-ink-800">
            {t.profile.aiSummary}
          </h2>
        </div>
        <span
          className={`rounded-xs px-2 py-0.5 text-[10px] font-medium uppercase ${confidenceClass}`}
        >
          {t.profile.confidence}: {confidence}
        </span>
      </header>
      <p className="text-sm leading-relaxed text-ink-700">{summary}</p>
      <div className="mt-3 text-[11px] text-ink-500">
        <span className="font-medium">{t.profile.sources}: </span>
        {citations.join(" · ")}
      </div>
    </section>
  );
}
