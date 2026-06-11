import { getCurrentUser } from "@/lib/auth/server";
import { listSessions } from "@/services/chat-log-reader";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const sessions = await listSessions({
    actor: user.role === "admin" ? undefined : user.email,
    includeAnon: user.role === "admin",
    limit: 50,
  });
  return NextResponse.json({ sessions });
}
