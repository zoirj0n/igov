import type { Indicator } from "@/types";
import { resolveEmberCsvUrl } from "./ember-resolver";

const FALLBACK_URLS = [
  "https://ember-energy.org/app/uploads/2024/05/yearly_electricity_data.csv",
  "https://ember-climate.org/app/uploads/2024/05/yearly_electricity_data.csv",
];

async function candidateUrls(): Promise<string[]> {
  const resolved = await resolveEmberCsvUrl();
  const out: string[] = [];
  if (resolved) out.push(resolved);
  for (const u of FALLBACK_URLS) if (!out.includes(u)) out.push(u);
  return out;
}

const METRIC_MAP: Record<string, { metric: string; unit: string }> = {
  "Renewables (% electricity)": { metric: "electricity_renewables_pct", unit: "%" },
  "Coal (% electricity)": { metric: "electricity_coal_pct", unit: "%" },
  "Gas (% electricity)": { metric: "electricity_gas_pct", unit: "%" },
  "Nuclear (% electricity)": { metric: "electricity_nuclear_pct", unit: "%" },
  "Solar (% electricity)": { metric: "electricity_solar_pct", unit: "%" },
  "Wind (% electricity)": { metric: "electricity_wind_pct", unit: "%" },
};

interface Row {
  countryIso3: string;
  year: number;
  category: string;
  variable: string;
  value: number | null;
  unit: string;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch === "\r") {
      // skip
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export async function fetchEmberFor(
  countries: string[],
): Promise<{ rows: Indicator[]; errors: string[] }> {
  const errors: string[] = [];
  let text: string | null = null;
  let sourceUrl = "";

  const urls = await candidateUrls();
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { accept: "text/csv" } });
      if (!res.ok) {
        errors.push(`Ember ${url}: HTTP ${res.status}`);
        continue;
      }
      text = await res.text();
      sourceUrl = url;
      break;
    } catch (err) {
      errors.push(`Ember ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!text) {
    return { rows: [], errors: [...errors, "Ember: no candidate URL succeeded"] };
  }

  const csv = parseCsv(text);
  const header = csv[0];
  if (!header) return { rows: [], errors: ["Ember: empty CSV"] };
  const colIdx = (name: string): number =>
    header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const idxIso = colIdx("Country code");
  const idxYear = colIdx("Year");
  const idxCat = colIdx("Category");
  const idxVar = colIdx("Variable");
  const _idxUnit = colIdx("Unit");
  const idxValue = colIdx("Value");
  if (idxIso < 0 || idxYear < 0 || idxVar < 0 || idxValue < 0) {
    return {
      rows: [],
      errors: [`Ember: unexpected schema, headers=${header.slice(0, 10).join(",")}`],
    };
  }

  const allowed = new Set(countries);
  const parsed: Row[] = [];
  for (let i = 1; i < csv.length; i++) {
    const r = csv[i];
    if (!r || r.length < 4) continue;
    const iso = (r[idxIso] ?? "").toUpperCase();
    if (!allowed.has(iso)) continue;
    const yr = Number.parseInt(r[idxYear] ?? "", 10);
    if (!Number.isFinite(yr)) continue;
    const variable = (r[idxVar] ?? "").trim();
    const map = METRIC_MAP[variable];
    if (!map) continue;
    const v = Number.parseFloat(r[idxValue] ?? "");
    if (!Number.isFinite(v)) continue;
    parsed.push({
      countryIso3: iso,
      year: yr,
      category: (r[idxCat] ?? "").trim(),
      variable,
      value: v,
      unit: map.unit,
    });
  }

  const latestByKey = new Map<string, Row>();
  for (const r of parsed) {
    const key = `${r.countryIso3}|${r.variable}`;
    const existing = latestByKey.get(key);
    if (!existing || r.year > existing.year) latestByKey.set(key, r);
  }

  const rows: Indicator[] = [];
  for (const r of latestByKey.values()) {
    const map = METRIC_MAP[r.variable];
    if (!map) continue;
    rows.push({
      id: `${r.countryIso3}-${map.metric}-${r.year}`,
      countryIso3: r.countryIso3,
      metric: map.metric,
      value: r.value ?? 0,
      unit: map.unit,
      year: r.year,
      source: "Ember",
      confidence: "high",
    });
  }

  if (sourceUrl) errors.push(`Ember: ingested from ${sourceUrl}`);
  return { rows, errors };
}
