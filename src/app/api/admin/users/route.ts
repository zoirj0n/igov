import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { SEED_USERS } from "@/lib/auth/users";
import { getUnassignedId } from "@/services/policy/departments";
import { getUserDepartment } from "@/services/policy/user-departments";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }
  const unassigned = getUnassignedId();
  const users = SEED_USERS.map(({ password: _pw, ...u }) => {
    const rec = getUserDepartment(u.sub);
    return {
      ...u,
      departmentId: rec?.departmentId ?? unassigned,
      departmentSource: rec?.source ?? null,
    };
  });
  return NextResponse.json({ users });
}
