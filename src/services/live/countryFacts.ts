import { isAirgapped, withCache, withTimeout } from "@/services/live/runtime";
/**
 * Country IR facts — HKTDC-style one-pager data. Numerics come live from the
 * World Bank (mrnev = most recent non-empty value); civic facts and dated
 * numeric fallbacks come from the featured-14 seed. Air-gapped ⇒ seed only.
 */
import seedRaw from "../../../data/seed/country-facts.json";

export interface CountryFacts {
  iso3: string;
  capital?: string;
  currency?: string;
  politicalSystem?: string;
  language?: string;
  populationM?: number;
  gdpPerCapitaUsd?: number;
  tradePctGdp?: number;
  sectors?: { agriculture: number; industry: number; services: number };
  year: number;
  source: string;
  live: boolean;
}

interface SeedRow {
  capital: string;
  currency: string;
  politicalSystem: string;
  language: string;
  populationM: number;
  gdpPerCapitaUsd: number;
  tradePctGdp: number;
  sectors: { agriculture: number; industry: number; services: number };
  year: number;
}

const SEED = seedRaw as unknown as Record<string, SeedRow | object>;

function seedFor(iso3: string): SeedRow | null {
  const v = SEED[iso3];
  return v && typeof v === "object" && "capital" in v ? (v as SeedRow) : null;
}

/** Pure: WB v2 mrnev payload → { value, year } | null. */
export function parseWbMrnev(j: unknown): { value: number; year: number } | null {
  if (!Array.isArray(j) || !Array.isArray(j[1])) return null;
  const row = j[1][0] as { value?: number | null; date?: string } | undefined;
  if (!row || row.value === null || row.value === undefined) return null;
  const year = Number.parseInt(row.date ?? "", 10);
  return Number.isFinite(row.value) && Number.isFinite(year) ? { value: row.value, year } : null;
}

const WB = "https://api.worldbank.org/v2/country";
const CODES = {
  population: "SP.POP.TOTL",
  gdpPerCapita: "NY.GDP.PCAP.CD",
  tradePct: "NE.TRD.GNFS.ZS",
  agriculture: "NV.AGR.TOTL.ZS",
  industry: "NV.IND.TOTL.ZS",
  services: "NV.SRV.TOTL.ZS",
} as const;

async function wbValue(
  iso3: string,
  code: string,
): Promise<{ value: number; year: number } | null> {
  const url = `${WB}/${iso3}/indicator/${code}?format=json&mrnev=1`;
  const res = await withTimeout(fetch(url), 12_000, "worldbank-facts");
  if (!res.ok) throw new Error(`wb ${res.status}`);
  return parseWbMrnev(await res.json());
}

export async function fetchCountryFacts(iso3: string): Promise<CountryFacts | null> {
  const seed = seedFor(iso3);
  const fromSeed = (): CountryFacts | null =>
    seed ? { iso3, ...seed, source: "World Bank (seed)", live: false } : null;

  if (isAirgapped()) return fromSeed();

  return withCache<CountryFacts | null>(
    `facts:${iso3}`,
    6 * 60 * 60 * 1000,
    async () => {
      const [pop, gpc, trade, agr, ind, srv] = await Promise.all([
        wbValue(iso3, CODES.population).catch(() => null),
        wbValue(iso3, CODES.gdpPerCapita).catch(() => null),
        wbValue(iso3, CODES.tradePct).catch(() => null),
        wbValue(iso3, CODES.agriculture).catch(() => null),
        wbValue(iso3, CODES.industry).catch(() => null),
        wbValue(iso3, CODES.services).catch(() => null),
      ]);
      const anyLive = pop || gpc || trade || agr || ind || srv;
      if (!anyLive) return fromSeed();
      const year = Math.max(
        ...[pop, gpc, trade, agr, ind, srv]
          .filter(Boolean)
          .map((v) => (v as { year: number }).year),
      );
      return {
        iso3,
        capital: seed?.capital,
        currency: seed?.currency,
        politicalSystem: seed?.politicalSystem,
        language: seed?.language,
        populationM: pop ? Math.round((pop.value / 1e6) * 10) / 10 : seed?.populationM,
        gdpPerCapitaUsd: gpc ? Math.round(gpc.value) : seed?.gdpPerCapitaUsd,
        tradePctGdp: trade ? Math.round(trade.value) : seed?.tradePctGdp,
        sectors:
          agr && ind && srv
            ? {
                agriculture: Math.round(agr.value * 10) / 10,
                industry: Math.round(ind.value * 10) / 10,
                services: Math.round(srv.value * 10) / 10,
              }
            : seed?.sectors,
        year,
        source: "World Bank",
        live: true,
      };
    },
    fromSeed,
  );
}
