import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ImportResultRecord {
  cacheKey: string;
  runner: string | null;
  rows: number;
  errors: number;
  errorSample: string[];
  skipped: boolean;
  bytes: number;
  reason: string;
  ts: string;
  actor: string;
}

const STORE_PATH = path.join(process.cwd(), "data", "import-results.json");
const MAX_HISTORY = 500;

let cache: Record<string, ImportResultRecord> | null = null;

export async function loadImportResults(): Promise<Record<string, ImportResultRecord>> {
  if (cache !== null) return cache;
  try {
    const raw = await readFile(STORE_PATH, "utf-8");
    cache = JSON.parse(raw) as Record<string, ImportResultRecord>;
  } catch {
    cache = {};
  }
  return cache;
}

export async function recordImportResult(rec: ImportResultRecord): Promise<void> {
  const current = await loadImportResults();
  current[rec.cacheKey] = rec;
  const keys = Object.keys(current);
  if (keys.length > MAX_HISTORY) {
    const sorted = keys
      .map((k) => ({ k, ts: current[k]?.ts ?? "" }))
      .sort((a, b) => a.ts.localeCompare(b.ts));
    const toDrop = sorted.slice(0, keys.length - MAX_HISTORY);
    for (const { k } of toDrop) delete current[k];
  }
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(current, null, 2), "utf-8");
  cache = current;
}

export function clearImportResultsCache(): void {
  cache = null;
}
