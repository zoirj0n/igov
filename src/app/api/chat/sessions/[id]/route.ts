import { getCurrentUser } from "@/lib/auth/server";
import { CLEARANCE_RANK } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import { deleteChatSession } from "@/services/chat-log";
import { readSession } from "@/services/chat-log-reader";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const entries = await readSession(id);
  if (entries.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const owner = entries.find((e) => e.actor)?.actor;
  if (user.role !== "admin" && owner && owner !== user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (user.role !== "admin" && !owner) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Filter by clearance — don't surface turns above user's clearance level
  const visible = entries.filter((e) => {
    const c = e.classification ?? "internal";
    return CLEARANCE_RANK[c] <= CLEARANCE_RANK[user.clearance];
  });
  return NextResponse.json({
    sessionId: id,
    entries: visible.map((e) => ({
      ts: e.ts,
      role: e.role,
      text: e.text,
      citations: e.citations,
      classification: e.classification,
      latencyMs: e.latencyMs,
    })),
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const entries = await readSession(id);
  if (entries.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const owner = entries.find((e) => e.actor)?.actor;
  // Same RBAC: owner or admin.
  if (user.role !== "admin" && (!owner || owner !== user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    await deleteChatSession(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  logAudit(user, "chat.session.deleted", "chat", {
    resourceId: id,
    meta: { turns: entries.length, owner: owner ?? null },
  });
  return NextResponse.json({ ok: true, deleted: id });
}
