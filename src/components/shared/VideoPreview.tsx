"use client";

import { useEffect, useState } from "react";

interface Props {
  duration: number;
  style: string;
  countries: string[];
  title?: string;
}

export function VideoPreview({ duration, style, countries, title }: Props) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setT((v) => {
        const next = v + 0.5;
        return next > duration ? 0 : next;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [playing, duration]);

  const pct = Math.min(100, (t / duration) * 100);
  const fmt = (s: number): string => {
    const mm = Math.floor(s / 60)
      .toString()
      .padStart(2, "0");
    const ss = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
    return `${mm}:${ss}`;
  };

  return (
    <div className="overflow-hidden rounded-sm border border-ink-200 bg-ink-100 text-white">
      <div className="relative aspect-video w-full overflow-hidden">
        <svg
          viewBox="0 0 960 540"
          className="absolute inset-0 h-full w-full"
          aria-label="Video preview frame"
          role="img"
        >
          <defs>
            <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1f1e1a" />
              <stop offset="100%" stopColor="#0f0f0d" />
            </linearGradient>
            <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="transparent" />
              <circle cx="20" cy="20" r="1" fill="rgba(255,255,255,0.07)" />
            </pattern>
          </defs>
          <rect width="960" height="540" fill="url(#bgGrad)" />
          <rect width="960" height="540" fill="url(#dots)" />

          <g opacity="0.85">
            <rect x="48" y="48" width="220" height="6" fill="oklch(0.58 0.07 250)" rx="3" />
            <text
              x="48"
              y="100"
              fill="#fff"
              fontSize="32"
              fontWeight="600"
              fontFamily="Inter, system-ui"
            >
              {title ?? "Bilateral Cooperation Briefing"}
            </text>
            <text
              x="48"
              y="138"
              fill="rgba(255,255,255,0.6)"
              fontSize="16"
              fontFamily="Inter, system-ui"
            >
              {countries.join(" · ")} · {style}
            </text>
          </g>

          <g transform="translate(48 220)">
            {[14.2, 24.3, 52.1, 6.1].map((v, i) => (
              <g key={i}>
                <rect
                  x={i * 100}
                  y={120 - v * 2}
                  width="64"
                  height={v * 2}
                  fill="oklch(0.58 0.07 250)"
                  opacity={0.7 + i * 0.05}
                />
                <text
                  x={i * 100 + 32}
                  y={140}
                  fontSize="11"
                  fill="rgba(255,255,255,0.65)"
                  textAnchor="middle"
                >
                  {["UAE", "JPN", "DEU", "SAU"][i]}
                </text>
                <text
                  x={i * 100 + 32}
                  y={120 - v * 2 - 6}
                  fontSize="11"
                  fill="#fff"
                  textAnchor="middle"
                >
                  {v}%
                </text>
              </g>
            ))}
          </g>

          <g transform="translate(48 460)">
            <text
              x="0"
              y="0"
              fill="rgba(255,255,255,0.45)"
              fontSize="11"
              fontFamily="JetBrains Mono, monospace"
            >
              Source: World Bank, IRENA, 2025 — confidence: High
            </text>
          </g>

          <line
            x1={(pct / 100) * 960}
            y1={0}
            x2={(pct / 100) * 960}
            y2={540}
            stroke="oklch(0.58 0.07 250)"
            strokeWidth={1.5}
            strokeOpacity={0.3}
          />
        </svg>

        <button
          type="button"
          aria-label={playing ? "pause" : "play"}
          onClick={() => setPlaying((p) => !p)}
          className="absolute bottom-3 start-3 flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-900 hover:bg-ink-200"
        >
          {playing ? (
            <span className="flex gap-0.5">
              <span className="h-3 w-1 bg-ink-100" />
              <span className="h-3 w-1 bg-ink-100" />
            </span>
          ) : (
            <span
              className="ms-0.5 block h-0 w-0"
              style={{
                borderLeft: "9px solid #1f1e1a",
                borderTop: "6px solid transparent",
                borderBottom: "6px solid transparent",
              }}
            />
          )}
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-xs">
        <span className="tabular text-white/80">
          {fmt(t)} / {fmt(duration)}
        </span>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-xs bg-white/10">
          <div
            className="h-full"
            style={{ width: `${pct}%`, backgroundColor: "oklch(0.58 0.07 250)" }}
          />
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: 28 }, (_, i) => (
            <div
              key={i}
              className="w-0.5 rounded-sm"
              style={{
                height: `${6 + Math.abs(Math.sin(i * 0.7)) * 14}px`,
                backgroundColor:
                  i < (pct / 100) * 28 ? "oklch(0.58 0.07 250)" : "rgba(255,255,255,0.2)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
