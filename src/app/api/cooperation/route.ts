import { getCurrentUser } from "@/lib/auth/server";
import { COUNTRIES } from "@/lib/data/countries";
import { readSeedIndicators } from "@/lib/data/indicator-codes";
import { scoreOpportunities } from "@/services/agent/opportunity";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Suggested pipeline stage derived from the complementarity score (heuristic). */
function stageFor(score: number): "scoping" | "proposal" | "negotiation" {
  if (score >= 80) return "negotiation";
  if (score >= 65) return "proposal";
  return "scoping";
}

/**
 * Real bilateral opportunities: for each partner with data, compute the
 * top-ranked cooperation opportunity (UAE × partner indicator complementarity).
 * Replaces the previously hardcoded list.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const uae = readSeedIndicators("ARE");
  const opportunities = COUNTRIES.filter((c) => c.iso3 !== "ARE")
    .map((c) => {
      const partner = readSeedIndicators(c.iso3);
      if (partner.length === 0) return null;
      const top = scoreOpportunities(uae, partner, c.iso3)[0];
      if (!top) return null;
      return {
        id: `${c.iso3}_${top.sector}`,
        partnerIso3: c.iso3,
        title: top.title,
        sector: top.sector,
        score: top.score,
        stage: stageFor(top.score),
        rationale: `Computed from indicator complementarity (UAE × ${c.nameEn}) in ${top.sector}.`,
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null)
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ opportunities, source: "computed" });
}
