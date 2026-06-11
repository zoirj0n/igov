import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import { createDepartment, listDepartments } from "@/services/policy/departments";
import { listUserDepartments } from "@/services/policy/user-departments";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ClassEnum = z.enum(["public", "internal", "confidential", "secret"]);

const PostSchema = z.object({
  name: z.string().min(2).max(120),
  parentId: z.string().min(1).max(80).optional(),
  defaultClassification: ClassEnum.optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const depts = listDepartments();
  const userDepts = listUserDepartments();
  const counts: Record<string, number> = {};
  for (const rec of Object.values(userDepts)) {
    counts[rec.departmentId] = (counts[rec.departmentId] ?? 0) + 1;
  }
  return NextResponse.json({
    departments: depts.map((d) => ({ ...d, memberCount: counts[d.id] ?? 0 })),
  });
}

export async function POST(req: Request) {
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
  const parsed = PostSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const dept = createDepartment({ ...parsed.data, createdBy: user.email });
  logAudit(user, "dept.create", "settings", {
    resourceId: dept.id,
    meta: {
      name: dept.name,
      parentId: dept.parentId,
      defaultClassification: dept.defaultClassification,
    },
  });
  return NextResponse.json({ department: dept });
}
