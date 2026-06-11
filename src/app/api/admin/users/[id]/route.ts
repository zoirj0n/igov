import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import { getDepartment } from "@/services/policy/departments";
import { getUserDepartment, setUserDepartment } from "@/services/policy/user-departments";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  departmentId: z.string().min(1).max(80),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }
  const { id: subjectSub } = await ctx.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const dept = getDepartment(parsed.data.departmentId);
  if (!dept) {
    return NextResponse.json({ error: "department not found" }, { status: 404 });
  }
  const before = getUserDepartment(subjectSub);
  const rec = setUserDepartment(subjectSub, dept.id, "admin", user.email);
  logAudit(user, "dept.member.override", "settings", {
    resourceId: subjectSub,
    meta: {
      from: before ? { departmentId: before.departmentId, source: before.source } : null,
      to: { departmentId: rec.departmentId, source: rec.source },
    },
  });
  return NextResponse.json({ user: { sub: subjectSub, ...rec } });
}
