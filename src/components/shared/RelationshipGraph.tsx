"use client";

import { COUNTRIES } from "@/lib/data/countries";

export interface RelationshipEdge {
  partnerIso3: string;
  strength: number;
  stage: "scoping" | "proposal" | "negotiation" | "signed";
}

interface Props {
  hubIso3: string;
  edges: RelationshipEdge[];
  size?: number;
}

const stageColor: Record<RelationshipEdge["stage"], string> = {
  scoping: "#b4b1a6",
  proposal: "#615e54",
  negotiation: "oklch(0.72 0.08 80)",
  signed: "oklch(0.62 0.07 150)",
};

export function RelationshipGraph({ hubIso3, edges, size = 480 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 60;
  const n = edges.length;
  const hub = COUNTRIES.find((c) => c.iso3 === hubIso3);

  const layout = edges.map((e, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return {
      ...e,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      country: COUNTRIES.find((c) => c.iso3 === e.partnerIso3),
    };
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="block w-full"
      style={{ maxHeight: size }}
      role="img"
      aria-label="Bilateral relationship graph"
    >
      {[0.4, 0.7, 1].map((m) => (
        <circle
          key={m}
          cx={cx}
          cy={cy}
          r={r * m}
          fill="none"
          stroke="#ecebe6"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
      ))}

      {layout.map((p) => {
        const w = 1 + (p.strength / 100) * 4;
        return (
          <line
            key={`edge-${p.partnerIso3}`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke={stageColor[p.stage]}
            strokeWidth={w}
            strokeOpacity={0.7}
          />
        );
      })}

      {layout.map((p) => (
        <g key={`node-${p.partnerIso3}`}>
          <circle cx={p.x} cy={p.y} r={24} className="fill-ink-100 stroke-ink-300" strokeWidth={1.5} />
          <text x={p.x} y={p.y + 1} fontSize={18} textAnchor="middle" dominantBaseline="middle">
            {p.country?.flagEmoji ?? ""}
          </text>
          <text
            x={p.x}
            y={p.y + 38}
            fontSize={10}
            fontFamily='"JetBrains Mono", monospace'
            className="fill-ink-500"
            textAnchor="middle"
          >
            {p.partnerIso3}
          </text>
          <text x={p.x} y={p.y + 52} fontSize={9} className="fill-ink-400" textAnchor="middle">
            {p.strength}
          </text>
        </g>
      ))}

      <circle cx={cx} cy={cy} r={32} className="fill-ink-800" stroke="oklch(0.58 0.07 250)" strokeWidth={2} />
      <text x={cx} y={cy + 1} fontSize={24} textAnchor="middle" dominantBaseline="middle">
        {hub?.flagEmoji ?? ""}
      </text>
      <text
        x={cx}
        y={cy + 50}
        fontSize={10}
        fontFamily='"JetBrains Mono", monospace'
        className="fill-ink-500"
        textAnchor="middle"
        fontWeight={600}
      >
        {hubIso3}
      </text>

      <g transform={`translate(${size - 140} ${size - 90})`}>
        <rect x={0} y={0} width={130} height={80} rx={4} className="fill-ink-100 stroke-ink-200" />
        <text x={8} y={16} fontSize={10} className="fill-ink-500" fontFamily='"JetBrains Mono", monospace'>
          STAGE
        </text>
        {(["scoping", "proposal", "negotiation", "signed"] as const).map((s, i) => (
          <g key={s} transform={`translate(8 ${24 + i * 13})`}>
            <line x1={0} y1={4} x2={14} y2={4} stroke={stageColor[s]} strokeWidth={2.5} />
            <text x={20} y={8} fontSize={10} className="fill-ink-800">
              {s}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
