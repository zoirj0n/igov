"use client";

import { useEffect, useRef, useState } from "react";

interface Scene {
  index: number;
  startSec: number;
  endSec: number;
  visual: string;
  onScreenText: string;
  narration: string;
  source?: string;
}

interface Variant {
  id: string;
  title: string;
  style: "executive" | "documentary" | "data-narrative" | "diplomatic";
  scenes: Scene[];
  classification: "public" | "internal" | "confidential" | "secret";
}

const STYLE_TINT: Record<Variant["style"], string> = {
  executive: "#1f1e1a",
  documentary: "#615e54",
  "data-narrative": "#46443d",
  diplomatic: "#8a8779",
};

interface Props {
  variant: Variant;
  countries: string[];
  ttsEnabled?: boolean;
}

function fmt(sec: number): string {
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}

export function VideoPlayback({ variant, countries, ttsEnabled = true }: Props) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ttsOn, setTtsOn] = useState(ttsEnabled);
  const lastNarratedScene = useRef<number>(-1);
  const totalSec =
    variant.scenes.length === 0 ? 0 : (variant.scenes[variant.scenes.length - 1] as Scene).endSec;

  useEffect(() => {
    setT(0);
    setPlaying(false);
    lastNarratedScene.current = -1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [variant.id]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setT((v) => {
        const next = v + 0.1;
        if (next >= totalSec) {
          setPlaying(false);
          if (typeof window !== "undefined" && "speechSynthesis" in window) {
            window.speechSynthesis.cancel();
          }
          lastNarratedScene.current = -1;
          return totalSec;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, totalSec]);

  const currentScene =
    variant.scenes.find((s) => t >= s.startSec && t < s.endSec) ?? variant.scenes[0];
  const sceneIndex = currentScene?.index ?? 0;

  useEffect(() => {
    if (!playing || !ttsOn || !currentScene) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (lastNarratedScene.current === currentScene.index) return;
    lastNarratedScene.current = currentScene.index;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(currentScene.narration);
    utter.rate = 0.95;
    utter.pitch = 1;
    const sceneDuration = currentScene.endSec - currentScene.startSec;
    const wpm = (currentScene.narration.split(/\s+/).length / Math.max(0.5, sceneDuration)) * 60;
    utter.rate = Math.max(0.8, Math.min(1.3, wpm / 160));
    window.speechSynthesis.speak(utter);
  }, [sceneIndex, playing, ttsOn, currentScene]);

  function toggle(): void {
    if (typeof window === "undefined") return;
    if (playing) {
      if ("speechSynthesis" in window) window.speechSynthesis.pause();
      setPlaying(false);
    } else {
      if (t >= totalSec) {
        setT(0);
        lastNarratedScene.current = -1;
      }
      if ("speechSynthesis" in window && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      setPlaying(true);
    }
  }

  function restart(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setT(0);
    lastNarratedScene.current = -1;
    setPlaying(true);
  }

  function toggleTts(): void {
    if (ttsOn && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setTtsOn((v) => !v);
  }

  const pct = totalSec === 0 ? 0 : Math.min(100, (t / totalSec) * 100);
  const tint = STYLE_TINT[variant.style];

  return (
    <div className="overflow-hidden rounded-sm border border-ink-200 bg-[#101013] text-white">
      <div className="relative aspect-video w-full overflow-hidden">
        <svg
          viewBox="0 0 960 540"
          className="absolute inset-0 h-full w-full"
          aria-label="Video playback"
        >
          <defs>
            <linearGradient id="bgGrad2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={tint} />
              <stop offset="100%" stopColor="#0f0f0d" />
            </linearGradient>
            <pattern id="dots2" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="transparent" />
              <circle cx="20" cy="20" r="1" fill="rgba(255,255,255,0.07)" />
            </pattern>
          </defs>
          <rect width="960" height="540" fill="url(#bgGrad2)" />
          <rect width="960" height="540" fill="url(#dots2)" />

          {currentScene && (
            <g key={currentScene.index}>
              <rect x="48" y="48" width="220" height="6" fill="oklch(0.58 0.07 250)" rx="3" />
              <text
                x="48"
                y="100"
                fill="#fff"
                fontSize="22"
                fontWeight="600"
                fontFamily="Inter, system-ui"
                style={{ letterSpacing: "0.5px" }}
              >
                {`SCENE ${currentScene.index + 1} · ${fmt(currentScene.startSec)}–${fmt(currentScene.endSec)}`}
              </text>
              <text x="48" y="140" fill="rgba(255,255,255,0.7)" fontSize="14" fontFamily="Inter">
                {variant.title}
              </text>

              {currentScene.onScreenText && (
                <g>
                  <rect
                    x="48"
                    y="200"
                    width={Math.max(160, currentScene.onScreenText.length * 16 + 32)}
                    height="52"
                    fill="#ffffff"
                  />
                  <text x="64" y="234" fontSize="22" fontWeight="700" fill="#1f1e1a">
                    {currentScene.onScreenText}
                  </text>
                </g>
              )}

              <foreignObject x="48" y="290" width="864" height="180">
                <div
                  style={{
                    color: "rgba(255,255,255,0.92)",
                    fontFamily: "Inter, system-ui",
                    fontSize: 18,
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {currentScene.narration}
                </div>
              </foreignObject>

              <text
                x="48"
                y="500"
                fill="rgba(255,255,255,0.55)"
                fontSize="11"
                fontFamily="JetBrains Mono, monospace"
              >
                {currentScene.source ? `Source: ${currentScene.source}` : ""}
                {currentScene.source ? " · " : ""}
                {countries.join(" × ")}
              </text>
            </g>
          )}

          <text
            x="940"
            y="40"
            fill="rgba(255,255,255,0.55)"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="end"
            style={{ letterSpacing: "1px" }}
          >
            {variant.classification.toUpperCase()}
          </text>

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
          onClick={toggle}
          className="absolute bottom-3 left-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#1f1e1a] hover:bg-white"
        >
          {playing ? (
            <span className="flex gap-1">
              <span className="h-4 w-1 bg-[#1f1e1a]" />
              <span className="h-4 w-1 bg-[#1f1e1a]" />
            </span>
          ) : (
            <span
              className="ms-0.5 block h-0 w-0"
              style={{
                borderLeft: "11px solid #1f1e1a",
                borderTop: "7px solid transparent",
                borderBottom: "7px solid transparent",
              }}
            />
          )}
        </button>

        <button
          type="button"
          onClick={restart}
          className="absolute bottom-3 start-16 rounded-full bg-white/15 px-3 py-2 text-xs text-white hover:bg-white/25"
          title="restart"
        >
          ↺
        </button>

        <button
          type="button"
          onClick={toggleTts}
          className={`absolute bottom-3 start-28 rounded-full px-3 py-2 text-xs ${
            ttsOn ? "bg-accent text-white" : "bg-white/15 text-white hover:bg-white/25"
          }`}
          title="toggle narration"
        >
          {ttsOn ? "TTS on" : "TTS off"}
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-xs">
        <span className="tabular text-white/80">
          {fmt(t)} / {fmt(totalSec)}
        </span>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-xs bg-white/10">
          <div
            className="h-full transition-[width]"
            style={{ width: `${pct}%`, backgroundColor: "oklch(0.58 0.07 250)" }}
          />
        </div>
        <div className="flex gap-0.5" aria-hidden>
          {variant.scenes.map((s, i) => {
            const segWidth = Math.max(2, (s.endSec - s.startSec) * 1.5);
            const isPast = t >= s.endSec;
            const isCurrent = t >= s.startSec && t < s.endSec;
            return (
              <div
                key={i}
                className="rounded-sm"
                style={{
                  width: `${segWidth}px`,
                  height: isCurrent ? "10px" : "6px",
                  backgroundColor:
                    isPast || isCurrent ? "oklch(0.58 0.07 250)" : "rgba(255,255,255,0.25)",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
