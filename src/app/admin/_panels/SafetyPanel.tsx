"use client";

import { useToast } from "@/lib/hooks/useToast";
import { Fragment, useEffect, useState } from "react";

interface SafetyEvent {
  id: string;
  ts: string;
  actor: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  classification?: string;
  ip?: string;
  meta?: Record<string, unknown>;
}

interface FlaggedActor {
  actor: string;
  countInWindow: number;
  lastEventAt: string;
  lastAlertAt?: string;
  flagged: boolean;
}

export function SafetyPanel() {
  const { push } = useToast();
  const [events, setEvents] = useState<SafetyEvent[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [flaggedActors, setFlaggedActors] = useState<FlaggedActor[]>([]);
  const [anomalyConfig, setAnomalyConfig] = useState<{
    windowMs: number;
    threshold: number;
    cooldownMs: number;
  } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);

  function load(): void {
    setLoading(true);
    const url = filter
      ? `/api/admin/safety?action=${encodeURIComponent(filter)}`
      : "/api/admin/safety";
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(
        (d: {
          events?: SafetyEvent[];
          totalsByAction?: Record<string, number>;
          flaggedActors?: FlaggedActor[];
          anomalyConfig?: { windowMs: number; threshold: number; cooldownMs: number };
        }) => {
          setEvents(d.events ?? []);
          setTotals(d.totalsByAction ?? {});
          setFlaggedActors(d.flaggedActors ?? []);
          setAnomalyConfig(d.anomalyConfig ?? null);
        },
      )
      .catch((e) =>
        push({
          kind: "error",
          title: "Load failed",
          detail: e instanceof Error ? e.message : String(e),
        }),
      )
      .finally(() => setLoading(false));
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: load is stable in this component
  useEffect(load, [filter]);

  function shortAction(a: string): string {
    return a.replace(/^rag\.safety\./, "").replace(/_/g, " ");
  }
  function actionColor(a: string): string {
    if (a === "security.anomaly.threshold") return "bg-signal-risk/20 text-signal-risk font-bold";
    if (a.endsWith("injection_blocked") || a.endsWith("cloud_class_block"))
      return "bg-signal-warn/15 text-signal-warn";
    if (a.endsWith("pii_redacted")) return "bg-accent/15 text-accent";
    if (a.endsWith("echo_detected") || a.endsWith("denied") || a.endsWith("elevated"))
      return "bg-signal-risk/15 text-signal-risk";
    return "bg-ink-100 text-ink-700";
  }

  const flaggedCount = flaggedActors.filter((a) => a.flagged).length;
  const inWindowCount = flaggedActors.length;

  return (
    <div className="space-y-6">
      {flaggedCount > 0 && (
        <section className="card border-signal-risk/40 bg-signal-risk/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-xs bg-signal-risk/20 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-signal-risk">
                  Anomaly
                </span>
                <span className="text-sm font-medium text-ink-800">
                  {flaggedCount} actor(s) flagged ·{" "}
                  {anomalyConfig
                    ? `≥${anomalyConfig.threshold} safety events in ${Math.round(anomalyConfig.windowMs / 60_000)}min`
                    : ""}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {flaggedActors
                  .filter((a) => a.flagged)
                  .map((a) => (
                    <li key={a.actor} className="font-mono">
                      <span className="text-signal-risk">●</span>{" "}
                      <strong className="text-ink-800">{a.actor}</strong>{" "}
                      <span className="text-ink-600">— {a.countInWindow} events</span>{" "}
                      <span className="text-ink-400">
                        last {new Date(a.lastEventAt).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="section-title">Safety event stream</h2>
            <p className="mt-1 text-xs text-ink-500">
              Live view of injection-blocks, PII redactions, classification denials, cloud-class
              blocks. Sourced from in-memory ring +{" "}
              <code className="rounded-xs bg-ink-100 px-1 font-mono">logs/audit.jsonl</code>.
              {inWindowCount > 0 && (
                <span className="ms-2 text-ink-400">
                  · {inWindowCount} actor(s) active in window
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="btn-ghost text-xs disabled:opacity-50"
          >
            {loading ? "…" : "↻ Reload"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {Object.entries(totals).map(([action, count]) => (
            <button
              key={action}
              type="button"
              onClick={() => setFilter(filter === action ? "" : action)}
              className={`rounded-md border px-2 py-1.5 text-start text-xs transition ${
                filter === action
                  ? "border-accent bg-accent/5 shadow-pop"
                  : "border-ink-150 bg-ink-100 hover:border-ink-300"
              }`}
            >
              <div className="font-mono text-2xs text-ink-500">{shortAction(action)}</div>
              <div className="mt-0.5 tabular text-base font-semibold text-ink-800">{count}</div>
            </button>
          ))}
          {Object.keys(totals).length === 0 && (
            <div className="col-span-full text-2xs text-ink-400">
              No safety events recorded yet.
            </div>
          )}
        </div>
        {filter && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-xs bg-ink-100 px-2 py-1 text-2xs">
            <span>filtered:</span>
            <span className="font-mono">{filter}</span>
            <button
              type="button"
              onClick={() => setFilter("")}
              className="text-accent hover:underline"
            >
              ×
            </button>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-3">
          <h2 className="section-title">Events ({events.length})</h2>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-ink-50/60">
            <tr className="border-b border-ink-100 text-2xs font-medium uppercase tracking-wide text-ink-500">
              <th className="px-3 py-2 text-start">Time</th>
              <th className="px-3 py-2 text-start">Action</th>
              <th className="px-3 py-2 text-start">Actor</th>
              <th className="px-3 py-2 text-start">Class</th>
              <th className="px-3 py-2 text-start">Session</th>
              <th className="px-3 py-2 text-start">Detail</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-ink-400">
                  No matching events.
                </td>
              </tr>
            )}
            {events.map((ev) => {
              const isOpen = expandedId === ev.id;
              const detail = summarizeMeta(ev);
              return (
                <Fragment key={ev.id}>
                  <tr
                    className="cursor-pointer border-b border-ink-100 last:border-0 hover:bg-ink-150"
                    onClick={() => setExpandedId(isOpen ? null : ev.id)}
                  >
                    <td className="px-3 py-2 font-mono text-2xs text-ink-500">
                      {new Date(ev.ts).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-xs px-1.5 py-0.5 text-2xs font-medium uppercase ${actionColor(ev.action)}`}
                      >
                        {shortAction(ev.action)}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-2xs text-ink-700">{ev.actor}</td>
                    <td className="px-3 py-2 font-mono text-2xs text-ink-700">
                      {ev.classification ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-2xs text-ink-500">
                      {ev.resourceId ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-2xs text-ink-700">{detail}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-ink-100 bg-ink-50/40">
                      <td colSpan={6} className="px-3 py-3 font-mono text-2xs text-ink-700">
                        <pre className="overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(ev, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function summarizeMeta(ev: SafetyEvent): string {
  const meta = ev.meta ?? {};
  if (ev.action === "rag.safety.injection_blocked") {
    const patterns = Array.isArray(meta.patterns) ? (meta.patterns as string[]).join(", ") : "?";
    return `patterns: ${patterns}`;
  }
  if (ev.action === "rag.safety.pii_redacted") {
    const kinds = Array.isArray(meta.kinds)
      ? (meta.kinds as { kind: string; count: number }[])
          .map((k) => `${k.kind}×${k.count}`)
          .join(", ")
      : "?";
    return `redactions: ${kinds}`;
  }
  if (ev.action.endsWith("cloud_class_block")) {
    return `provider=${(meta.provider as string) ?? "?"} class=${(meta.classification as string) ?? "?"}`;
  }
  if (ev.action.endsWith("denied")) {
    return (meta.reason as string) ?? "denied";
  }
  if (ev.action === "security.anomaly.threshold") {
    return `${meta.count}× ${meta.triggeringAction ?? "events"} in ${Math.round(((meta.windowMs as number) ?? 0) / 60_000)}min`;
  }
  return Object.keys(meta).slice(0, 3).join(", ");
}
