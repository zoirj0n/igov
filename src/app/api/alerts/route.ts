import { getCurrentUser } from "@/lib/auth/server";
import { COUNTRIES } from "@/lib/data/countries";
import { readSeedIndicators } from "@/lib/data/indicator-codes";
import { buildAlerts } from "@/services/alerts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Smart Radar feed — monitoring signals computed from the latest indicators. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const countries = COUNTRIES.map((c) => ({ iso3: c.iso3, rows: readSeedIndicators(c.iso3) }));
  return NextResponse.json({ alerts: buildAlerts(countries), source: "computed" });
}
