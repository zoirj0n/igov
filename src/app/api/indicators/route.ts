import { getCurrentUser } from "@/lib/auth/server";
import { INDICATORS } from "@/lib/data/indicators";
import { dbEnabled } from "@/services/database";
import { liveFor } from "@/services/ingest/store";
import { listCountries } from "@/services/repo/countries";
import { indicatorsAcrossCountriesByMetric } from "@/services/repo/indicators";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const metric = url.searchParams.get("metric");
  if (!metric) {
    return NextResponse.json({ error: "metric query param required" }, { status: 400 });
  }

  if (dbEnabled()) {
    const rows = await indicatorsAcrossCountriesByMetric(metric);
    return NextResponse.json({ metric, indicators: rows, source: "db" });
  }

  const countries = await listCountries();
  const out = [];
  const seen = new Set<string>();
  for (const c of countries) {
    const live = liveFor(c.iso3, metric);
    if (live) {
      out.push(live);
      seen.add(c.iso3);
    }
  }
  for (const ind of INDICATORS) {
    if (ind.metric !== metric) continue;
    if (seen.has(ind.countryIso3)) continue;
    out.push(ind);
    seen.add(ind.countryIso3);
  }
  return NextResponse.json({ metric, indicators: out, source: "memory" });
}
