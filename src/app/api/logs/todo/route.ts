import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import { logTodo } from "@/services/project-log";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().min(3).max(160),
  owner: z.string().max(80).optional(),
  area: z.string().max(200).optional(),
  priority: z.enum(["high", "med", "low"]).optional(),
  notes: z.string().max(4000).optional(),
  classification: z.enum(["public", "internal", "confidential", "secret"]).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "analyst"))
    return NextResponse.json({ error: "forbidden: analyst or higher" }, { status: 403 });
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = Body.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const id = await logTodo({ ...parsed.data, actor: user.email });
  logAudit(user, "log.todo.create", "log", {
    resourceId: id,
    meta: { title: parsed.data.title, owner: parsed.data.owner, priority: parsed.data.priority },
  });
  return NextResponse.json({ id });
}
