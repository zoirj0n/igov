import { getCurrentUser } from "@/lib/auth/server";
import { CANONICAL_TO_METRIC } from "@/lib/data/indicator-codes";
import { isValidIso3 } from "@/lib/data/iso-countries";
import { logAudit } from "@/services/audit";
import { dbEnabled } from "@/services/database";
import { liveIndicators } from "@/services/live/indicators";
import { findCountry } from "@/services/repo/countries";
import { indicatorsForCountry } from "@/services/repo/indicators";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await ctx.params;
  const upper = iso3.toUpperCase();
  // ANY real country is servable via the live layer — not only the curated
  // seed. (The seed-only gate here was why /compare 404'd for e.g. Morocco.)
  if (!isValidIso3(upper)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const country = await findCountry(upper);
  let indicators = country ? await indicatorsForCountry(upper) : [];
  let source = dbEnabled() ? "db" : "memory";

  if (indicators.length === 0) {
    // Live-first (World Bank/IMF/EIA, 6h cache, seed merge) mapped onto the
    // seed metric keys the comparison UI expects.
    const live = await liveIndicators(upper);
    indicators = live.map((p) => ({
      id: `${upper}-${p.code}-${p.year}`,
      countryIso3: upper,
      metric: CANONICAL_TO_METRIC[p.code] ?? p.code,
      value: p.value,
      unit: p.unit,
      year: p.year,
      source: p.source,
      confidence: "high" as const,
    }));
    source = "live";
  }

  logAudit(user, "country.indicators.read", "country", {
    resourceId: upper,
    meta: { rows: indicators.length, source },
  });

  return NextResponse.json({ country: upper, indicators, source });
}
