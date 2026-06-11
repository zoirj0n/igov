"use client";

import { useI18n } from "@/lib/i18n/context";
import type { MetricKey } from "@/lib/i18n/messages";
import type { Indicator } from "@/types";
import { formatMetric } from "@/utils/format";
import { type Provenance, provenance } from "./FreshnessBar";

interface Props {
  indicator: Indicator;
}

const confidenceDot: Record<Indicator["confidence"], string> = {
  high: "bg-signal-ok",
  med: "bg-signal-warn",
  low: "bg-signal-risk",
};

export function IndicatorCard({ indicator }: Props) {
  const { locale, t } = useI18n();
  const label =
    (t.metrics as Record<string, string>)[indicator.metric as MetricKey] ?? indicator.metric;

  return (
    <div className="card group p-4 transition hover:shadow-pop">
      <div className="flex items-start justify-between gap-2">
        <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">{label}</div>
        <span
          className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${confidenceDot[indicator.confidence]}`}
          title={`${t.profile.confidence}: ${indicator.confidence}`}
          aria-hidden
        />
      </div>
      <div className="mt-2 tabular text-2xl font-semibold tracking-tight text-ink-800">
        {formatMetric(indicator.value, indicator.unit, locale)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-100 pt-2 text-2xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <ProvenanceChip prov={provenance(indicator.source)} />
          <span className="truncate font-medium text-ink-500" title={indicator.source}>
            {indicator.source}
          </span>
        </span>
        <span className="shrink-0 font-mono text-ink-400">{indicator.year}</span>
      </div>
    </div>
  );
}

function ProvenanceChip({ prov }: { prov: Provenance }) {
  const cfg = {
    authoritative: {
      cls: "bg-signal-ok/15 text-signal-ok",
      label: "OFFICIAL",
      title: "Authoritative international source",
    },
    user: {
      cls: "bg-accent/15 text-accent",
      label: "USER",
      title: "User-uploaded or AI-extracted",
    },
    seed: { cls: "bg-ink-100 text-ink-500", label: "SEED", title: "Mock/seed data — not live" },
  }[prov];
  return (
    <span
      className={`rounded-xs px-1 py-0.5 font-mono text-[9px] font-medium tracking-wide ${cfg.cls}`}
      title={cfg.title}
    >
      {cfg.label}
    </span>
  );
}
