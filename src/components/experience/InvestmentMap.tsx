"use client";

import { coordsFor } from "@/lib/data/country-coords";
import { WORLD_H, WORLD_LAND_PATH, WORLD_W } from "@/lib/data/world-map";
import { fmtUsd } from "@/lib/experience/format";

const px = (lon: number) => ((lon + 180) / 360) * WORLD_W;
const py = (lat: number) => ((90 - lat) / 180) * WORLD_H;
const clampY = (y: number) => Math.min(388, Math.max(34, y));

/** UAE → partner arc with labelled pins and a flowing animated connection. */
export function InvestmentMap({
  iso3,
  countryName,
  headlineLabel,
  headlineUsd,
}: {
  iso3: string;
  countryName?: string;
  headlineLabel: string;
  headlineUsd: number;
}) {
  const uae = coordsFor("ARE");
  const partner = coordsFor(iso3);
  const a = uae ? { x: px(uae[1]), y: py(uae[0]) } : null;
  const b = partner ? { x: px(partner[1]), y: py(partner[0]) } : null;
  const mid =
    a && b
      ? {
          x: (a.x + b.x) / 2,
          y: Math.max(28, Math.min(a.y, b.y) - Math.abs(a.x - b.x) * 0.18 - 24),
        }
      : null;
  const partnerLabel = countryName ?? iso3;
  // Labels sit on the outer side of each pin so they never cross the arc.
  const partnerRight = a && b ? b.x >= a.x : true;

  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-ink-100">
      <svg
        viewBox={`0 14 ${WORLD_W} 402`}
        className="h-44 w-full sm:h-56"
        role="img"
        aria-label={`${headlineLabel}: UAE — ${partnerLabel}`}
      >
        <path d={WORLD_LAND_PATH} className="fill-ink-150" />
        {a && b && mid && (
          <>
            <path
              d={`M ${a.x} ${a.y} Q ${mid.x} ${mid.y} ${b.x} ${b.y}`}
              fill="none"
              className="stroke-accent map-arc"
              strokeWidth="2.5"
            />
            <circle
              cx={a.x}
              cy={a.y}
              r="9"
              fill="#92722a"
              opacity="0.3"
              className="animate-pulse"
            />
            <circle cx={a.x} cy={a.y} r="6" fill="#d7bc6d" />
            <text
              x={partnerRight ? a.x - 12 : a.x + 12}
              y={clampY(a.y + 5)}
              textAnchor={partnerRight ? "end" : "start"}
              fontSize="19"
              fontWeight="600"
              className="fill-ink-800"
            >
              UAE
            </text>
            <circle
              cx={b.x}
              cy={b.y}
              r="11"
              fill="#92722a"
              opacity="0.3"
              className="animate-pulse"
            />
            <circle cx={b.x} cy={b.y} r="7" fill="#d7bc6d" />
            <text
              x={partnerRight ? b.x + 16 : b.x - 14}
              y={clampY(b.y + 5)}
              textAnchor={partnerRight ? "start" : "end"}
              fontSize="19"
              fontWeight="600"
              className="fill-ink-800"
            >
              {partnerLabel}
            </text>
          </>
        )}
      </svg>
      <div className="absolute start-4 top-4 rounded-lg border border-accent/40 bg-ink-100/90 px-4 py-2 backdrop-blur">
        <p className="text-2xs uppercase tracking-wide text-ink-400">{headlineLabel}</p>
        <p className="font-display text-2xl font-bold text-tamm-cyan">{fmtUsd(headlineUsd)}</p>
      </div>
    </div>
  );
}
