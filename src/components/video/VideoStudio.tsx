"use client";

import { VideoPreview } from "@/components/shared/VideoPreview";
import { VideoPlayback } from "@/components/video/VideoPlayback";
import { COUNTRIES } from "@/lib/data/countries";
import { useToast } from "@/lib/hooks/useToast";
import { useI18n } from "@/lib/i18n/context";
import { useState } from "react";

type Style = "executive" | "documentary" | "data-narrative" | "diplomatic";

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
  hook: string;
  style: Style;
  scenes: Scene[];
  citations: string[];
  confidence: "high" | "med" | "low";
  classification: "public" | "internal" | "confidential" | "secret";
}

const STYLE_TINT: Record<Style, string> = {
  executive: "#1f1e1a",
  documentary: "#615e54",
  "data-narrative": "#46443d",
  diplomatic: "#8a8779",
};

function fmt(sec: number): string {
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}

export function VideoStudio() {
  const { t } = useI18n();
  const { push } = useToast();
  const [prompt, setPrompt] = useState(
    "UAE-Germany green hydrogen partnership opportunity for the Energy Minister's visit.",
  );
  const [countries, setCountries] = useState<string[]>(["ARE", "DEU"]);
  const [duration, setDuration] = useState(60);
  const [style, setStyle] = useState<Style>("executive");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = variants.find((v) => v.id === activeId) ?? variants[0];

  async function generate(): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch("/api/videos/script", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          countries,
          durationSeconds: duration,
          style,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      const vs = Array.isArray(data.variants) ? (data.variants as Variant[]) : [];
      setVariants(vs);
      setActiveId(vs[0]?.id ?? null);
      push({
        kind: "success",
        title: "Script generated",
        detail: `${vs.length} variants · ${vs[0]?.scenes.length ?? 0} scenes${data.usedRealApi ? "" : " (mock)"}`,
      });
    } catch (err) {
      push({
        kind: "error",
        title: "Script generation failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  function toggleCountry(iso: string): void {
    setCountries((prev) => (prev.includes(iso) ? prev.filter((x) => x !== iso) : [...prev, iso]));
  }

  async function downloadStoryboard(v: Variant): Promise<void> {
    try {
      const res = await fetch("/api/videos/storyboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          variant: v,
          prompt,
          durationSeconds: duration,
          countries,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(typeof err?.error === "string" ? err.error : `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
        "storyboard.pdf";
      triggerDownload(blob, filename);
      push({ kind: "success", title: "Storyboard downloaded", detail: filename });
    } catch (err) {
      push({
        kind: "error",
        title: "Storyboard failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function downloadManifest(v: Variant): Promise<void> {
    try {
      const res = await fetch("/api/videos/manifest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variant: v, countries, durationSeconds: duration }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(typeof err?.error === "string" ? err.error : `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
        "manifest.json";
      triggerDownload(blob, filename);
      push({ kind: "success", title: "Manifest downloaded", detail: filename });
    } catch (err) {
      push({
        kind: "error",
        title: "Manifest failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function downloadSrt(v: Variant): Promise<void> {
    try {
      const res = await fetch("/api/videos/srt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(typeof err?.error === "string" ? err.error : `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
        "subtitles.srt";
      triggerDownload(blob, filename);
      push({ kind: "success", title: "Subtitles downloaded", detail: filename });
    } catch (err) {
      push({
        kind: "error",
        title: "Subtitles failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-10 lg:grid-cols-[320px_1fr]">
      <aside className="card space-y-5 p-5">
        <div>
          <label
            htmlFor="vid-prompt"
            className="mb-1 block text-xs uppercase tracking-wide text-ink-500"
          >
            {t.video.prompt}
          </label>
          <textarea
            id="vid-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="w-full rounded-sm border border-ink-200 bg-ink-100 px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-ink-500">
            {t.video.countries}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COUNTRIES.slice(0, 10).map((c) => {
              const on = countries.includes(c.iso3);
              return (
                <button
                  key={c.iso3}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCountry(c.iso3)}
                  className={
                    on
                      ? "rounded-sm bg-accent px-2 py-1 text-[11px] text-white"
                      : "rounded-sm border border-ink-200 px-2 py-1 text-[11px] text-ink-600"
                  }
                >
                  {c.flagEmoji} {c.iso3}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="vid-dur"
              className="mb-1 block text-xs uppercase tracking-wide text-ink-500"
            >
              {t.video.duration}
            </label>
            <input
              id="vid-dur"
              type="number"
              min={15}
              max={180}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-sm border border-ink-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="vid-style"
              className="mb-1 block text-xs uppercase tracking-wide text-ink-500"
            >
              {t.video.style}
            </label>
            <select
              id="vid-style"
              value={style}
              onChange={(e) => setStyle(e.target.value as Style)}
              className="w-full rounded-sm border border-ink-200 bg-ink-100 px-2 py-1.5 text-sm"
            >
              <option value="executive">executive</option>
              <option value="documentary">documentary</option>
              <option value="data-narrative">data-narrative</option>
              <option value="diplomatic">diplomatic</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={busy || !prompt.trim() || countries.length === 0}
          className="w-full rounded-sm bg-accent px-3 py-2 text-sm text-white hover:bg-accent-strong disabled:bg-ink-300"
        >
          {busy ? "Generating script…" : t.video.generate}
        </button>
      </aside>

      <section className="space-y-6">
        {active ? (
          <VideoPlayback variant={active} countries={countries} />
        ) : (
          <VideoPreview
            duration={duration}
            style={style}
            countries={countries}
            title={prompt.split(/[.!?]/)[0]?.slice(0, 70) ?? "Bilateral Briefing"}
          />
        )}

        <div>
          <h2 className="mb-3 text-sm font-semibold tracking-tight text-ink-800">
            {t.video.variants}
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {variants.length === 0 ? (
              <div className="col-span-full rounded-sm border border-dashed border-ink-200 p-6 text-center text-sm text-ink-400">
                {busy ? "Generating…" : `${t.video.generate} →`}
              </div>
            ) : (
              variants.map((v, idx) => (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => setActiveId(v.id)}
                  className={
                    activeId === v.id
                      ? "overflow-hidden rounded-sm border-2 border-accent bg-ink-100 text-start"
                      : "overflow-hidden rounded-sm border border-ink-200 bg-ink-100 text-start"
                  }
                >
                  <svg
                    viewBox="0 0 320 180"
                    className="block aspect-video w-full"
                    style={{ backgroundColor: STYLE_TINT[v.style] }}
                    aria-hidden
                  >
                    <rect width="320" height="180" fill={STYLE_TINT[v.style]} />
                    <rect x="0" y="0" width="320" height="180" fill="rgba(255,255,255,0.04)" />
                    <rect x={18} y={130} width={64} height={4} fill="oklch(0.58 0.07 250)" rx={2} />
                    {[28, 24, 18].map((w, i) => (
                      <rect
                        key={i}
                        x={18}
                        y={144 + i * 8}
                        width={w * 4}
                        height={3}
                        fill="rgba(255,255,255,0.55)"
                        rx={1}
                      />
                    ))}
                    {[14, 24, 52, 6].map((val, i) => (
                      <rect
                        key={i}
                        x={170 + i * 28}
                        y={130 - val}
                        width={20}
                        height={val}
                        fill="oklch(0.58 0.07 250)"
                        opacity={0.6 + idx * 0.08}
                      />
                    ))}
                  </svg>
                  <div className="p-2">
                    <div className="text-xs font-medium text-ink-800">{v.style}</div>
                    <div className="line-clamp-2 text-[11px] text-ink-500">{v.title}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-sm border border-ink-200 bg-ink-100 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-ink-800">{t.video.script}</h2>
            {active && (
              <span
                className={
                  active.confidence === "high"
                    ? "rounded-xs bg-signal-ok/15 px-2 py-0.5 text-[11px] uppercase text-signal-ok"
                    : active.confidence === "med"
                      ? "rounded-xs bg-signal-warn/15 px-2 py-0.5 text-[11px] uppercase text-signal-warn"
                      : "rounded-xs bg-signal-risk/15 px-2 py-0.5 text-[11px] uppercase text-signal-risk"
                }
              >
                confidence: {active.confidence}
              </span>
            )}
          </div>

          {!active ? (
            <div className="mt-4 text-sm text-ink-500">
              Configure the brief, then generate. Real Claude script when ANTHROPIC_API_KEY is set;
              mock variants otherwise.
            </div>
          ) : (
            <>
              <div className="mt-3 rounded-sm bg-ink-50 px-3 py-2 text-sm italic text-ink-700">
                {active.hook}
              </div>
              <ol className="mt-4 space-y-3 text-sm text-ink-700">
                {active.scenes.map((s) => (
                  <li key={s.index} className="border-s-2 border-accent/60 ps-3">
                    <div className="flex items-baseline justify-between gap-2 text-[11px] font-mono text-ink-400">
                      <span>
                        scene {s.index + 1} · {fmt(s.startSec)}–{fmt(s.endSec)}
                      </span>
                      {s.source && <span className="text-ink-500">{s.source}</span>}
                    </div>
                    <div className="mt-0.5 text-ink-800">{s.narration}</div>
                    <div className="mt-1 text-[11px] text-ink-500">
                      <span className="font-medium">visual:</span> {s.visual}
                      {s.onScreenText && (
                        <>
                          {" · "}
                          <span className="font-medium">overlay:</span> "{s.onScreenText}"
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              {active.citations.length > 0 && (
                <div className="mt-4 border-t border-ink-100 pt-3 text-[11px] text-ink-500">
                  Sources: {active.citations.join(" · ")}
                </div>
              )}
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="rounded-sm border border-ink-200 bg-ink-100 px-3 py-1.5 text-xs text-ink-700 hover:border-ink-400 disabled:opacity-50"
            >
              {t.video.regenerate}
            </button>
            {active && (
              <>
                <button
                  type="button"
                  onClick={() => downloadStoryboard(active)}
                  disabled={busy}
                  className="rounded-sm border border-ink-200 bg-ink-100 px-3 py-1.5 text-xs text-ink-700 hover:border-ink-400 disabled:opacity-50"
                >
                  Storyboard PDF
                </button>
                <button
                  type="button"
                  onClick={() => downloadSrt(active)}
                  disabled={busy}
                  className="rounded-sm border border-ink-200 bg-ink-100 px-3 py-1.5 text-xs text-ink-700 hover:border-ink-400 disabled:opacity-50"
                >
                  Subtitles SRT
                </button>
                <button
                  type="button"
                  onClick={() => downloadManifest(active)}
                  disabled={busy}
                  className="rounded-sm border border-ink-200 bg-ink-100 px-3 py-1.5 text-xs text-ink-700 hover:border-ink-400 disabled:opacity-50"
                >
                  Render manifest JSON
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() =>
                push({
                  kind: "info",
                  title: "Render queued",
                  detail: "MP4 render via Remotion deferred — TODO-018",
                })
              }
              className="rounded-sm bg-accent px-3 py-1.5 text-xs text-white"
            >
              {t.video.publish}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
