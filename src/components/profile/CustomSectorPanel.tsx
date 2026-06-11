"use client";

import { useI18n } from "@/lib/i18n/context";
import { AiSummary } from "./AiSummary";

export interface SectorInsights {
  sector: string;
  summary: string;
  keyPoints: string[];
  opportunities: string[];
  risks: string[];
  stats: { label: string; value: string }[];
  citations: string[];
  confidence: "high" | "med" | "low";
}

export type SectorInsightsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: SectorInsights };

interface Props {
  label: string;
  state: SectorInsightsState;
  onRetry: () => void;
  onRemove: () => void;
}

/** Tab panel for a user-added sector, rendered from agentic research output. */
export function CustomSectorPanel({ label, state, onRetry, onRemove }: Props) {
  const { t } = useI18n();

  return (
    <div role="tabpanel" className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink-800">
          <span className="me-1.5 text-accent" aria-hidden>
            ✦
          </span>
          {label}
        </h2>
        <span className="rounded-xs bg-accent-subtle px-1.5 py-0.5 text-[11px] text-accent-strong">
          {t.profile.customNote}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="ms-auto rounded-md px-2.5 py-1 text-xs text-ink-400 transition hover:bg-signal-risk/10 hover:text-signal-risk"
        >
          ✕ {t.profile.removeTab}
        </button>
      </div>

      {state.status === "loading" && (
        <div className="card space-y-3 p-6" aria-live="polite">
          <p className="text-sm text-ink-500">{t.profile.researching}</p>
          {[88, 70, 55].map((w) => (
            <div key={w} className="shimmer h-3 rounded bg-ink-150" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div
          role="alert"
          className="rounded-sm border border-signal-risk/30 bg-signal-risk/10 p-6 text-sm text-signal-risk"
        >
          <p className="font-semibold">{t.profile.researchFailed}</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-strong"
          >
            {t.profile.retry}
          </button>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <AiSummary
            summary={state.data.summary}
            citations={state.data.citations}
            confidence={state.data.confidence}
          />

          {state.data.stats.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-semibold tracking-tight text-ink-800">
                {t.profile.keyFigures}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {state.data.stats.map((s) => (
                  <div key={s.label} className="card p-4">
                    <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">
                      {s.label}
                    </p>
                    <p className="mt-1.5 font-display text-xl font-bold tabular text-ink-900">
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {state.data.keyPoints.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-semibold tracking-tight text-ink-800">
                {t.profile.keyPoints}
              </h3>
              <ul className="card divide-y divide-ink-100">
                {state.data.keyPoints.map((p) => (
                  <li key={p} className="flex gap-2.5 px-5 py-3 text-sm text-ink-700">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      aria-hidden
                    />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {state.data.opportunities.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold tracking-tight text-signal-ok">
                  ↗ {t.profile.opportunities}
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-ink-700">
                  {state.data.opportunities.map((o) => (
                    <li key={o} className="flex gap-2.5">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-ok"
                        aria-hidden
                      />
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {state.data.risks.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold tracking-tight text-signal-risk">
                  ⚠ {t.profile.risks}
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-ink-700">
                  {state.data.risks.map((r) => (
                    <li key={r} className="flex gap-2.5">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-risk"
                        aria-hidden
                      />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
