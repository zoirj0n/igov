import { getCurrentUser } from "@/lib/auth/server";
import { canRead } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import { findBriefing } from "@/services/repo/briefings";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const briefing = await findBriefing(id);
  if (!briefing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!canRead(user, briefing.classification)) {
    logAudit(user, "briefing.read.denied", "briefing", {
      resourceId: id,
      classification: briefing.classification,
      meta: { userClearance: user.clearance },
    });
    return NextResponse.json(
      {
        error: `insufficient clearance: required ${briefing.classification}, have ${user.clearance}`,
      },
      { status: 403 },
    );
  }

  logAudit(user, "briefing.read", "briefing", {
    resourceId: id,
    classification: briefing.classification,
  });
  return NextResponse.json(briefing);
}
