"use client";

import { EmptyState } from "@/components/shared/EmptyState";
import { AppShell } from "@/components/shell/AppShell";
import { ACTIVITY, type Activity, type ActivityKind } from "@/lib/data/activity";
import { syncSearchParam } from "@/lib/hooks/syncSearchParam";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useI18n } from "@/lib/i18n/context";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

const ACTIVITY_KINDS: ActivityKind[] = ["briefing", "ingest", "ai", "user", "system"];

const kindBadge: Record<ActivityKind, string> = {
  briefing: "chip chip-info",
  ingest: "chip chip-ok",
  ai: "chip chip-warn",
  user: "chip chip-muted",
  system: "chip chip-muted",
};

const kindDot: Record<ActivityKind, string> = {
  briefing: "bg-accent",
  ingest: "bg-signal-ok",
  ai: "bg-signal-warn",
  user: "bg-ink-400",
  system: "bg-ink-300",
};

interface ImportRec {
  cacheKey: string;
  runner: string | null;
  rows: number;
  errors: number;
  errorSample: string[];
  skipped: boolean;
  bytes: number;
  reason: string;
  ts: string;
  actor: string;
}

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityPageInner />
    </Suspense>
  );
}

function ActivityPageInner() {
  useDocumentTitle("Activity");
  const { t } = useI18n();
  const sp = useSearchParams();
  const initialFilter = (() => {
    const v = sp?.get("filter");
    if (v === "all") return "all" as const;
    return (ACTIVITY_KINDS as string[]).includes(v ?? "") ? (v as ActivityKind) : "all";
  })();
  const [filter, setFilterState] = useState<"all" | ActivityKind>(initialFilter);
  const [query, setQueryState] = useState(sp?.get("q") ?? "");
  const [imports, setImports] = useState<ImportRec[]>([]);
  function setFilter(v: "all" | ActivityKind): void {
    setFilterState(v);
    syncSearchParam({ filter: v });
  }
  function setQuery(v: string): void {
    setQueryState(v);
    syncSearchParam({ q: v });
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sources/import/results")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { results?: Record<string, ImportRec> } | null) => {
        if (!d?.results || cancelled) return;
        setImports(Object.values(d.results));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const merged = useMemo<Activity[]>(() => {
    const ingestRows: Activity[] = imports.map((r) => ({
      id: `import-${r.cacheKey}-${r.ts}`,
      kind: "ingest",
      title: `Imported ${r.cacheKey}`,
      detail: r.skipped
        ? `Skipped · ${r.reason}`
        : `${r.runner ?? "none"} · ${r.rows} rows${r.errors ? ` · ${r.errors} skipped` : ""} · ${r.bytes}B`,
      actor: r.actor,
      ts: r.ts,
    }));
    return [...ingestRows, ...ACTIVITY].sort((a, b) => b.ts.localeCompare(a.ts));
  }, [imports]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged.filter((a) => {
      if (filter !== "all" && a.kind !== filter) return false;
      if (q) {
        const hay = `${a.title} ${a.detail} ${a.actor}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filter, merged, query]);

  const tabs: { key: "all" | ActivityKind; label: string }[] = [
    { key: "all", label: t.activity.filterAll },
    { key: "briefing", label: t.activity.filterBriefings },
    { key: "ingest", label: t.activity.filterIngest },
    { key: "ai", label: t.activity.filterAi },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tighter text-ink-800">
              {t.activity.title}
            </h1>
            <p className="mt-1.5 text-sm text-ink-500">{t.activity.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-md border border-ink-150 bg-ink-100 p-0.5 text-xs shadow-card">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={
                    filter === tab.key
                      ? "rounded-sm bg-accent px-3.5 py-1.5 font-medium text-white"
                      : "rounded-sm px-3.5 py-1.5 text-ink-500 transition hover:text-ink-800"
                  }
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search activity…"
              className="w-56 rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 text-xs shadow-card transition focus:border-accent focus:outline-none"
              aria-label="Search activity"
            />
          </div>
        </header>

        <div className="mb-4 flex items-center justify-between text-2xs text-ink-500">
          <span>
            {rows.length} of {merged.length} events
          </span>
          {(filter !== "all" || query) && (
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setQuery("");
              }}
              className="text-ink-500 transition hover:text-ink-800"
            >
              Clear filters
            </button>
          )}
        </div>

        {rows.length === 0 && (
          <EmptyState
            title="No events"
            detail={
              query
                ? `No events match "${query}".`
                : filter !== "all"
                  ? `No ${filter} events yet.`
                  : "Activity feed is empty."
            }
          />
        )}

        {rows.length > 0 && (
          <ol className="relative ms-2 space-y-4 border-s-2 border-ink-100 ps-6">
            {rows.map((a) => (
              <li key={a.id} className="relative">
                <span
                  className={
                    "absolute -start-[33px] top-2 grid h-4 w-4 place-items-center rounded-full bg-ink-100 ring-2 ring-ink-100"
                  }
                >
                  <span className={`h-2 w-2 rounded-full ${kindDot[a.kind]}`} aria-hidden />
                </span>
                <div className="card p-4 transition hover:shadow-pop">
                  <div className="flex items-start gap-3">
                    <span className={kindBadge[a.kind]}>{a.kind}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink-800">{a.title}</div>
                      <div className="mt-0.5 text-xs text-ink-500">{a.detail}</div>
                      <div className="mt-1.5 font-mono text-2xs text-ink-400">
                        {a.actor} · {new Date(a.ts).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </AppShell>
  );
}
