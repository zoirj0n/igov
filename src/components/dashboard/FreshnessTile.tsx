"use client";

import { Modal } from "@/components/shared/Modal";
import { hasRole, useAuthedUser } from "@/lib/auth/client";
import { useToast } from "@/lib/hooks/useToast";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Totals {
  authoritative: number;
  user: number;
  seed: number;
}

interface PerCountry {
  iso3: string;
  total: number;
  authoritative: number;
  user: number;
  seed: number;
}

interface RunHistoryEntry {
  finishedAt: string;
  durationMs: number;
  rowsUpserted: number;
  errors: number;
  outcome: "ok" | "error";
}

interface RunnerStatus {
  key: string;
  source: string;
  status: "idle" | "running" | "ok" | "error";
  freshness: string;
  lastFinishedAt: string | null;
  lastStartedAt: string | null;
  lastDurationMs: number;
  lastRows: number;
  lastErrors: number;
  errorSample: string[];
  history: RunHistoryEntry[];
}

interface FreshnessResp {
  totals: Totals;
  countries: number;
  grandTotal: number;
  perCountry: PerCountry[];
  runners: RunnerStatus[];
}

export function FreshnessTile() {
  const [data, setData] = useState<FreshnessResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drillRunner, setDrillRunner] = useState<RunnerStatus | null>(null);
  const { user } = useAuthedUser();
  const { push } = useToast();
  const canRun = hasRole(user, "admin");

  function load(): Promise<void> {
    return fetch("/api/insights/freshness")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${r.status}`);
        setData(d as FreshnessResp);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }

  async function runRunner(key: string, force: boolean): Promise<void> {
    push({ kind: "info", title: `Running ${key}`, detail: force ? "force=true" : "stale-only" });
    try {
      const res = await fetch("/api/admin/ingest/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: key, force }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      push({
        kind: body.errors?.length > 0 && body.rowsUpserted === 0 ? "warn" : "success",
        title: `${key} done`,
        detail: `${body.rowsUpserted} rows · ${body.errors?.length ?? 0} errors · ${body.durationMs}ms`,
      });
      await load();
      setDrillRunner((cur) => (cur && cur.key === key ? null : cur));
    } catch (e) {
      push({
        kind: "error",
        title: `${key} failed`,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/insights/freshness")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${r.status}`);
        return d as FreshnessResp;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) {
    return <div className="card p-4 text-xs text-signal-risk">freshness load failed: {err}</div>;
  }
  if (!data) {
    return (
      <div className="card animate-pulse p-4 text-xs text-ink-400">Loading data freshness…</div>
    );
  }

  const t = data.grandTotal || 1;
  const pct = {
    authoritative: (data.totals.authoritative / t) * 100,
    user: (data.totals.user / t) * 100,
    seed: (data.totals.seed / t) * 100,
  };

  const worstFive = [...data.perCountry]
    .filter((c) => c.total > 0)
    .sort((a, b) => a.authoritative / a.total - b.authoritative / b.total)
    .slice(0, 5);

  return (
    <>
      <div className="card p-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">
              Data freshness
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tighter text-ink-800">
              {Math.round(pct.authoritative)}%
              <span className="ms-1 text-xs font-normal text-ink-500">official coverage</span>
            </div>
          </div>
          <div className="text-end font-mono text-2xs text-ink-400">
            {data.grandTotal} indicators · {data.countries} countries
          </div>
        </div>

        <div className="flex h-2 overflow-hidden rounded-xs bg-ink-100">
          {pct.authoritative > 0 && (
            <div
              className="h-full bg-signal-ok"
              style={{ width: `${pct.authoritative}%` }}
              title={`${data.totals.authoritative} official`}
            />
          )}
          {pct.user > 0 && (
            <div
              className="h-full bg-accent"
              style={{ width: `${pct.user}%` }}
              title={`${data.totals.user} user`}
            />
          )}
          {pct.seed > 0 && (
            <div
              className="h-full bg-ink-300"
              style={{ width: `${pct.seed}%` }}
              title={`${data.totals.seed} seed`}
            />
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-3 text-2xs text-ink-600">
          <Legend dot="bg-signal-ok" label="Official" n={data.totals.authoritative} />
          <Legend dot="bg-accent" label="User" n={data.totals.user} />
          <Legend dot="bg-ink-300" label="Seed" n={data.totals.seed} />
        </div>

        {data.runners.length > 0 && (
          <div className="mt-4 border-t border-ink-100 pt-3">
            <div className="mb-2 text-2xs font-medium uppercase tracking-wide text-ink-500">
              Ingest runners
            </div>
            <ul className="space-y-1">
              {data.runners.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => setDrillRunner(r)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs transition hover:bg-ink-150"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          r.status === "ok"
                            ? "bg-signal-ok"
                            : r.status === "error"
                              ? "bg-signal-risk"
                              : r.status === "running"
                                ? "bg-signal-warn animate-pulse"
                                : "bg-ink-300"
                        }`}
                        aria-hidden
                      />
                      <span className="font-mono font-medium text-ink-700">{r.key}</span>
                      {r.lastErrors > 0 && (
                        <span
                          className="chip chip-warn text-2xs"
                          title={`${r.lastErrors} errors in last run`}
                        >
                          {r.lastErrors}!
                        </span>
                      )}
                    </span>
                    <span
                      className="font-mono text-2xs text-ink-500"
                      title={r.lastFinishedAt ?? "never run"}
                    >
                      {r.lastRows ? `${r.lastRows}r · ` : ""}
                      {r.freshness}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {worstFive.length > 0 && (
          <div className="mt-4 border-t border-ink-100 pt-3">
            <div className="mb-2 text-2xs font-medium uppercase tracking-wide text-ink-500">
              Lowest official coverage
            </div>
            <ul className="space-y-1.5">
              {worstFive.map((c) => {
                const opct = Math.round((c.authoritative / c.total) * 100);
                return (
                  <li key={c.iso3} className="flex items-center justify-between gap-2 text-xs">
                    <Link
                      href={`/country/${c.iso3}`}
                      className="font-mono font-medium text-ink-700 hover:text-accent"
                    >
                      {c.iso3}
                    </Link>
                    <div className="flex flex-1 items-center gap-2">
                      <div className="flex h-1 flex-1 overflow-hidden rounded-xs bg-ink-100">
                        <div className="h-full bg-signal-ok" style={{ width: `${opct}%` }} />
                      </div>
                      <span className="w-10 text-end font-mono text-2xs text-ink-500">{opct}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {drillRunner && (
        <RunnerDrillModal
          runner={drillRunner}
          onClose={() => setDrillRunner(null)}
          canRun={canRun}
          onRun={(force) => runRunner(drillRunner.key, force)}
        />
      )}
    </>
  );
}

function RunnerDrillModal({
  runner,
  onClose,
  canRun,
  onRun,
}: {
  runner: RunnerStatus;
  onClose: () => void;
  canRun: boolean;
  onRun: (force: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function trigger(force: boolean): Promise<void> {
    setBusy(true);
    try {
      await onRun(force);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={true} onClose={onClose} title={`Runner: ${runner.key}`} width="md">
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source" value={runner.source} />
          <Field label="Status" value={runner.status} />
          <Field label="Last started" value={runner.lastStartedAt ?? "never"} mono />
          <Field label="Last finished" value={runner.lastFinishedAt ?? "never"} mono />
          <Field label="Duration" value={`${runner.lastDurationMs} ms`} mono />
          <Field label="Rows upserted" value={String(runner.lastRows)} mono />
        </div>
        {runner.history.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-2xs">
              <span className="font-medium uppercase tracking-wide text-ink-500">
                Last {runner.history.length} runs
              </span>
              <span className="font-mono text-ink-400">
                avg{" "}
                {Math.round(
                  runner.history.reduce((s, h) => s + h.durationMs, 0) / runner.history.length,
                )}
                ms
              </span>
            </div>
            <RunSparkline history={runner.history} />
          </div>
        )}

        {runner.errorSample.length > 0 && (
          <div>
            <div className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-ink-500">
              Last errors ({runner.lastErrors} total, showing {runner.errorSample.length})
            </div>
            <ul className="space-y-1 rounded-md bg-ink-50 p-2 font-mono text-2xs text-ink-700">
              {runner.errorSample.map((e, i) => (
                <li key={i} className="break-words">
                  · {e}
                </li>
              ))}
            </ul>
          </div>
        )}
        {canRun && (
          <div className="flex items-center justify-end gap-2 border-t border-ink-100 pt-3">
            <span className="me-auto text-2xs text-ink-500">Admin actions</span>
            <button
              type="button"
              onClick={() => trigger(false)}
              disabled={busy}
              className="btn-ghost text-xs disabled:opacity-40"
              title="Skip if last run <24h"
            >
              Run if stale
            </button>
            <button
              type="button"
              onClick={() => trigger(true)}
              disabled={busy}
              className="btn-primary text-xs disabled:opacity-40"
              title="Re-fetch and re-upsert regardless of freshness"
            >
              {busy ? "Running…" : "Force run"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function RunSparkline({ history }: { history: RunHistoryEntry[] }) {
  const W = 280;
  const H = 36;
  const PAD = 2;
  const maxDur = Math.max(...history.map((h) => h.durationMs), 1);
  const step = history.length > 1 ? (W - PAD * 2) / (history.length - 1) : 0;
  const points = history.map((h, i) => {
    const x = PAD + i * step;
    const y = H - PAD - (h.durationMs / maxDur) * (H - PAD * 2);
    return { x, y, h };
  });
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="overflow-visible"
    >
      <title>Duration trend across last {history.length} runs</title>
      {path && <path d={path} stroke="rgb(99 102 241 / 0.6)" strokeWidth={1.5} fill="none" />}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={2.5}
          className={p.h.outcome === "error" ? "fill-signal-risk" : "fill-signal-ok"}
        >
          <title>
            {new Date(p.h.finishedAt).toLocaleString()} · {p.h.durationMs}ms · {p.h.rowsUpserted}{" "}
            rows
            {p.h.errors > 0 ? ` · ${p.h.errors} errors` : ""}
          </title>
        </circle>
      ))}
    </svg>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">{label}</div>
      <div className={`mt-0.5 ${mono ? "font-mono text-ink-700" : "text-ink-800"}`}>{value}</div>
    </div>
  );
}

function Legend({ dot, label, n }: { dot: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      <span className="font-medium text-ink-700">{label}</span>
      <span className="font-mono text-ink-400">{n}</span>
    </span>
  );
}
