import { readFileSync } from "node:fs";
import path from "node:path";

export interface DataSource {
  source: string;
  url: string;
  category: SourceCategory;
  coverage: string;
  bestUse: string;
}

export type SourceCategory =
  | "International datasets"
  | "Economic indicators"
  | "Energy statistics"
  | "Energy and sustainability"
  | "Sustainability reports"
  | "Competitiveness indexes"
  | "Trade and agreements"
  | "Public international reports"
  | "Government publications"
  | "Regional sources"
  | "Executive materials";

const CSV_PATH = path.join(process.cwd(), "data", "sources.csv");

let cache: DataSource[] | null = null;

export function loadCatalog(): DataSource[] {
  if (cache) return cache;
  const raw = readFileSync(CSV_PATH, "utf-8");
  cache = parseCsv(raw);
  return cache;
}

export function byCategory(category: SourceCategory): DataSource[] {
  return loadCatalog().filter((s) => s.category === category);
}

export function findSource(query: string): DataSource[] {
  const q = query.toLowerCase();
  return loadCatalog().filter(
    (s) =>
      s.source.toLowerCase().includes(q) ||
      s.coverage.toLowerCase().includes(q) ||
      s.bestUse.toLowerCase().includes(q),
  );
}

export function categories(): SourceCategory[] {
  const set = new Set<SourceCategory>();
  for (const s of loadCatalog()) set.add(s.category);
  return [...set];
}

function parseCsv(text: string): DataSource[] {
  const rows = splitCsvRows(text);
  const header = rows[0]?.map((c) => c.toLowerCase());
  if (!header || header[0] !== "source") {
    throw new Error("sources.csv missing expected header");
  }
  const out: DataSource[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 5) continue;
    out.push({
      source: row[0] ?? "",
      url: row[1] ?? "",
      category: (row[2] ?? "") as SourceCategory,
      coverage: row[3] ?? "",
      bestUse: row[4] ?? "",
    });
  }
  return out;
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuote = true;
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
