import { INDICATORS as MOCK } from "@/lib/data/indicators";
import { dbEnabled, query } from "@/services/database";
import { liveByCountry as liveOverlay, liveFor as liveOverlayFor } from "@/services/ingest/store";
import type { Indicator } from "@/types";

interface IndicatorRow {
  id: string;
  country_iso3: string;
  metric: string;
  value: number;
  unit: string;
  year: number;
  source: string;
  confidence: "high" | "med" | "low";
}

function mapRow(r: IndicatorRow): Indicator {
  return {
    id: r.id,
    countryIso3: r.country_iso3,
    metric: r.metric,
    value: Number(r.value),
    unit: r.unit,
    year: r.year,
    source: r.source,
    confidence: r.confidence,
  };
}

export async function indicatorsForCountry(iso3: string): Promise<Indicator[]> {
  if (!dbEnabled()) {
    const live = liveOverlay(iso3);
    const mock = MOCK.filter((i) => i.countryIso3 === iso3);
    if (live.length === 0) return mock;
    const overlayMetrics = new Set(live.map((r) => r.metric));
    return [...live, ...mock.filter((m) => !overlayMetrics.has(m.metric))];
  }
  try {
    const rows = await query<IndicatorRow>(
      `SELECT id, country_iso3, metric, value, unit, year, source, confidence
       FROM indicators
       WHERE country_iso3 = $1
       ORDER BY metric, year DESC`,
      [iso3],
    );
    return rows.map(mapRow);
  } catch {
    const live = liveOverlay(iso3);
    const mock = MOCK.filter((i) => i.countryIso3 === iso3);
    return [...live, ...mock];
  }
}

export async function indicatorForMetric(
  iso3: string,
  metric: string,
): Promise<Indicator | undefined> {
  if (!dbEnabled()) {
    return (
      liveOverlayFor(iso3, metric) ??
      MOCK.find((i) => i.countryIso3 === iso3 && i.metric === metric)
    );
  }
  try {
    const rows = await query<IndicatorRow>(
      `SELECT id, country_iso3, metric, value, unit, year, source, confidence
       FROM indicators
       WHERE country_iso3 = $1 AND metric = $2
       ORDER BY year DESC LIMIT 1`,
      [iso3, metric],
    );
    return rows[0] ? mapRow(rows[0]) : undefined;
  } catch {
    return liveOverlayFor(iso3, metric);
  }
}

export async function indicatorsAcrossCountriesByMetric(metric: string): Promise<Indicator[]> {
  if (!dbEnabled()) {
    const byCountry = new Map<string, Indicator>();
    for (const m of MOCK) {
      if (m.metric !== metric) continue;
      byCountry.set(m.countryIso3, m);
    }
    return [...byCountry.values()];
  }
  try {
    const rows = await query<IndicatorRow>(
      `SELECT DISTINCT ON (country_iso3) id, country_iso3, metric, value, unit, year, source, confidence
       FROM indicators
       WHERE metric = $1
       ORDER BY country_iso3, year DESC`,
      [metric],
    );
    return rows.map(mapRow);
  } catch {
    return [];
  }
}

export async function upsertIndicatorsDb(rows: Indicator[]): Promise<number> {
  if (!dbEnabled() || rows.length === 0) return 0;
  let inserted = 0;
  try {
    for (const r of rows) {
      await query(
        `INSERT INTO indicators (id, country_iso3, metric, value, unit, year, source, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::confidence_level)
         ON CONFLICT (country_iso3, metric, year) DO UPDATE
         SET value = EXCLUDED.value,
             unit = EXCLUDED.unit,
             source = EXCLUDED.source,
             confidence = EXCLUDED.confidence,
             ingested_at = NOW()`,
        [r.id, r.countryIso3, r.metric, r.value, r.unit, r.year, r.source, r.confidence],
      );
      inserted++;
    }
  } catch {
    // swallow; caller can check counts
  }
  return inserted;
}
