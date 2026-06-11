import { getCurrentUser } from "@/lib/auth/server";
import { loadImportResults } from "@/lib/sources/importResults";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const results = await loadImportResults();
  return NextResponse.json({ results });
}
