"use client";

import { AppShell } from "@/components/shell/AppShell";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useTablistKeys } from "@/lib/hooks/useTablistKeys";
import { useToast } from "@/lib/hooks/useToast";
import { useI18n } from "@/lib/i18n/context";
import dynamic from "next/dynamic";
import { Fragment, useEffect, useState } from "react";

const CostPanel = dynamic(() => import("./_panels/CostPanel").then((m) => m.CostPanel), {
  ssr: false,
  loading: () => <div className="card p-6 text-sm text-ink-500">Loading cost panel…</div>,
});

const SafetyPanel = dynamic(() => import("./_panels/SafetyPanel").then((m) => m.SafetyPanel), {
  ssr: false,
  loading: () => <div className="card p-6 text-sm text-ink-500">Loading safety panel…</div>,
});

const RagPanel = dynamic(() => import("./_panels/RagPanel").then((m) => m.RagPanel), {
  ssr: false,
  loading: () => <div className="card p-6 text-sm text-ink-500">Loading RAG panel…</div>,
});

const LlmProviderPanel = dynamic(
  () => import("./_panels/LlmProviderPanel").then((m) => m.LlmProviderPanel),
  {
    ssr: false,
    loading: () => <div className="card p-6 text-sm text-ink-500">Loading LLM panel…</div>,
  },
);

const UsersPanel = dynamic(() => import("./_panels/UsersPanel").then((m) => m.UsersPanel), {
  ssr: false,
  loading: () => <div className="card p-6 text-sm text-ink-500">Loading users…</div>,
});

const OrgPolicyPanel = dynamic(
  () => import("./_panels/OrgPolicyPanel").then((m) => m.OrgPolicyPanel),
  {
    ssr: false,
    loading: () => <div className="card p-6 text-sm text-ink-500">Loading org policy…</div>,
  },
);

interface LiveAuditEvent {
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

interface SourceStatus {
  key: "worldbank" | "imf" | "ember" | "oecd";
  source: string;
  status: "idle" | "running" | "ok" | "error";
  freshness: string;
  lastRun?: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    rowsUpserted: number;
    errors: string[];
  };
}

type Tab = "users" | "sources" | "audit" | "health" | "llm" | "org" | "rag" | "safety" | "cost";

const _SOURCES = [
  {
    name: "World Bank Open Data",
    status: "ok",
    freshness: "12 min",
    rows: 14,
    last: "2026-05-22 02:48",
  },
  {
    name: "IRENA Statistics",
    status: "ok",
    freshness: "1h 22m",
    rows: 9,
    last: "2026-05-22 01:33",
  },
  { name: "IMF Data", status: "warn", freshness: "26h", rows: 3, last: "2026-05-21 00:14" },
  {
    name: "IEA Data and statistics",
    status: "err",
    freshness: "stale",
    rows: 0,
    last: "missing key",
  },
  { name: "UN Comtrade", status: "ok", freshness: "8h", rows: 22, last: "2026-05-21 19:00" },
];

const _AUDIT = [
  {
    actor: "analyst.a",
    action: "briefing.generate",
    resource: "DEU/brf_002",
    at: "2026-05-22 02:42",
  },
  { actor: "analyst.b", action: "login", resource: "session=anon-x9...", at: "2026-05-22 02:21" },
  {
    actor: "scheduler",
    action: "ingest.run",
    resource: "worldbank/2026-05-22",
    at: "2026-05-22 02:00",
  },
  { actor: "lead", action: "briefing.export.pdf", resource: "IND/brf_003", at: "2026-05-21 23:14" },
  {
    actor: "admin",
    action: "user.role.change",
    resource: "u3 analyst→analyst",
    at: "2026-05-21 18:00",
  },
];

const HEALTH = [
  { svc: "web (Next.js)", status: "ok", value: "p95 240ms", detail: "200 OK · 10 routes" },
  { svc: "api (Next routes)", status: "ok", value: "p95 180ms", detail: "4 endpoints" },
  { svc: "postgres", status: "warn", value: "connect ✕", detail: "DB not started locally" },
  { svc: "redis", status: "warn", value: "connect ✕", detail: "Not started" },
  { svc: "opensearch", status: "warn", value: "connect ✕", detail: "Not started" },
  {
    svc: "Anthropic SDK",
    status: "ok",
    value: "ready",
    detail: "ANTHROPIC_API_KEY present (or mock)",
  },
];

