"use client";

import { useToast } from "@/lib/hooks/useToast";
import { useEffect, useState } from "react";

interface CostBucket {
  key: string;
  calls: number;
  costUsd: number;
  tokens?: number;
}
interface CostDayRow {
  day: string;
  calls: number;
  costUsd: number;
}

interface CostResp {
  sinceDays: number;
  totals: {
    calls: number;
    costUsd: number;
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
  };
  byActor: CostBucket[];
  byProvider: CostBucket[];
  byModel: CostBucket[];
  byStep: CostBucket[];
  byDepartment: CostBucket[];
  byClassification: CostBucket[];
  byDay: CostDayRow[];
  projection: {
    monthPrefix: string;
    monthToDate: number;
    activeDaysThisMonth: number;
    dayOfMonth: number;
    daysLeftInMonth: number;
    dailyAvgWindowUsd: number;
    projectedMonthEndUsd: number;
  };
  trend: {
    previousCostUsd: number;
    previousCalls: number;
    costDeltaPct: number | null;
    callsDeltaPct: number | null;
  };
}

interface BudgetResp {
  snapshot: {
    day: string;
    orgSpend: number;
    orgLimit: number;
    orgPercent: number;
    byActor: { actor: string; spend: number; limit: number; percent: number; alerted: boolean }[];
    byDept?: {
      deptId: string;
      deptName?: string;
      spend: number;
      limit: number;
      percent: number;
      alerted: boolean;
    }[];
  };
  config: { orgDaily: number; userDaily: number; enforceBlock: boolean };
}

export function CostPanel() {
  const { push } = useToast();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<CostResp | null>(null);
  const [budget, setBudget] = useState<BudgetResp | null>(null);
  const [loading, setLoading] = useState(false);

  function load(): void {
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/cost?days=${days}`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      ),
      fetch("/api/admin/budget")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([cost, bud]) => {
        setData(cost as CostResp);
        setBudget(bud as BudgetResp | null);
      })
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
  useEffect(load, [days]);

  function fmt(n: number): string {
    return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="section-title">LLM cost</h2>
            <p className="mt-1 text-xs text-ink-500">
              Aggregated from{" "}
              <code className="rounded-xs bg-ink-100 px-1 font-mono">logs/llm-calls.jsonl</code>.
              Real API calls only; mock fallbacks excluded.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-sm border border-ink-150 bg-ink-100 px-2 py-1 text-xs"
            >
              {[1, 7, 30, 90].map((d) => (
                <option key={d} value={d}>
                  last {d}d
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="btn-ghost text-xs disabled:opacity-50"
            >
              {loading ? "…" : "↻"}
            </button>
            <a
              href={`/api/admin/cost/csv?days=${days}`}
              className="btn-ghost text-xs"
              download
              title="Download CSV report (aggregated)"
            >
              ↓ CSV
            </a>
            <a
              href={`/api/admin/cost/csv?days=${days}&detail=true`}
              className="btn-ghost text-xs"
              download
              title="Download per-call detail CSV"
            >
              ↓ detail
            </a>
          </div>
        </div>
        {data && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CostTile
              label="Total cost"
              value={fmt(data.totals.costUsd)}
              trend={data.trend?.costDeltaPct ?? null}
            />
            <CostTile
              label="Calls"
              value={data.totals.calls.toLocaleString()}
              trend={data.trend?.callsDeltaPct ?? null}
            />
            <CostTile label="Prompt tokens" value={data.totals.promptTokens.toLocaleString()} />
            <CostTile
              label="Completion tokens"
              value={data.totals.completionTokens.toLocaleString()}
            />
          </div>
        )}
      </section>

      {data?.projection && (
        <section className="card p-5">
          <h2 className="section-title">Month projection · {data.projection.monthPrefix}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CostTile label="Month-to-date" value={fmt(data.projection.monthToDate)} />
            <CostTile label="Daily avg (window)" value={fmt(data.projection.dailyAvgWindowUsd)} />
            <CostTile
              label={`Projected end-of-month (+${data.projection.daysLeftInMonth}d)`}
              value={fmt(data.projection.projectedMonthEndUsd)}
            />
            <CostTile
              label="Day"
              value={`${data.projection.dayOfMonth} / ${data.projection.dayOfMonth + data.projection.daysLeftInMonth}`}
            />
          </div>
          <p className="mt-2 text-2xs text-ink-500">
            Projection = MTD + (daily avg over last {days}d) × {data.projection.daysLeftInMonth}{" "}
            days left. Linear; doesn't account for usage patterns.
          </p>
        </section>
      )}

      {budget && (budget.config.orgDaily > 0 || budget.config.userDaily > 0) && (
        <BudgetCard budget={budget} fmt={fmt} />
      )}

      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CostBreakdownCard title="By actor" rows={data.byActor} fmt={fmt} />
          <CostBreakdownCard title="By department" rows={data.byDepartment} fmt={fmt} />
          <CostBreakdownCard title="By model" rows={data.byModel} fmt={fmt} />
          <CostBreakdownCard title="By step" rows={data.byStep} fmt={fmt} />
          <CostBreakdownCard title="By classification" rows={data.byClassification} fmt={fmt} />
        </div>
      )}

      {data && data.byDay.length > 0 && (
        <section className="card p-5">
          <h2 className="section-title">By day</h2>
          <div className="mt-3 space-y-1">
            {(() => {
              const max = Math.max(...data.byDay.map((d) => d.costUsd), 0.01);
              return data.byDay.map((row) => (
                <div key={row.day} className="flex items-center gap-2 text-xs">
                  <span className="w-24 font-mono text-ink-500">{row.day}</span>
                  <div className="relative h-3 flex-1 rounded-xs bg-ink-100">
                    <div
                      className="absolute inset-y-0 start-0 rounded-xs bg-accent"
                      style={{ width: `${(row.costUsd / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 text-end font-mono text-ink-700">{fmt(row.costUsd)}</span>
                  <span className="w-12 text-end font-mono text-2xs text-ink-400">
                    {row.calls}c
                  </span>
                </div>
              ));
            })()}
          </div>
        </section>
      )}
    </div>
  );
}

