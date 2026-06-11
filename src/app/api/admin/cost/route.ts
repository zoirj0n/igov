import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { SEED_USERS } from "@/lib/auth/users";
import { getUnassignedId, listDepartments } from "@/services/policy/departments";
import { listUserDepartments } from "@/services/policy/user-departments";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LlmRow {
  ts: string;
  actor: string;
  step: string;
  provider: string;
  model: string;
  classification: string;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  durationMs?: number;
  usedRealApi?: boolean;
  reqId?: string;
}

async function readLlmCalls(maxLines = 20_000): Promise<LlmRow[]> {
  const file = path.join(process.cwd(), "logs", "llm-calls.jsonl");
  try {
    const raw = await readFile(file, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const tail = lines.slice(-maxLines);
    const out: LlmRow[] = [];
    for (const line of tail) {
      try {
        out.push(JSON.parse(line) as LlmRow);
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }
  const url = new URL(req.url);
  const sinceDays = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? "7")));
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

  const all = await readLlmCalls();
  const recent = all.filter((r) => new Date(r.ts).getTime() >= cutoff);

  // Previous-period totals for trend delta (same window length, immediately prior).
  const prevStart = cutoff - sinceDays * 24 * 60 * 60 * 1000;
  let prevTotalCost = 0;
  let prevTotalCalls = 0;
  for (const r of all) {
    const t = new Date(r.ts).getTime();
    if (t >= prevStart && t < cutoff) {
      prevTotalCost += r.costUsd ?? 0;
      prevTotalCalls += 1;
    }
  }

  const userDepts = listUserDepartments();
  const depts = listDepartments();
  const deptNameById: Record<string, string> = {};
  for (const d of depts) deptNameById[d.id] = d.name;
  const unassignedId = getUnassignedId();
  const emailToDept: Record<string, string> = {};
  for (const u of SEED_USERS) {
    const rec = userDepts[u.sub];
    emailToDept[u.email] = rec?.departmentId ?? unassignedId;
  }

  let totalCost = 0;
  let totalCalls = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalDurationMs = 0;
  const byActor: Record<string, { calls: number; costUsd: number; tokens: number }> = {};
  const byProvider: Record<string, { calls: number; costUsd: number; tokens: number }> = {};
  const byModel: Record<string, { calls: number; costUsd: number; tokens: number }> = {};
  const byStep: Record<string, { calls: number; costUsd: number; tokens: number }> = {};
  const byDay: Record<string, { calls: number; costUsd: number }> = {};
  const byClassification: Record<string, { calls: number; costUsd: number }> = {};
  const byDepartment: Record<string, { calls: number; costUsd: number; tokens: number }> = {};

  function bump(
    bucket: Record<string, { calls: number; costUsd: number; tokens?: number }>,
    key: string,
    cost: number,
    tokens: number,
  ): void {
    const cur = bucket[key] ?? { calls: 0, costUsd: 0, tokens: 0 };
    cur.calls += 1;
    cur.costUsd = Number((cur.costUsd + cost).toFixed(6));
    cur.tokens = (cur.tokens ?? 0) + tokens;
    bucket[key] = cur;
  }

  for (const r of recent) {
    const cost = r.costUsd ?? 0;
    const tokens = (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
    totalCost += cost;
    totalCalls += 1;
    totalPromptTokens += r.promptTokens ?? 0;
    totalCompletionTokens += r.completionTokens ?? 0;
    totalDurationMs += r.durationMs ?? 0;
    bump(byActor, r.actor || "—", cost, tokens);
    bump(byProvider, r.provider || "—", cost, tokens);
    bump(byModel, r.model || "—", cost, tokens);
    bump(byStep, r.step || "—", cost, tokens);
    bump(byClassification as never, r.classification || "—", cost, tokens);
    const deptId = emailToDept[r.actor] ?? unassignedId;
    bump(byDepartment, deptNameById[deptId] ?? deptId, cost, tokens);
    const day = r.ts.slice(0, 10);
    const cur = byDay[day] ?? { calls: 0, costUsd: 0 };
    cur.calls += 1;
    cur.costUsd = Number((cur.costUsd + cost).toFixed(6));
    byDay[day] = cur;
  }

  function top(b: Record<string, { calls: number; costUsd: number; tokens?: number }>, n = 10) {
    return Object.entries(b)
      .sort((a, b2) => b2[1].costUsd - a[1].costUsd)
      .slice(0, n)
      .map(([key, v]) => ({ key, ...v }));
  }

  // Month-to-date + projection.
  const now = new Date();
  const monthPrefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const dayOfMonth = now.getUTCDate();
  const lastDayOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const daysLeftInMonth = lastDayOfMonth - dayOfMonth;

  let mtdSpend = 0;
  const mtdDays = new Set<string>();
  for (const r of all) {
    const day = r.ts.slice(0, 10);
    if (!day.startsWith(monthPrefix)) continue;
    mtdSpend += r.costUsd ?? 0;
    mtdDays.add(day);
  }
  const sinceDayCount = Math.max(1, sinceDays);
  const dailyAvgWindow = totalCost / sinceDayCount;
  const projectedMonthEnd = mtdSpend + dailyAvgWindow * daysLeftInMonth;
  const projection = {
    monthPrefix,
    monthToDate: Number(mtdSpend.toFixed(4)),
    activeDaysThisMonth: mtdDays.size,
    dayOfMonth,
    daysLeftInMonth,
    dailyAvgWindowUsd: Number(dailyAvgWindow.toFixed(6)),
    projectedMonthEndUsd: Number(projectedMonthEnd.toFixed(4)),
  };

  return NextResponse.json({
    sinceDays,
    totals: {
      calls: totalCalls,
      costUsd: Number(totalCost.toFixed(4)),
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      durationMs: totalDurationMs,
    },
    byActor: top(byActor),
    byProvider: top(byProvider),
    byModel: top(byModel),
    byStep: top(byStep),
    byDepartment: top(byDepartment),
    byClassification: Object.entries(byClassification).map(([k, v]) => ({ key: k, ...v })),
    projection,
    trend: {
      previousCostUsd: Number(prevTotalCost.toFixed(4)),
      previousCalls: prevTotalCalls,
      costDeltaPct:
        prevTotalCost > 0
          ? Number((((totalCost - prevTotalCost) / prevTotalCost) * 100).toFixed(1))
          : null,
      callsDeltaPct:
        prevTotalCalls > 0
          ? Number((((totalCalls - prevTotalCalls) / prevTotalCalls) * 100).toFixed(1))
          : null,
    },
    byDay: Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({ day, ...v })),
  });
}
