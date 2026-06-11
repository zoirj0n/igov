import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import { deleteChunk } from "@/services/rag/chunks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const ok = deleteChunk(id);
  if (!ok) return NextResponse.json({ error: "chunk not found" }, { status: 404 });
  logAudit(user, "rag.chunk.delete", "rag", { resourceId: id });
  return NextResponse.json({ deleted: true });
}
