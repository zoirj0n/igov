import { getCurrentUser } from "@/lib/auth/server";
import { getStatus } from "@/services/ingest/runner";
import { liveCount } from "@/services/ingest/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({
    sources: getStatus(),
    liveIndicators: liveCount(),
  });
}
