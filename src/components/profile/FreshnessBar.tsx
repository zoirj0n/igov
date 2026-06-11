"use client";

import type { Indicator } from "@/types";

const AUTHORITATIVE_PREFIXES = [
  "World Bank",
  "IMF",
  "Ember",
  "OECD",
  "IEA",
  "IRENA",
  "UN",
  "WEF",
  "IMD",
  "Climate Watch",
  "EIA",
  "BP",
  "WTO",
  "UNCTAD",
];
const SEED_PROXIES = new Set([
  "DXB Annual Report",
  "Etihad Rail",
  "Jebel Ali",
  "MoEI",
  "Mock",
  "Seed",
]);

export type Provenance = "authoritative" | "user" | "seed";

export function provenance(src: string): Provenance {
  if (!src) return "seed";
  if (src.startsWith("csv:") || src.startsWith("ai-extract:")) return "user";
  if (SEED_PROXIES.has(src)) return "seed";
  for (const p of AUTHORITATIVE_PREFIXES) {
    if (src === p || src.startsWith(`${p} `)) return "authoritative";
  }
  return "user";
}

interface FreshnessBarProps {
  indicators: Indicator[];
  active?: Provenance | null;
  onToggle?: (prov: Provenance) => void;
}

export function FreshnessBar({ indicators, active, onToggle }: FreshnessBarProps) {
  const total = indicators.length;
  if (total === 0) return null;
  const counts = { authoritative: 0, user: 0, seed: 0 };
  for (const i of indicators) counts[provenance(i.source)]++;
  const pct = {
    authoritative: (counts.authoritative / total) * 100,
    user: (counts.user / total) * 100,
    seed: (counts.seed / total) * 100,
  };
  const segments: { key: Provenance; n: number; pct: number; cls: string }[] = [
    { key: "authoritative", n: counts.authoritative, pct: pct.authoritative, cls: "bg-signal-ok" },
    { key: "user", n: counts.user, pct: pct.user, cls: "bg-accent" },
    { key: "seed", n: counts.seed, pct: pct.seed, cls: "bg-ink-300" },
  ];
  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between text-2xs">
        <span className="font-medium uppercase tracking-wide text-ink-500">Data freshness</span>
        <span className="font-mono text-ink-400">
          {active ? `filtered: ${active} · ` : ""}
          {total} indicators
          {active && onToggle && (
            <button
              type="button"
              onClick={() => onToggle(active)}
              className="ms-2 text-accent hover:underline"
            >
              clear
            </button>
          )}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-xs bg-ink-100">
        {segments.map((s) =>
          s.pct === 0 ? null : (
            <button
              key={s.key}
              type="button"
              onClick={() => onToggle?.(s.key)}
              disabled={!onToggle}
              style={{ width: `${s.pct}%` }}
              className={`h-full transition ${s.cls} ${
                active === s.key ? "ring-2 ring-ink-800 ring-inset" : ""
              } ${onToggle ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
              title={`${s.n} ${labelOf(s.key)}${onToggle ? " · click to filter" : ""}`}
              aria-pressed={active === s.key}
            />
          ),
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-3 text-2xs text-ink-600">
        {segments.map((s) => (
          <Legend
            key={s.key}
            dot={s.cls}
            label={labelOf(s.key)}
            n={s.n}
            active={active === s.key}
            onClick={onToggle ? () => onToggle(s.key) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function labelOf(p: Provenance): string {
  return p === "authoritative" ? "Official" : p === "user" ? "User" : "Seed";
}

function Legend({
  dot,
  label,
  n,
  active,
  onClick,
}: {
  dot: string;
  label: string;
  n: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const cls = `inline-flex items-center gap-1.5 rounded-xs px-1 py-0.5 transition ${
    active ? "bg-ink-100 text-ink-800" : "hover:bg-ink-150"
  }`;
  const content = (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      <span className="font-medium text-ink-700">{label}</span>
      <span className="font-mono text-ink-400">{n}</span>
    </>
  );
  if (!onClick) return <span className={cls}>{content}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cls} cursor-pointer`}
      aria-pressed={active}
    >
      {content}
    </button>
  );
}
