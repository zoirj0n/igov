import { COUNTRIES as MOCK } from "@/lib/data/countries";
import { dbEnabled, query } from "@/services/database";
import type { Country } from "@/types";

interface CountryRow {
  iso3: string;
  name_en: string;
  name_ar: string;
  region: string;
  flag_emoji: string | null;
}

let cache: { ts: number; data: Country[] } | null = null;
const TTL_MS = 60_000;

export async function listCountries(): Promise<Country[]> {
  if (!dbEnabled()) return MOCK;
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.data;
  try {
    const rows = await query<CountryRow>(
      "SELECT iso3, name_en, name_ar, region, flag_emoji FROM countries ORDER BY name_en",
    );
    const data = rows.map(
      (r): Country => ({
        iso3: r.iso3,
        nameEn: r.name_en,
        nameAr: r.name_ar,
        region: r.region,
        flagEmoji: r.flag_emoji ?? undefined,
      }),
    );
    cache = { ts: Date.now(), data };
    return data;
  } catch {
    return MOCK;
  }
}

export async function findCountry(iso3: string): Promise<Country | undefined> {
  const all = await listCountries();
  return all.find((c) => c.iso3 === iso3);
}
