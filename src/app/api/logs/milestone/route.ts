import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import { logMilestone } from "@/services/project-log";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().min(3).max(160),
  summary: z.string().min(3).max(4000),
  area: z.string().max(200).optional(),
  links: z.string().max(400).optional(),
  audit: z.array(z.string().max(80)).max(20).optional(),
  classification: z.enum(["public", "internal", "confidential", "secret"]).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "lead"))
    return NextResponse.json({ error: "forbidden: lead or higher" }, { status: 403 });
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = Body.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const id = await logMilestone({ ...parsed.data, actor: user.email });
  logAudit(user, "log.milestone.create", "log", {
    resourceId: id,
    meta: { title: parsed.data.title },
  });
  return NextResponse.json({ id });
}
