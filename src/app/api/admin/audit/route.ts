import { getCurrentUser } from "@/lib/auth/server";
import { recentAudit } from "@/services/audit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ events: recentAudit(200) });
}
