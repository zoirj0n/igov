import { getCurrentUser } from "@/lib/auth/server";
import { dbEnabled, ping } from "@/services/database";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const enabled = dbEnabled();
  if (!enabled) {
    return NextResponse.json({
      enabled: false,
      reason: "USE_DB=0 or DATABASE_URL not set",
      message: "Running in in-memory mode. Set USE_DB=1 and DATABASE_URL to enable Postgres.",
    });
  }
  const p = await ping();
  return NextResponse.json({ enabled: true, ...p });
}
