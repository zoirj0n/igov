import { indicatorsByCountry } from "@/lib/data/indicators";
import { iso3Name } from "@/lib/data/iso-countries";
import type { Indicator } from "@/types";

export const COMPARE_METRICS = [
  "gdp_usd_nominal",
  "gdp_growth_pct",
  "renewables_share_pct",
  "co2_per_capita_t",
  "exports_usd",
  "fdi_inflows_usd",
] as const;

export interface ComparisonCell {
  value: number;
  unit: string;
  year: number;
}

export interface ComparisonPayload {
  countries: { iso3: string; name: string }[];
  rows: { metric: string; a: ComparisonCell | null; b: ComparisonCell | null }[];
}

function latest(rows: Indicator[], metric: string): ComparisonCell | null {
  const hit = rows.filter((i) => i.metric === metric).sort((x, y) => y.year - x.year)[0];
  return hit ? { value: hit.value, unit: hit.unit, year: hit.year } : null;
}

export function buildComparison(
  pair: [string, string] | string[],
  byCountry: (iso3: string) => Indicator[] = indicatorsByCountry,
): ComparisonPayload {
  const [a, b] = [pair[0] as string, pair[1] as string];
  const rowsA = byCountry(a);
  const rowsB = byCountry(b);
  return {
    countries: [
      { iso3: a, name: iso3Name(a) ?? a },
      { iso3: b, name: iso3Name(b) ?? b },
    ],
    rows: COMPARE_METRICS.map((metric) => ({
      metric,
      a: latest(rowsA, metric),
      b: latest(rowsB, metric),
    })),
  };
}