function BudgetCard({ budget, fmt }: { budget: BudgetResp; fmt: (n: number) => string }) {
  const { snapshot: s, config: c } = budget;
  function colorFor(percent: number): string {
    if (percent >= 1) return "bg-signal-risk";
    if (percent >= 0.7) return "bg-signal-warn";
    return "bg-signal-ok";
  }
  function chipFor(percent: number): string {
    if (percent >= 1) return "bg-signal-risk/20 text-signal-risk";
    if (percent >= 0.7) return "bg-signal-warn/20 text-signal-warn";
    return "bg-signal-ok/20 text-signal-ok";
  }
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="section-title">Today's budget · {s.day}</h2>
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wide text-ink-500">
            enforcement
          </span>
          <span
            className={`rounded-xs px-1.5 py-0.5 text-2xs font-medium uppercase ${
              c.enforceBlock ? "bg-signal-risk/20 text-signal-risk" : "bg-ink-100 text-ink-600"
            }`}
          >
            {c.enforceBlock ? "BLOCK" : "alert only"}
          </span>
        </div>
      </div>
      {c.orgDaily > 0 && (
        <div className="mb-4">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-ink-600">Org-wide</span>
            <span className="font-mono text-ink-800">
              {fmt(s.orgSpend)} / {fmt(c.orgDaily)}
            </span>
          </div>
          <div className="relative h-2 rounded-xs bg-ink-100">
            <div
              className={`absolute inset-y-0 start-0 rounded-xs ${colorFor(s.orgPercent)}`}
              style={{ width: `${Math.min(100, s.orgPercent * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-2xs text-ink-500">
            {(s.orgPercent * 100).toFixed(1)}% of cap
          </div>
        </div>
      )}
      {c.userDaily > 0 && s.byActor.length > 0 && (
        <div className="mb-4">
          <div className="mb-1 text-xs text-ink-600">Per-user (cap {fmt(c.userDaily)})</div>
          <ul className="space-y-1">
            {s.byActor.map((a) => (
              <li key={a.actor} className="text-2xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-ink-700">{a.actor}</span>
                  <div className="flex items-center gap-2">
                    {a.alerted && (
                      <span className={`rounded-xs px-1 py-0 ${chipFor(a.percent)}`}>alerted</span>
                    )}
                    <span className="font-mono text-ink-800">{fmt(a.spend)}</span>
                  </div>
                </div>
                <div className="mt-0.5 h-1 rounded-xs bg-ink-100">
                  <div
                    className={`h-full rounded-xs ${colorFor(a.percent)}`}
                    style={{ width: `${Math.min(100, a.percent * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.byDept && s.byDept.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-ink-600">Per-department</div>
          <ul className="space-y-1">
            {s.byDept.map((d) => (
              <li key={d.deptId} className="text-2xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-ink-700">{d.deptName ?? d.deptId}</span>
                  <div className="flex items-center gap-2">
                    {d.alerted && (
                      <span className={`rounded-xs px-1 py-0 ${chipFor(d.percent)}`}>alerted</span>
                    )}
                    <span className="font-mono text-ink-800">
                      {fmt(d.spend)}
                      {d.limit > 0 ? ` / ${fmt(d.limit)}` : ""}
                    </span>
                  </div>
                </div>
                {d.limit > 0 && (
                  <div className="mt-0.5 h-1 rounded-xs bg-ink-100">
                    <div
                      className={`h-full rounded-xs ${colorFor(d.percent)}`}
                      style={{ width: `${Math.min(100, d.percent * 100)}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CostTile({
  label,
  value,
  trend,
}: { label: string; value: string; trend?: number | null }) {
  const hasTrend = trend !== undefined && trend !== null && Number.isFinite(trend);
  const up = hasTrend && (trend as number) > 0;
  const flat = hasTrend && (trend as number) === 0;
  const chipCls = !hasTrend
    ? ""
    : flat
      ? "bg-ink-100 text-ink-600"
      : up
        ? "bg-signal-warn/20 text-signal-warn"
        : "bg-signal-ok/20 text-signal-ok";
  return (
    <div className="rounded-md border border-ink-150 bg-ink-100 p-3 shadow-card">
      <div className="flex items-baseline justify-between">
        <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">{label}</div>
        {hasTrend && (
          <span
            className={`rounded-xs px-1.5 py-0.5 text-2xs font-medium ${chipCls}`}
            title="vs previous window"
          >
            {up ? "▲" : flat ? "•" : "▼"} {Math.abs(trend as number).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold text-ink-800">{value}</div>
    </div>
  );
}

function CostBreakdownCard({
  title,
  rows,
  fmt,
}: { title: string; rows: CostBucket[]; fmt: (n: number) => string }) {
  const max = rows.length > 0 ? Math.max(...rows.map((r) => r.costUsd), 0.0001) : 0.0001;
  return (
    <section className="card p-4">
      <h3 className="section-title">{title}</h3>
      {rows.length === 0 ? (
        <div className="mt-2 text-2xs text-ink-400">No data.</div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-ink-700">{r.key}</span>
                <span className="font-mono text-ink-800">{fmt(r.costUsd)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="relative h-1.5 flex-1 rounded-xs bg-ink-100">
                  <div
                    className="absolute inset-y-0 start-0 rounded-xs bg-accent"
                    style={{ width: `${(r.costUsd / max) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-end font-mono text-2xs text-ink-400">{r.calls}c</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
