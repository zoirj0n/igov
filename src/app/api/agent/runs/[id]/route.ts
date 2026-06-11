import { getCurrentUser } from "@/lib/auth/server";
import { getRun } from "@/services/repo/agent-runs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, secret: 3 };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  if ((RANK[run.classification] ?? 1) > (RANK[user.clearance] ?? 1)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ run });
}