const badge: Record<string, string> = {
  ok: "bg-signal-ok/15 text-signal-ok",
  warn: "bg-signal-warn/15 text-signal-warn",
  err: "bg-signal-risk/15 text-signal-risk",
};

const VALID_TABS: Tab[] = [
  "users",
  "sources",
  "audit",
  "health",
  "llm",
  "org",
  "rag",
  "safety",
  "cost",
];

function tabFromHash(): Tab {
  if (typeof window === "undefined") return "users";
  const h = window.location.hash.replace(/^#/, "");
  return (VALID_TABS as string[]).includes(h) ? (h as Tab) : "users";
}

export default function AdminPage() {
  useDocumentTitle("Admin");
  const { t } = useI18n();
  const { push } = useToast();
  const [tab, setTabState] = useState<Tab>("users");

  // Sync tab to URL hash so refresh/back/forward stay on the right panel.
  useEffect(() => {
    setTabState(tabFromHash());
    const onHash = (): void => setTabState(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function setTab(next: Tab): void {
    setTabState(next);
    if (typeof window !== "undefined" && window.location.hash.replace(/^#/, "") !== next) {
      // Replace state so we don't pollute browser history on every tab click.
      const url = `${window.location.pathname}${window.location.search}#${next}`;
      window.history.replaceState(null, "", url);
    }
  }
  const [liveAudit, setLiveAudit] = useState<LiveAuditEvent[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [sources, setSources] = useState<SourceStatus[] | null>(null);
  const [liveIndicators, setLiveIndicators] = useState<number>(0);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  const [dbStatus, setDbStatus] = useState<{
    enabled: boolean;
    ok?: boolean;
    latencyMs?: number;
    error?: string;
    reason?: string;
    message?: string;
  } | null>(null);
  const [runningSource, setRunningSource] = useState<string | null>(null);

  async function loadSources(): Promise<void> {
    setSourcesError(null);
    try {
      const res = await fetch("/api/admin/ingest/status");
      const data = await res.json();
      if (!res.ok)
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      setSources(data.sources as SourceStatus[]);
      setLiveIndicators(typeof data.liveIndicators === "number" ? data.liveIndicators : 0);
    } catch (err) {
      setSourcesError(err instanceof Error ? err.message : String(err));
    }
  }

  async function runIngest(source: string): Promise<void> {
    setRunningSource(source);
    push({ kind: "info", title: "Ingest started", detail: `Pulling from ${source}…` });
    try {
      const res = await fetch("/api/admin/ingest/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      push({
        kind: "success",
        title: "Ingest complete",
        detail: `${data.rowsUpserted} rows upserted · ${data.durationMs}ms${data.errors?.length ? ` · ${data.errors.length} warnings` : ""}`,
      });
      await loadSources();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      push({ kind: "error", title: "Ingest failed", detail: msg });
    } finally {
      setRunningSource(null);
    }
  }

  useEffect(() => {
    if (tab !== "sources") return;
    void loadSources();
  }, [tab]);

  useEffect(() => {
    if (tab !== "health") return;
    let cancelled = false;
    fetch("/api/admin/db/status")
      .then(async (r) => (r.ok ? r.json() : { enabled: false, error: `HTTP ${r.status}` }))
      .then((d) => {
        if (!cancelled) setDbStatus(d);
      })
      .catch((err) => {
        if (!cancelled)
          setDbStatus({ enabled: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== "audit") return;
    let cancelled = false;
    setLiveAudit(null);
    setAuditError(null);
    fetch("/api/admin/audit")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok)
          throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${r.status}`);
        return data as { events: LiveAuditEvent[] };
      })
      .then((d) => {
        if (!cancelled) setLiveAudit(d.events);
      })
      .catch((err) => {
        if (!cancelled) setAuditError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tighter text-ink-800">{t.admin.title}</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Users · data sources · audit log · system health
          </p>
        </header>

        <div
          className="mb-6 inline-flex rounded-md border border-ink-150 bg-ink-100 p-0.5 text-xs shadow-card"
          role="tablist"
          aria-label="Admin sections"
          onKeyDown={useTablistKeys(VALID_TABS, tab, setTab)}
        >
          {(
            [
              { k: "users" as const, label: t.admin.users },
              { k: "sources" as const, label: t.admin.sources },
              { k: "audit" as const, label: t.admin.audit },
              { k: "health" as const, label: t.admin.health },
              { k: "llm" as const, label: "AI Provider" },
              { k: "org" as const, label: "Org Policy" },
              { k: "rag" as const, label: "RAG" },
              { k: "safety" as const, label: "Safety" },
              { k: "cost" as const, label: "Cost" },
            ] as { k: Tab; label: string }[]
          ).map((tabDef) => (
            <button
              key={tabDef.k}
              data-tab={tabDef.k}
              role="tab"
              tabIndex={tab === tabDef.k ? 0 : -1}
              aria-selected={tab === tabDef.k}
              onClick={() => setTab(tabDef.k)}
              type="button"
              className={
                tab === tabDef.k
                  ? "rounded-sm bg-accent px-3.5 py-1.5 font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  : "rounded-sm px-3.5 py-1.5 text-ink-500 transition hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              }
            >
              {tabDef.label}
            </button>
          ))}
        </div>

        {tab === "users" && <UsersPanel />}

        {tab === "sources" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-ink-500">
                Live indicators in overlay:{" "}
                <span className="tabular font-medium text-ink-800">{liveIndicators}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runIngest("worldbank")}
                  disabled={runningSource !== null}
                  className="btn-primary text-xs"
                >
                  {runningSource === "worldbank" ? "Pulling World Bank…" : "Run World Bank"}
                </button>
                <button
                  type="button"
                  onClick={() => runIngest("imf")}
                  disabled={runningSource !== null}
                  className="btn-primary text-xs"
                >
                  {runningSource === "imf" ? "Pulling IMF…" : "Run IMF"}
                </button>
                <button
                  type="button"
                  onClick={() => runIngest("ember")}
                  disabled={runningSource !== null}
                  className="btn-primary text-xs"
                >
                  {runningSource === "ember" ? "Pulling Ember…" : "Run Ember"}
                </button>
                <button
                  type="button"
                  onClick={() => runIngest("oecd")}
                  disabled={runningSource !== null}
                  className="btn-primary text-xs"
                >
                  {runningSource === "oecd" ? "Pulling OECD…" : "Run OECD"}
                </button>
              </div>
            </div>
            {sourcesError && (
              <div className="rounded-md border border-signal-risk/30 bg-signal-risk/5 px-3 py-2 text-xs text-signal-risk">
                {sourcesError}
              </div>
            )}
            <div className="card overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-ink-50/60">
                  <tr className="border-b border-ink-100 text-2xs font-medium uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-2 text-start">Source</th>
                    <th className="px-4 py-2 text-start">Status</th>
                    <th className="px-4 py-2 text-start">Freshness</th>
                    <th className="px-4 py-2 text-end">Rows last run</th>
                    <th className="px-4 py-2 text-end">Duration</th>
                    <th className="px-4 py-2 text-start">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {sources === null && !sourcesError && (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 text-center text-xs text-ink-400">
                        {t.shell.loading}
                      </td>
                    </tr>
                  )}
                  {(sources ?? []).map((s) => (
                    <tr
                      key={s.source}
                      className="border-b border-ink-100 last:border-0 hover:bg-ink-150"
                    >
                      <td className="px-4 py-2 font-medium text-ink-800">{s.source}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-xs px-2 py-0.5 text-[11px] uppercase ${badge[s.status === "running" ? "warn" : s.status]}`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-ink-700">{s.freshness}</td>
                      <td className="px-4 py-2 text-end tabular text-ink-800">
                        {s.lastRun?.rowsUpserted ?? 0}
                      </td>
                      <td className="px-4 py-2 text-end tabular text-ink-600">
                        {s.lastRun ? `${s.lastRun.durationMs}ms` : "—"}
                      </td>
                      <td className="px-4 py-2 text-ink-500 text-xs">
                        {s.lastRun && s.lastRun.errors.length > 0 ? (
                          <span title={s.lastRun.errors.join("\n")}>
                            {s.lastRun.errors.length} warn
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-ink-200 bg-ink-50 px-4 py-2 text-[11px] text-ink-500">
                Live overlay sits on top of mock indicators. Restart of dev server clears overlay.
              </div>
            </div>
          </section>
        )}

        {tab === "audit" && (
          <section className="card overflow-hidden">
            {auditError && (
              <div className="border-b border-signal-risk/30 bg-signal-risk/10 px-4 py-2 text-xs text-signal-risk">
                {auditError}
              </div>
            )}
            <table className="min-w-full text-sm">
              <thead className="bg-ink-50">
                <tr className="border-b border-ink-100 text-2xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-2 text-start">Actor</th>
                  <th className="px-4 py-2 text-start">Action</th>
                  <th className="px-4 py-2 text-start">Resource</th>
                  <th className="px-4 py-2 text-start">Classification</th>
                  <th className="px-4 py-2 text-start">Time</th>
                </tr>
              </thead>
              <tbody>
                {liveAudit === null && !auditError && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-center text-xs text-ink-400">
                      {t.shell.loading}
                    </td>
                  </tr>
                )}
                {liveAudit && liveAudit.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-xs text-ink-400">
                      {t.shell.empty}
                    </td>
                  </tr>
                )}
                {(liveAudit ?? []).map((a) => (
                  <tr key={a.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-2 font-mono text-xs text-ink-700">
                      {a.actor}
                      {a.actorRole && <span className="ms-1 text-ink-400">· {a.actorRole}</span>}
                    </td>
                    <td className="px-4 py-2 text-ink-800">{a.action}</td>
                    <td className="px-4 py-2 font-mono text-xs text-ink-600">
                      {a.resourceType}
                      {a.resourceId ? `/${a.resourceId}` : ""}
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-500">{a.classification ?? "—"}</td>
                    <td className="px-4 py-2 text-ink-500 font-mono text-xs">
                      {new Date(a.ts).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-ink-200 bg-ink-50 px-4 py-2 text-[11px] text-ink-500">
              Live in-memory ring buffer (last 200 events) · persisted to logs/audit.jsonl ·
              TODO-005 SIEM-grade forwarding pending.
            </div>
          </section>
        )}

        {tab === "health" && (
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {HEALTH.filter((h) => h.svc !== "postgres").map((h) => (
              <div key={h.svc} className="rounded-sm border border-ink-200 bg-ink-100 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-ink-800">{h.svc}</div>
                  <span
                    className={`rounded-xs px-2 py-0.5 text-[11px] uppercase ${badge[h.status]}`}
                  >
                    {h.status}
                  </span>
                </div>
                <div className="mt-2 tabular text-lg font-semibold text-ink-800">{h.value}</div>
                <div className="mt-1 text-xs text-ink-500">{h.detail}</div>
              </div>
            ))}
            <div className="rounded-sm border border-ink-200 bg-ink-100 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-ink-800">postgres</div>
                {dbStatus === null ? (
                  <span className="rounded-xs bg-ink-100 px-2 py-0.5 text-[11px] uppercase text-ink-500">
                    …
                  </span>
                ) : dbStatus.enabled && dbStatus.ok ? (
                  <span className={`rounded-xs px-2 py-0.5 text-[11px] uppercase ${badge.ok}`}>
                    ok
                  </span>
                ) : dbStatus.enabled ? (
                  <span className={`rounded-xs px-2 py-0.5 text-[11px] uppercase ${badge.err}`}>
                    err
                  </span>
                ) : (
                  <span className={`rounded-xs px-2 py-0.5 text-[11px] uppercase ${badge.warn}`}>
                    memory
                  </span>
                )}
              </div>
              <div className="mt-2 tabular text-lg font-semibold text-ink-800">
                {dbStatus === null
                  ? "…"
                  : dbStatus.enabled && dbStatus.ok
                    ? `${dbStatus.latencyMs}ms ping`
                    : dbStatus.enabled
                      ? "connect ✕"
                      : "in-memory mode"}
              </div>
              <div className="mt-1 text-xs text-ink-500">
                {dbStatus?.error ??
                  dbStatus?.reason ??
                  "Set USE_DB=1 + DATABASE_URL to enable Postgres."}
              </div>
            </div>
          </section>
        )}

        {tab === "llm" && <LlmProviderPanel />}

        {tab === "org" && <OrgPolicyPanel />}

        {tab === "rag" && <RagPanel />}

        {tab === "safety" && <SafetyPanel />}

        {tab === "cost" && <CostPanel />}
      </div>
    </AppShell>
  );
}
