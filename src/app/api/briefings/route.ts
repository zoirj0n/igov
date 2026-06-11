import { getCurrentUser } from "@/lib/auth/server";
import { CLEARANCE_RANK } from "@/lib/auth/types";
import { dbEnabled } from "@/services/database";
import { listBriefings } from "@/services/repo/briefings";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const all = await listBriefings();
  const visible = all.filter(
    (b) => CLEARANCE_RANK[b.classification] <= CLEARANCE_RANK[user.clearance],
  );
  return NextResponse.json({ briefings: visible, source: dbEnabled() ? "db" : "memory" });
}
