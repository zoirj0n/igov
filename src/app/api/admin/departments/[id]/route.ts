import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import { deleteDepartment, getDepartment, updateDepartment } from "@/services/policy/departments";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ClassEnum = z.enum(["public", "internal", "confidential", "secret"]);

const PatchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  parentId: z.string().min(1).max(80).nullable().optional(),
  defaultClassification: ClassEnum.nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const before = getDepartment(id);
  if (!before) return NextResponse.json({ error: "department not found" }, { status: 404 });
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
  const next = updateDepartment(id, parsed.data);
  if (!next) return NextResponse.json({ error: "update failed" }, { status: 500 });
  logAudit(user, "dept.update", "settings", {
    resourceId: id,
    meta: {
      from: {
        name: before.name,
        parentId: before.parentId,
        defaultClassification: before.defaultClassification,
      },
      to: {
        name: next.name,
        parentId: next.parentId,
        defaultClassification: next.defaultClassification,
      },
    },
  });
  return NextResponse.json({ department: next });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const before = getDepartment(id);
  if (!before) return NextResponse.json({ error: "department not found" }, { status: 404 });
  const ok = deleteDepartment(id);
  if (!ok) {
    return NextResponse.json({ error: "cannot delete (protected or not found)" }, { status: 409 });
  }
  logAudit(user, "dept.delete", "settings", {
    resourceId: id,
    meta: { name: before.name },
  });
  return NextResponse.json({ deleted: true });
}
