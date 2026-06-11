import { dbEnabled } from "@/services/database";
import { listCountries } from "@/services/repo/countries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const countries = await listCountries();
  return NextResponse.json({ countries, source: dbEnabled() ? "db" : "memory" });
}
