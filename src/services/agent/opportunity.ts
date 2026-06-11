/**
 * Bilateral opportunity scorer — real, inspectable computation that replaces the
 * previously hardcoded opportunity list.
 *
 * Each sector score in [0,100] is a weighted blend of the partner's real World
 * Bank indicators, normalised against realistic global maxima so partners and
 * sectors differentiate (a naïve /100 clamps every GDP to 1). The Strategist
 * node turns each opportunity's signals into an executive rationale grounded in
 * the numbers. Pure + deterministic → unit-tested.
 */
import type { IndicatorPoint, Opportunity } from "@/services/agent/state";

// Realistic global maxima per indicator for min-max-style normalisation.
const MAX = {
  gdp: 28e12, // ~US GDP
  exports: 3.5e12, // ~China exports
  electricityPc: 15000, // kWh/capita, high-income
  renewShare: 100, // %
  internet: 100, // %
  mobile: 160, // per 100
  gdpGrowth: 8, // %
};

function toMap(rows: IndicatorPoint[]): Map<string, number> {
  return new Map(rows.map((r) => [r.code, r.value]));
}

function n(x: number | undefined, max: number): number {
  if (x === undefined || max <= 0) return 0;
  return Math.max(0, Math.min(1, x / max));
}

export function scoreOpportunities(
  _uae: IndicatorPoint[],
  partner: IndicatorPoint[],
  partnerIso3: string,
): Opportunity[] {
  const p = toMap(partner);
  const gdp = p.get("gdp");
  const exports = p.get("exports");
  const growth = p.get("gdp_growth");
  const renew = p.get("renew_share");
  const elec = p.get("electricity_pc");
  const internet = p.get("internet_users");
  const mobile = p.get("mobile");

  const energy =
    0.6 * n(renew, MAX.renewShare) + 0.25 * n(elec, MAX.electricityPc) + 0.15 * n(gdp, MAX.gdp);
  const trade =
    0.55 * n(gdp, MAX.gdp) + 0.3 * n(exports, MAX.exports) + 0.15 * n(growth, MAX.gdpGrowth);
  const infra =
    0.45 * n(elec, MAX.electricityPc) +
    0.35 * n(mobile, MAX.mobile) +
    0.2 * n(internet, MAX.internet);

  const out: Opportunity[] = [
    {
      partnerIso3,
      sector: "energy",
      title: "Clean-energy / green-hydrogen cooperation",
      score: Math.round(energy * 100),
      rationale: "",
      signals: { renewSharePct: renew ?? 0, electricityPerCapita: elec ?? 0, gdpUsd: gdp ?? 0 },
    },
    {
      partnerIso3,
      sector: "trade",
      title: "Bilateral trade / CEPA expansion",
      score: Math.round(trade * 100),
      rationale: "",
      signals: { gdpUsd: gdp ?? 0, exportsUsd: exports ?? 0, gdpGrowthPct: growth ?? 0 },
    },
    {
      partnerIso3,
      sector: "infrastructure",
      title: "Smart-port & digital-infrastructure standards",
      score: Math.round(infra * 100),
      rationale: "",
      signals: {
        internetPct: internet ?? 0,
        mobilePer100: mobile ?? 0,
        electricityPerCapita: elec ?? 0,
      },
    },
  ];

  return out.sort((a, b) => b.score - a.score);
}
