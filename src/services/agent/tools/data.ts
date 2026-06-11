/**
 * Indicator tool — live-first (World Bank + IMF, merged to the canonical set),
 * with the committed seed as backfill/fallback and an air-gap toggle. The merge,
 * caching and resilience live in `@/services/live/indicators`.
 */
import type { IndicatorPoint } from "@/services/agent/state";
import { liveIndicators } from "@/services/live/indicators";

export async function fetchIndicators(iso3: string): Promise<IndicatorPoint[]> {
  return liveIndicators(iso3);
}
