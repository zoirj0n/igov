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

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(cols: unknown[]): string {
  return `${cols.map(csvEscape).join(",")}\n`;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }
  const url = new URL(req.url);
  const sinceDays = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? "7")));
  const detail = url.searchParams.get("detail") === "true";
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

  const all = await readLlmCalls();
  const recent = all.filter((r) => new Date(r.ts).getTime() >= cutoff);

  // Department join
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

  // Rollups
  const byDay: Record<
    string,
    { calls: number; cost: number; promptTokens: number; completionTokens: number }
  > = {};
  const byActor: Record<string, { calls: number; cost: number; tokens: number; dept: string }> = {};
  const byDept: Record<string, { calls: number; cost: number; tokens: number }> = {};
  const byModel: Record<string, { calls: number; cost: number; tokens: number }> = {};
  let totalCost = 0;
  let totalCalls = 0;
  let totalTokens = 0;

  for (const r of recent) {
    const cost = r.costUsd ?? 0;
    const promptTok = r.promptTokens ?? 0;
    const compTok = r.completionTokens ?? 0;
    const tokens = promptTok + compTok;
    totalCost += cost;
    totalCalls += 1;
    totalTokens += tokens;

    const day = r.ts.slice(0, 10);
    const dr = byDay[day] ?? { calls: 0, cost: 0, promptTokens: 0, completionTokens: 0 };
    dr.calls += 1;
    dr.cost += cost;
    dr.promptTokens += promptTok;
    dr.completionTokens += compTok;
    byDay[day] = dr;

    const deptId = emailToDept[r.actor] ?? unassignedId;
    const deptLabel = deptNameById[deptId] ?? deptId;
    const ar = byActor[r.actor] ?? { calls: 0, cost: 0, tokens: 0, dept: deptLabel };
    ar.calls += 1;
    ar.cost += cost;
    ar.tokens += tokens;
    byActor[r.actor] = ar;

    const drow = byDept[deptLabel] ?? { calls: 0, cost: 0, tokens: 0 };
    drow.calls += 1;
    drow.cost += cost;
    drow.tokens += tokens;
    byDept[deptLabel] = drow;

    const mr = byModel[r.model] ?? { calls: 0, cost: 0, tokens: 0 };
    mr.calls += 1;
    mr.cost += cost;
    mr.tokens += tokens;
    byModel[r.model] = mr;
  }

  // Build CSV
  let csv = "";
  const today = new Date().toISOString().slice(0, 10);
  csv += `# Cost report generated ${new Date().toISOString()} by ${user.email}\n`;
  csv += `# Window: last ${sinceDays} day(s) ending ${today}\n`;
  csv += `# Mode: ${detail ? "per-call detail" : "aggregated"}\n`;
  csv += `# Total calls: ${totalCalls}  Total cost USD: ${totalCost.toFixed(6)}  Total tokens: ${totalTokens}\n`;

  if (detail) {
    csv += "\n## Per-call detail\n";
    csv += row([
      "ts",
      "actor",
      "department",
      "step",
      "provider",
      "model",
      "classification",
      "prompt_tokens",
      "completion_tokens",
      "cost_usd",
      "duration_ms",
    ]);
    for (const r of recent.sort((a, b) => a.ts.localeCompare(b.ts))) {
      const deptId = emailToDept[r.actor] ?? unassignedId;
      csv += row([
        r.ts,
        r.actor,
        deptNameById[deptId] ?? deptId,
        r.step,
        r.provider,
        r.model,
        r.classification,
        r.promptTokens ?? 0,
        r.completionTokens ?? 0,
        (r.costUsd ?? 0).toFixed(6),
        r.durationMs ?? 0,
      ]);
    }
    const filename = `cost-${today}-${sinceDays}d-detail.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  }
  csv += "\n## Daily totals\n";
  csv += row(["date", "calls", "cost_usd", "prompt_tokens", "completion_tokens"]);
  for (const day of Object.keys(byDay).sort()) {
    const d = byDay[day]!;
    csv += row([day, d.calls, d.cost.toFixed(6), d.promptTokens, d.completionTokens]);
  }
  csv += "\n## By actor\n";
  csv += row(["actor", "department", "calls", "cost_usd", "tokens"]);
  for (const [actor, v] of Object.entries(byActor).sort((a, b) => b[1].cost - a[1].cost)) {
    csv += row([actor, v.dept, v.calls, v.cost.toFixed(6), v.tokens]);
  }
  csv += "\n## By department\n";
  csv += row(["department", "calls", "cost_usd", "tokens"]);
  for (const [dept, v] of Object.entries(byDept).sort((a, b) => b[1].cost - a[1].cost)) {
    csv += row([dept, v.calls, v.cost.toFixed(6), v.tokens]);
  }
  csv += "\n## By model\n";
  csv += row(["model", "calls", "cost_usd", "tokens"]);
  for (const [model, v] of Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost)) {
    csv += row([model, v.calls, v.cost.toFixed(6), v.tokens]);
  }

  const filename = `cost-${today}-${sinceDays}d.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
