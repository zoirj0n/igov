import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { getConfig, snapshot } from "@/services/llm/budget";
import { listDepartments } from "@/services/policy/departments";
import { getOrgPolicy } from "@/services/policy/org-policy";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }
  const snap = snapshot();
  const cfg = getConfig();
  const deptNameById: Record<string, string> = {};
  for (const d of listDepartments()) deptNameById[d.id] = d.name;
  // Enrich byDept with deptName + surface configured caps that haven't spent yet.
  const caps = getOrgPolicy().deptDailyBudgets ?? {};
  const spentIds = new Set(snap.byDept.map((d) => d.deptId));
  const byDeptEnriched = [
    ...snap.byDept.map((d) => ({ ...d, deptName: deptNameById[d.deptId] ?? d.deptId })),
    ...Object.entries(caps)
      .filter(([id, cap]) => cap > 0 && !spentIds.has(id))
      .map(([id, cap]) => ({
        deptId: id,
        deptName: deptNameById[id] ?? id,
        spend: 0,
        limit: cap,
        percent: 0,
        alerted: false,
      })),
  ];
  return NextResponse.json({
    snapshot: { ...snap, byDept: byDeptEnriched },
    config: cfg,
  });
}
