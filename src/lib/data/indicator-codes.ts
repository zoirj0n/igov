/**
 * Canonical indicator vocabulary for the advisor + readers for real data.
 *
 * The agent/scorer speak a small canonical code set ("gdp", "renew_share", ...).
 * World Bank returns its own metric names; WB_TO_CANONICAL maps them. Real data
 * is read from the committed seed cache (wifi-proof demo); if a country has no
 * cache, fetchLiveIndicators hits World Bank live and maps the result.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { IndicatorPoint } from "@/services/agent/state";
import { fetchWorldBankFor } from "@/services/ingest/worldbank";

export const INDICATOR_META: Record<string, { label: string; unit: string }> = {
  gdp: { label: "GDP", unit: "USD" },
  gdp_growth: { label: "GDP growth", unit: "%" },
  gdp_per_capita: { label: "GDP per capita", unit: "USD" },
  population: { label: "Population", unit: "people" },
  co2: { label: "CO₂ per capita", unit: "t" },
  renew_share: { label: "Renewables share of energy", unit: "%" },
  exports: { label: "Exports of goods & services", unit: "USD" },
  fdi: { label: "FDI inflows", unit: "USD" },
  internet_users: { label: "Internet users", unit: "%" },
  mobile: { label: "Mobile subscriptions", unit: "per 100" },
  electricity_pc: { label: "Electricity use per capita", unit: "kWh" },
  // Scorer-only canonical codes (sourced via curated overlay / other agencies):
  energy_import_dep: { label: "Energy import dependence", unit: "%" },
  infra_index: { label: "Infrastructure quality index", unit: "score" },
  trade_yoy: { label: "Bilateral trade growth YoY", unit: "%" },
  trade_openness: { label: "Trade openness", unit: "% of GDP" },
  // IMF-sourced macro indicators (live via the IMF adapter).
  inflation: { label: "Inflation", unit: "%" },
  unemployment: { label: "Unemployment", unit: "%" },
  debt_to_gdp: { label: "Government debt", unit: "% of GDP" },
  current_account: { label: "Current account", unit: "% of GDP" },
  // EIA-sourced energy indicators (live via the EIA adapter).
  oil_production: { label: "Oil production", unit: "kb/d" },
  oil_consumption: { label: "Oil consumption", unit: "kb/d" },
};

/** Reverse map: live canonical code → seed/UI metric key (e.g. "gdp" → "gdp_usd_nominal"). */
export const CANONICAL_TO_METRIC: Record<string, string> = {
  gdp: "gdp_usd_nominal",
  gdp_growth: "gdp_growth_pct",
  population: "population",
  co2: "co2_per_capita_t",
  renew_share: "renewables_share_pct",
  exports: "exports_usd",
  fdi: "fdi_inflows_usd",
  internet_users: "internet_users_pct",
  mobile: "mobile_per_100",
  electricity_pc: "electricity_kwh_per_capita",
};

const WB_TO_CANONICAL: Record<string, string> = {
  gdp_usd_nominal: "gdp",
  gdp_growth_pct: "gdp_growth",
  population: "population",
  co2_per_capita_t: "co2",
  renewables_share_pct: "renew_share",
  exports_usd: "exports",
  fdi_inflows_usd: "fdi",
  internet_users_pct: "internet_users",
  mobile_per_100: "mobile",
  electricity_kwh_per_capita: "electricity_pc",
};

function seedPath(iso3: string): string {
  return path.join(process.cwd(), "data", "seed", `indicators.${iso3.toUpperCase()}.json`);
}

/** Read the committed real-data cache for a country. Returns [] if absent. */
export function readSeedIndicators(iso3: string): IndicatorPoint[] {
  try {
    const raw = readFileSync(seedPath(iso3), "utf-8");
    const parsed = JSON.parse(raw) as IndicatorPoint[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Read committed multi-year history (per canonical code) for a country. {} if absent. */
export function readSeedHistory(iso3: string): Record<string, { year: number; value: number }[]> {
  try {
    const raw = readFileSync(
      path.join(process.cwd(), "data", "seed", `history.${iso3.toUpperCase()}.json`),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as Record<string, { year: number; value: number }[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Live World Bank fetch mapped to canonical IndicatorPoints. Network-dependent. */
export async function fetchLiveIndicators(iso3: string): Promise<IndicatorPoint[]> {
  const { rows } = await fetchWorldBankFor([iso3.toUpperCase()]);
  const out: IndicatorPoint[] = [];
  for (const r of rows) {
    const code = WB_TO_CANONICAL[r.metric];
    if (!code) continue;
    const meta = INDICATOR_META[code];
    out.push({
      code,
      label: meta?.label ?? r.metric,
      value: r.value,
      unit: meta?.unit ?? r.unit,
      year: r.year,
      source: r.source,
    });
  }
  return out;
}
