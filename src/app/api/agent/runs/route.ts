import { getCurrentUser } from "@/lib/auth/server";
import { listRuns } from "@/services/repo/agent-runs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, secret: 3 };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const max = RANK[user.clearance] ?? 1;
  const runs = listRuns(24)
    .filter((r) => (RANK[r.classification] ?? 1) <= max)
    .slice(0, 8);
  return NextResponse.json({ runs });
}
