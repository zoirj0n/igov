import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/auth/jwt";
import { authenticate } from "@/lib/auth/users";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined;
  const user = authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    logAudit(null, "auth.login.fail", "session", { meta: { email: parsed.data.email }, ip });
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const token = await signSession(user);
  logAudit(user, "auth.login.ok", "session", { resourceId: user.sub, ip });

  const res = NextResponse.json({ user });
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const isHttps = proto === "https";
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
