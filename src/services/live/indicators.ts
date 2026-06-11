/**
 * Live indicators — fans out to World Bank + IMF at request time, merges into
 * the canonical IndicatorPoint set, backfills any gaps from the committed seed,
 * and caches. Air-gapped or fully offline → seed only. Live values (current
 * year) supersede seed values for the same code; IMF adds macro codes WB lacks
 * (inflation, unemployment, debt, current account).
 */
import {
  INDICATOR_META,
  fetchLiveIndicators,
  readSeedIndicators,
} from "@/lib/data/indicator-codes";
import type { IndicatorPoint } from "@/services/agent/state";
import { fetchImfFor } from "@/services/ingest/imf";
import { fetchEiaFor } from "@/services/live/eia";
import { isAirgapped, withCache, withTimeout } from "@/services/live/runtime";

const IMF_TO_CANONICAL: Record<string, string> = {
  inflation_pct: "inflation",
  unemployment_pct: "unemployment",
  debt_to_gdp_pct: "debt_to_gdp",
  current_account_pct: "current_account",
};

async function imfCanonical(iso3: string): Promise<IndicatorPoint[]> {
  const { rows } = await fetchImfFor([iso3]);
  const out: IndicatorPoint[] = [];
  for (const r of rows) {
    const code = IMF_TO_CANONICAL[r.metric];
    const meta = code ? INDICATOR_META[code] : undefined;
    if (code && meta)
      out.push({
        code,
        label: meta.label,
        value: r.value,
        unit: meta.unit,
        year: r.year,
        source: "IMF",
      });
  }
  return out;
}

export async function liveIndicators(iso3: string): Promise<IndicatorPoint[]> {
  const seed = () => readSeedIndicators(iso3);
  if (isAirgapped()) return seed();

  return withCache<IndicatorPoint[]>(
    `indicators:${iso3}`,
    6 * 60 * 60 * 1000, // 6h
    async () => {
      const [wb, imf, eia] = await Promise.all([
        // WB fans out many series; give it room so it isn't dropped under load.
        withTimeout(fetchLiveIndicators(iso3), 35_000, "worldbank").catch(
          () => [] as IndicatorPoint[],
        ),
        withTimeout(imfCanonical(iso3), 15_000, "imf").catch(() => [] as IndicatorPoint[]),
        fetchEiaFor(iso3).catch(() => [] as IndicatorPoint[]),
      ]);
      // Merge: live WB wins on overlaps; IMF + EIA add new codes; seed backfills gaps.
      const merged = new Map<string, IndicatorPoint>();
      for (const p of wb) merged.set(p.code, p);
      for (const p of imf) if (!merged.has(p.code)) merged.set(p.code, p);
      for (const p of eia) if (!merged.has(p.code)) merged.set(p.code, p);
      for (const p of seed()) if (!merged.has(p.code)) merged.set(p.code, p);
      return [...merged.values()];
    },
    seed,
  );
}
