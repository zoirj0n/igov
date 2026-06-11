import { readFile } from "node:fs/promises";
import path from "node:path";
import { COUNTRIES } from "@/lib/data/countries";
import { setAttributes, withSpan } from "@/lib/otel";
import type { ManifestSource } from "@/lib/sources/manifest";
import { dbEnabled } from "@/services/database";
import { upsertIndicatorsDb } from "@/services/repo/indicators";
import type { Indicator } from "@/types";
import { upsertIndicators } from "./store";
import type { IngestStats } from "./worldbank";

const ISO3_BY_NAME = new Map<string, string>();
for (const c of COUNTRIES) {
  ISO3_BY_NAME.set(c.iso3.toLowerCase(), c.iso3);
  ISO3_BY_NAME.set(c.nameEn.toLowerCase(), c.iso3);
  if (c.nameAr) ISO3_BY_NAME.set(c.nameAr.toLowerCase(), c.iso3);
}

const ISO_ALIASES: Record<string, string> = {
  uae: "ARE",
  ksa: "SAU",
  uk: "GBR",
  britain: "GBR",
  "great britain": "GBR",
  us: "USA",
  "u.s.": "USA",
  "u.s.a.": "USA",
  america: "USA",
  korea: "KOR",
  "south korea": "KOR",
  "republic of korea": "KOR",
  russia: "RUS",
  "russian federation": "RUS",
  iran: "IRN",
  "islamic republic of iran": "IRN",
  egypt: "EGY",
  "arab republic of egypt": "EGY",
  syria: "SYR",
  "syrian arab republic": "SYR",
  vietnam: "VNM",
  "viet nam": "VNM",
  laos: "LAO",
  "lao pdr": "LAO",
  taiwan: "TWN",
  "chinese taipei": "TWN",
};
for (const [alias, iso] of Object.entries(ISO_ALIASES)) {
  if (!ISO3_BY_NAME.has(alias)) ISO3_BY_NAME.set(alias, iso);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? "";
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"') inQ = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickCol(headers: string[], candidates: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (candidates.includes(headers[i] ?? "")) return i;
  }
  return -1;
}

function resolveIso3(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  const aliased = ISO3_BY_NAME.get(key);
  if (aliased) return aliased;
  if (key.length === 3 && /^[a-z]{3}$/.test(key)) {
    const upper = key.toUpperCase();
    if (COUNTRIES.some((c) => c.iso3 === upper)) return upper;
  }
  return null;
}

function parseNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,\s%]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export interface CsvParseSummary {
  totalRows: number;
  validRows: number;
  skipped: { row: number; reason: string }[];
  columns: {
    iso: number;
    metric: number;
    year: number;
    value: number;
    unit: number;
    source: number;
  };
}

export function parseCsvToIndicators(
  body: string,
  defaultSource: string,
): { rows: Indicator[]; summary: CsvParseSummary } {
  const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      rows: [],
      summary: {
        totalRows: 0,
        validRows: 0,
        skipped: [],
        columns: { iso: -1, metric: -1, year: -1, value: -1, unit: -1, source: -1 },
      },
    };
  }
  // Skip xlsx multi-sheet markers like "### Sheet: foo"
  const dataLines = lines.filter((l) => !l.startsWith("### "));
  const headerLine = dataLines[0] ?? "";
  const headers = splitCsvLine(headerLine).map(normHeader);
  const cols = {
    iso: pickCol(headers, ["country", "iso", "iso3", "country_code", "code", "nation"]),
    metric: pickCol(headers, ["indicator", "metric", "series", "variable"]),
    year: pickCol(headers, ["year", "date", "period"]),
    value: pickCol(headers, ["value", "val", "amount", "obs_value"]),
    unit: pickCol(headers, ["unit", "units", "uom"]),
    source: pickCol(headers, ["source", "publisher"]),
  };
  if (cols.iso < 0 || cols.metric < 0 || cols.year < 0 || cols.value < 0) {
    return {
      rows: [],
      summary: {
        totalRows: dataLines.length - 1,
        validRows: 0,
        skipped: [{ row: 0, reason: "missing required headers (country, indicator, year, value)" }],
        columns: cols,
      },
    };
  }
  const rows: Indicator[] = [];
  const skipped: { row: number; reason: string }[] = [];
  for (let r = 1; r < dataLines.length; r++) {
    const line = dataLines[r] ?? "";
    const fields = splitCsvLine(line);
    const iso = resolveIso3(fields[cols.iso] ?? "");
    if (!iso) {
      skipped.push({ row: r, reason: `unknown country: ${fields[cols.iso]}` });
      continue;
    }
    const metric = (fields[cols.metric] ?? "").trim();
    if (!metric) {
      skipped.push({ row: r, reason: "blank metric" });
      continue;
    }
    const yearN = parseNumber(fields[cols.year] ?? "");
    if (yearN === null || yearN < 1900 || yearN > 2100) {
      skipped.push({ row: r, reason: `bad year: ${fields[cols.year]}` });
      continue;
    }
    const valueN = parseNumber(fields[cols.value] ?? "");
    if (valueN === null) {
      skipped.push({ row: r, reason: `bad value: ${fields[cols.value]}` });
      continue;
    }
    const unit = cols.unit >= 0 ? (fields[cols.unit] ?? "").trim() : "";
    const source =
      cols.source >= 0 && fields[cols.source] ? (fields[cols.source] ?? "").trim() : defaultSource;
    const year = Math.trunc(yearN);
    rows.push({
      id: `${iso}-${metric}-${year}`,
      countryIso3: iso,
      metric,
      value: valueN,
      unit,
      year,
      source,
      confidence: "med",
    });
  }
  return {
    rows,
    summary: {
      totalRows: dataLines.length - 1,
      validRows: rows.length,
      skipped: skipped.slice(0, 20),
      columns: cols,
    },
  };
}

export async function runCsvSource(source: ManifestSource): Promise<IngestStats> {
  return withSpan(
    "ingest.csv",
    async () => {
      const startedAt = new Date().toISOString();
      const t0 = Date.now();
      if (!source.url.startsWith("local://")) {
        throw new Error(`csv runner only supports local:// URLs, got ${source.url}`);
      }
      const rel = source.url.slice("local://".length);
      const localPath = path.join(process.cwd(), "agent-resources", rel);
      const body = await readFile(localPath, "utf-8");
      const { rows, summary } = parseCsvToIndicators(body, source.name);
      const upserted = upsertIndicators(rows);
      if (dbEnabled()) {
        await withSpan("ingest.csv.db.upsert", () => upsertIndicatorsDb(rows), {
          "ingest.rows": rows.length,
        });
      }
      const finishedAt = new Date().toISOString();
      const errors = summary.skipped.map((s) => `row ${s.row}: ${s.reason}`);
      setAttributes({
        "ingest.upserted": upserted,
        "ingest.skipped": summary.skipped.length,
        "ingest.total": summary.totalRows,
        "ingest.duration_ms": Date.now() - t0,
      });
      return {
        source: `csv:${source.cacheKey}`,
        startedAt,
        finishedAt,
        durationMs: Date.now() - t0,
        rowsUpserted: upserted,
        errors,
      };
    },
    { "ingest.source": source.name, "ingest.cacheKey": source.cacheKey },
  );
}
