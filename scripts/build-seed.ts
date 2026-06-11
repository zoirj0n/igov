/* eslint-disable no-console */
/**
 * Build the committed real-data cache for the demo countries.
 *
 * Fetches real indicators (World Bank) + multi-year GDP history, and writes:
 *   data/seed/indicators.<ISO3>.json   latest value per canonical metric
 *   data/seed/history.<ISO3>.json      { gdp: HistoricalPoint[] }
 *   data/seed/corpus.jsonl             short sourced snippets for RAG grounding
 *
 * Run online once; the output is committed so the demo runs offline.
 *   pnpm tsx scripts/build-seed.ts
 *
 * Imports only runtime-clean adapters (their @/ imports are type-only).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchWorldBankFor } from "../src/services/ingest/worldbank";
import { fetchHistorical } from "../src/services/predict/historical";

const COUNTRIES = [
  "ARE",
  "SAU",
  "USA",
  "GBR",
  "FRA",
  "DEU",
  "JPN",
  "KOR",
  "CHN",
  "IND",
  "BRA",
  "ZAF",
];
const NAMES: Record<string, string> = {
  ARE: "the UAE",
  SAU: "Saudi Arabia",
  USA: "the United States",
  GBR: "the United Kingdom",
  FRA: "France",
  DEU: "Germany",
  JPN: "Japan",
  KOR: "South Korea",
  CHN: "China",
  IND: "India",
  BRA: "Brazil",
  ZAF: "South Africa",
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

const META: Record<string, { label: string; unit: string }> = {
  gdp: { label: "GDP", unit: "USD" },
  gdp_growth: { label: "GDP growth", unit: "%" },
  population: { label: "Population", unit: "people" },
  co2: { label: "CO₂ per capita", unit: "t" },
  renew_share: { label: "Renewables share of energy", unit: "%" },
  exports: { label: "Exports of goods & services", unit: "USD" },
  fdi: { label: "FDI inflows", unit: "USD" },
  internet_users: { label: "Internet users", unit: "%" },
  mobile: { label: "Mobile subscriptions", unit: "per 100" },
  electricity_pc: { label: "Electricity use per capita", unit: "kWh" },
};

function humanize(value: number, unit: string): string {
  if (unit === "USD") {
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)} trillion USD`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)} billion USD`;
    return `${Math.round(value).toLocaleString()} USD`;
  }
  if (unit === "people") {
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)} million`;
    return Math.round(value).toLocaleString();
  }
  return `${value} ${unit}`;
}

async function main() {
  const outDir = path.join(process.cwd(), "data", "seed");
  mkdirSync(outDir, { recursive: true });
  const corpus: string[] = [];
  const chunks: Record<string, unknown>[] = [];
  const stamp = new Date().toISOString();

  for (const iso3 of COUNTRIES) {
    const { rows, errors } = await fetchWorldBankFor([iso3]);
    if (errors.length) console.warn(`${iso3}: ${errors.length} WB metric errors`);

    const indicators = rows
      .filter((r) => WB_TO_CANONICAL[r.metric])
      .map((r) => {
        const code = WB_TO_CANONICAL[r.metric] as string;
        const meta = META[code];
        return {
          code,
          label: meta?.label ?? r.metric,
          value: r.value,
          unit: meta?.unit ?? r.unit,
          year: r.year,
          source: r.source,
        };
      });
    writeFileSync(
      path.join(outDir, `indicators.${iso3}.json`),
      `${JSON.stringify(indicators, null, 2)}\n`,
    );
    console.log(`${iso3}: ${indicators.length} indicators`);

    // GDP history for the forecaster
    let gdpHistory: { year: number; value: number }[] = [];
    try {
      gdpHistory = (await fetchHistorical(iso3, "gdp_usd_nominal")).map((p) => ({
        year: p.year,
        value: p.value,
      }));
    } catch (e) {
      console.warn(`${iso3}: history fetch failed: ${(e as Error).message}`);
    }
    writeFileSync(
      path.join(outDir, `history.${iso3}.json`),
      `${JSON.stringify({ gdp: gdpHistory }, null, 2)}\n`,
    );
    console.log(`${iso3}: ${gdpHistory.length} GDP history points`);

    // Corpus snippets (sourced) for RAG grounding
    const name = NAMES[iso3] ?? iso3;
    for (const ind of indicators) {
      const id = `seed:${iso3}:${ind.code}`;
      const text = `${name} — ${ind.label}: ${humanize(ind.value, ind.unit)} (${ind.year}, World Bank).`;
      corpus.push(JSON.stringify({ id, iso3, lang: "en", source: "World Bank", text }));
      chunks.push({
        id,
        docId: `seed:${iso3}`,
        text,
        source: "World Bank",
        iso3,
        lang: "en",
        classification: "public",
        addedAt: stamp,
        addedBy: "seed",
      });
    }
  }

  writeFileSync(path.join(outDir, "corpus.jsonl"), `${corpus.join("\n")}\n`);
  console.log(`corpus.jsonl: ${corpus.length} snippets`);

  // Pre-load the RAG chunk store so retrieval (BM25) works offline at startup.
  writeFileSync(
    path.join(process.cwd(), "data", "rag-chunks.json"),
    `${JSON.stringify({ chunks }, null, 2)}\n`,
  );
  console.log(`rag-chunks.json: ${chunks.length} chunks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
