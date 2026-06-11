import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { getCurrentUser } from "@/lib/auth/server";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  logAudit(user, "auth.logout", "session");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
