import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import { getOrgPolicy, setOrgPolicy } from "@/services/policy/org-policy";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ClassEnum = z.enum(["public", "internal", "confidential", "secret"]);
const RoleEnum = z.enum(["viewer", "analyst", "lead", "executive", "admin"]);

const PutSchema = z.object({
  orgDefaultClassification: ClassEnum.optional(),
  roleDefaults: z.record(RoleEnum, ClassEnum).optional(),
  /** Daily LLM budget cap per department in USD. 0 or missing key = no cap. */
  deptDailyBudgets: z.record(z.string().min(1), z.number().min(0).max(1_000_000)).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ policy: getOrgPolicy() });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = PutSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const before = getOrgPolicy();
  const next = setOrgPolicy({ ...parsed.data, updatedBy: user.email });
  logAudit(user, "orgpolicy.update", "settings", {
    meta: {
      from: {
        orgDefaultClassification: before.orgDefaultClassification,
        roleDefaults: before.roleDefaults,
        deptDailyBudgets: before.deptDailyBudgets,
      },
      to: {
        orgDefaultClassification: next.orgDefaultClassification,
        roleDefaults: next.roleDefaults,
        deptDailyBudgets: next.deptDailyBudgets,
      },
    },
  });
  return NextResponse.json({ policy: next });
}
