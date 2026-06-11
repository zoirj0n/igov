import raw from "../../../data/seed/investments.json";

export interface InvestmentDeal {
  title: string;
  valueUsd: number;
  year: number;
  parties: string[];
  sector: string;
  source: { name: string; url: string };
}

const SEED = raw as unknown as Record<string, InvestmentDeal[] | object>;

/** Curated UAE-bilateral deals for the demo countries; [] elsewhere. */
export function investmentsFor(iso3: string): InvestmentDeal[] {
  const v = SEED[iso3];
  return Array.isArray(v) ? v : [];
}

export function totalInvestmentUsd(iso3: string): number {
  return investmentsFor(iso3).reduce((acc, d) => acc + d.valueUsd, 0);
}
