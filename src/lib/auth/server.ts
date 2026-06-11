import { getUnassignedId } from "@/services/policy/departments";
import { getUserDepartment } from "@/services/policy/user-departments";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./jwt";
import type { AuthUser } from "./types";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token);
  if (!claims) return null;
  const deptRec = getUserDepartment(claims.sub);
  return {
    sub: claims.sub,
    email: claims.email,
    name: claims.name,
    role: claims.role,
    clearance: claims.clearance,
    departmentId: deptRec?.departmentId ?? claims.departmentId ?? getUnassignedId(),
    departmentSource: deptRec?.source ?? claims.departmentSource,
  };
}

export async function requireUser(): Promise<AuthUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("unauthenticated");
  return u;
}
