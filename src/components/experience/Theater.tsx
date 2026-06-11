"use client";

import { Bento } from "@/components/experience/Bento";
import { lastDetail, looksDegraded, notesFor, statusFor } from "@/lib/experience/trace";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";
import { useEffect, useState } from "react";

const STEP_KEYS = [
  "scope",
  "research",
  "counterpart",
  "analyse",
  "opportunities",
  "briefing",
] as const;

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function Theater({
  state,
  error,
  running,
  countryLabel,
  onRetry,
  onBack,
}: {
  state: AgentState | null;
  error: string | null;
  running: boolean;
  countryLabel: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const x = t.experience;
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const activeKey = STEP_KEYS.find((k) => statusFor(state, k) === "start");
  const activeNote = activeKey
    ? (notesFor(state, activeKey).at(-1) ?? lastDetail(state, activeKey))
    : undefined;
  const toolSteps = state?.researchSteps ?? [];

  const chipCls = (status: string) =>
    `flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-2xs font-semibold transition ${
      status === "done"
        ? "border-accent/60 text-tamm-cyan"
        : status === "start"
          ? "animate-pulse border-tamm-cyan bg-tamm-cyan/10 text-tamm-cyan"
          : status === "error"
            ? "border-signal-risk/60 text-signal-risk"
            : "border-ink-200 text-ink-400"
    }`;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          {running && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tamm-cyan opacity-75" />
          )}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
        <span className="text-sm font-semibold text-ink-900">{running ? x.working : x.ready}</span>
        <span className="text-sm text-ink-500">{countryLabel}</span>
        <span className="ms-auto font-mono text-xs text-ink-500">{mmss(now - startedAt)}</span>
      </div>

      <fieldset className="mb-2 border-0 p-0">
        <legend className="sr-only">{x.working}</legend>
        <div className="flex flex-wrap gap-2">
          {STEP_KEYS.map((k) => {
            const st = statusFor(state, k);
            return (
              <span key={k} className={chipCls(st)}>
                {st === "done" ? "✓" : st === "error" ? "✕" : st === "start" ? "●" : "○"}{" "}
                {x.steps[k]}
              </span>
            );
          })}
        </div>
      </fieldset>

      <p aria-live="polite" className="mb-4 min-h-5 truncate font-mono text-2xs text-ink-500">
        {activeNote ?? ""}
      </p>

      {looksDegraded(state) && (
        <output className="mb-4 block rounded-md border border-signal-warn/50 bg-signal-warn/10 px-3 py-2 text-xs text-tamm-olive">
          ⚠ {x.degraded}
        </output>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-signal-risk/40 bg-signal-risk/5 p-4 text-sm text-signal-risk"
        >
          <p>{error}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md bg-accent-strong px-3 py-1.5 text-xs font-semibold text-ink-900"
            >
              {x.retry}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded-md border border-ink-200 px-3 py-1.5 text-xs text-ink-600"
            >
              {x.back}
            </button>
          </div>
        </div>
      )}

      <Bento state={state} mode="assembling" />

      <details className="mt-4 rounded-md border border-ink-200 bg-ink-100/70 px-4 py-2.5">
        <summary className="cursor-pointer font-mono text-2xs text-ink-500">
          {x.toolFeed} ({toolSteps.length})
          {toolSteps.length > 0 && (
            <span className="ms-2 text-tamm-cyan">
              tool · {toolSteps[toolSteps.length - 1]?.tool}
            </span>
          )}
        </summary>
        <ul className="mt-2 space-y-1">
          {toolSteps.map((s, i) => (
            <li key={`${s.tool}-${s.input}-${i}`} className="font-mono text-2xs text-ink-500">
              <span className="text-tamm-cyan">tool</span> · {s.tool}{" "}
              <span className="text-ink-400">{s.input}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
