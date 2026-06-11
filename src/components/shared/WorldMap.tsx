"use client";

import { COUNTRIES } from "@/lib/data/countries";
import { WORLD_H, WORLD_LAND_PATH, WORLD_W } from "@/lib/data/world-map";
import { useI18n } from "@/lib/i18n/context";

const COORDS: Record<string, [number, number]> = {
  ARE: [24, 54],
  SAU: [24, 45],
  USA: [38, -97],
  GBR: [54, -2],
  FRA: [46, 2],
  DEU: [51, 10],
  JPN: [36, 138],
  KOR: [36, 128],
  CHN: [35, 105],
  IND: [21, 78],
  BRA: [-14, -52],
  ZAF: [-30, 23],
};

const TEAL = "#92722a";
const CYAN = "#d7bc6d";
const HUB = "ARE";

const px = (lon: number) => ((lon + 180) / 360) * WORLD_W;
const py = (lat: number) => ((90 - lat) / 180) * WORLD_H;

// Crop to inhabited latitudes (≈ 85°N … −55°S) so the frame isn't mostly empty.
const VIEW = { x: 0, y: 14, w: WORLD_W, h: 402 };

interface Pt {
  iso3: string;
  x: number;
  y: number;
  partner: boolean;
}

export function WorldMap({ partnerIso3 = ["ARE"] }: { partnerIso3?: string[] }) {
  const { t } = useI18n();
  const pts: Pt[] = COUNTRIES.filter((c) => COORDS[c.iso3]).map((c) => {
    const [lat, lon] = COORDS[c.iso3] as [number, number];
    return { iso3: c.iso3, x: px(lon), y: py(lat), partner: partnerIso3.includes(c.iso3) };
  });
  const hub = pts.find((p) => p.iso3 === HUB);
  const spokes = pts.filter((p) => p.iso3 !== HUB && p.partner);

  return (
    <section className="overflow-hidden rounded-md border border-ink-200 bg-ink-100 shadow-card">
      <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-ink-800">
          {t.dashboard.globalMap}
        </h2>
        <div className="flex items-center gap-3 text-[11px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(146, 114, 42,0.9)]" />
            partner
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ink-400" /> tracked
          </span>
        </div>
      </header>

      <div className="relative bg-ink-50">
        <svg
          viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
          className="block h-72 w-full"
          role="img"
          aria-label="World engagement map"
        >
          <defs>
            <radialGradient id="map-glow" cx="50%" cy="42%" r="60%">
              <stop offset="0%" stopColor={TEAL} stopOpacity="0.10" />
              <stop offset="100%" stopColor={TEAL} stopOpacity="0" />
            </radialGradient>
            <linearGradient id="arc-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={TEAL} stopOpacity="0.05" />
              <stop offset="50%" stopColor={CYAN} stopOpacity="0.8" />
              <stop offset="100%" stopColor={TEAL} stopOpacity="0.05" />
            </linearGradient>
            <filter id="pin-glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="url(#map-glow)" />

          {/* graticule */}
          <g stroke="rgba(255,255,255,0.045)" strokeWidth={0.6}>
            {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => (
              <line key={`mer-${lon}`} x1={px(lon)} y1={VIEW.y} x2={px(lon)} y2={VIEW.y + VIEW.h} />
            ))}
            {[-30, 0, 30, 60].map((lat) => (
              <line key={`par-${lat}`} x1={0} y1={py(lat)} x2={WORLD_W} y2={py(lat)} />
            ))}
          </g>

          {/* land */}
          <path d={WORLD_LAND_PATH} fill="#1b1c26" stroke="#34354360" strokeWidth={0.5} />

          {/* engagement arcs: UAE → partners */}
          {hub &&
            spokes.map((p) => {
              const cx = (hub.x + p.x) / 2;
              const cy = (hub.y + p.y) / 2 - Math.hypot(p.x - hub.x, p.y - hub.y) * 0.22;
              return (
                <path
                  key={`arc-${p.iso3}`}
                  d={`M${hub.x} ${hub.y} Q${cx} ${cy} ${p.x} ${p.y}`}
                  fill="none"
                  stroke="url(#arc-grad)"
                  strokeWidth={1.1}
                  strokeLinecap="round"
                  strokeDasharray="3 7"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    values="20;0"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </path>
              );
            })}

          {/* pins */}
          {pts.map((p) => {
            const isHub = p.iso3 === HUB;
            const color = p.partner ? TEAL : "#6a6b78";
            return (
              <g key={p.iso3}>
                {p.partner && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill="none"
                    stroke={isHub ? CYAN : TEAL}
                    strokeWidth={1.4}
                  >
                    <animate
                      attributeName="r"
                      values={isHub ? "5;18;5" : "4;13;4"}
                      dur={isHub ? "2.4s" : "2.8s"}
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.7;0;0.7"
                      dur={isHub ? "2.4s" : "2.8s"}
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.partner ? (isHub ? 5 : 4) : 2.6}
                  fill={color}
                  filter={p.partner ? "url(#pin-glow)" : undefined}
                />
                <text
                  x={p.x + 7}
                  y={p.y + 3}
                  fontSize={9.5}
                  fill={p.partner ? "#e4e5ea" : "#8b8c98"}
                  fontFamily='"JetBrains Mono", monospace'
                  fontWeight={600}
                >
                  {p.iso3}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
