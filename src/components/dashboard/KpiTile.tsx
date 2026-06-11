import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  delta?: string;
  trend?: "up" | "down" | "flat";
  source?: string;
}

const trendChip: Record<NonNullable<Props["trend"]>, string> = {
  up: "bg-signal-ok/10 text-signal-ok",
  down: "bg-signal-risk/10 text-signal-risk",
  flat: "bg-ink-100 text-ink-500",
};

const trendIcon: Record<NonNullable<Props["trend"]>, string> = {
  up: "↑",
  down: "↓",
  flat: "·",
};

export function KpiTile({ label, value, delta, trend = "flat", source }: Props) {
  return (
    <div className="card group border-t-2 border-t-ae-gold/60 p-5 transition hover:shadow-pop">
      <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-3">
        <div className="tabular text-3xl font-semibold tracking-tighter text-ink-800">{value}</div>
        {delta && (
          <div
            className={`inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-medium ${trendChip[trend]}`}
          >
            <span aria-hidden>{trendIcon[trend]}</span>
            {delta}
          </div>
        )}
      </div>
      {source && (
        <div className="mt-3 border-t border-ink-100 pt-2 font-mono text-2xs text-ink-400">
          Source · {source}
        </div>
      )}
    </div>
  );
}
