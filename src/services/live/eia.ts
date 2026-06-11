/**
 * EIA (US Energy Information Administration) — free, keyed energy API; the
 * practical substitute for IEA's paywalled API. Adds real oil production &
 * consumption (the fossil side) to complement World Bank renewables/electricity.
 * Needs EIA_API_KEY; returns [] when absent so the agent simply skips it.
 */
import type { IndicatorPoint } from "@/services/agent/state";
import { withTimeout } from "@/services/live/runtime";

const BASE = "https://api.eia.gov/v2/international/data/";

// product 53 = total petroleum & other liquids; activity 1 = production, 2 = consumption.
const SERIES = [
  { code: "oil_production", label: "Oil production", productId: "53", activityId: "1" },
  { code: "oil_consumption", label: "Oil consumption", productId: "53", activityId: "2" },
] as const;

interface EiaRow {
  period: string;
  value: number | string | null;
}

export async function fetchEiaFor(iso3: string): Promise<IndicatorPoint[]> {
  const key = process.env.EIA_API_KEY;
  if (!key) return [];
  const results = await Promise.all(
    SERIES.map(async (s): Promise<IndicatorPoint | null> => {
      try {
        const url =
          `${BASE}?frequency=annual&data[0]=value` +
          `&facets[activityId][]=${s.activityId}&facets[productId][]=${s.productId}` +
          `&facets[countryRegionId][]=${iso3}` +
          `&sort[0][column]=period&sort[0][direction]=desc&length=1&api_key=${key}`;
        const res = await withTimeout(fetch(url), 12_000, "eia");
        if (!res.ok) return null;
        const json = (await res.json()) as { response?: { data?: EiaRow[] } };
        const row = json.response?.data?.[0];
        if (!row || row.value == null) return null;
        return {
          code: s.code,
          label: s.label,
          value: Math.round(Number(row.value)),
          unit: "kb/d",
          year: Number(row.period),
          source: "EIA",
        };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((x): x is IndicatorPoint => x !== null);
}
