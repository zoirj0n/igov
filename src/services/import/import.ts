import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { recordImportResult } from "@/lib/sources/importResults";
import { type ManifestSource, findSourceByCacheKey, loadManifest } from "@/lib/sources/manifest";
import { runAiExtract } from "@/services/ingest/ai-extract";
import { runCsvSource } from "@/services/ingest/csv";
import { runByKey } from "@/services/ingest/runner";
import type { IngestStats } from "@/services/ingest/worldbank";
import { type Classification, classifySource } from "./classifier";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ImportResult {
  cacheKey: string;
  category: string;
  source: ManifestSource;
  fetched: boolean;
  cachedAt: string;
  bytes: number;
  classification: Classification;
  ingest?: IngestStats | { skipped: true; reason: string };
}

function cachePath(category: string, cacheKey: string): string {
  return path.join(process.cwd(), "agent-resources", category, `${cacheKey}.cache.html`);
}

async function readCacheIfFresh(p: string): Promise<{ text: string; mtimeMs: number } | null> {
  try {
    const s = await stat(p);
    if (Date.now() - s.mtimeMs > CACHE_TTL_MS) return null;
    const text = await readFile(p, "utf-8");
    return { text, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

export async function importSource(
  cacheKey: string,
  force = false,
  actor = "system",
): Promise<ImportResult> {
  const hit = findSourceByCacheKey(cacheKey);
  if (!hit) throw new Error(`unknown source: ${cacheKey}`);
  const { category, source } = hit;
  const target = cachePath(category, cacheKey);

  let body: string;
  let fetched = false;
  let bytes = 0;
  let mtime = Date.now();

  if (!force) {
    const cached = await readCacheIfFresh(target);
    if (cached) {
      body = cached.text;
      bytes = body.length;
      mtime = cached.mtimeMs;
    } else {
      const out = await fetchAndCache(source.url, target);
      body = out.body;
      bytes = out.bytes;
      fetched = true;
    }
  } else {
    const out = await fetchAndCache(source.url, target);
    body = out.body;
    bytes = out.bytes;
    fetched = true;
  }

  const classification = await classifySource(source, category, body, { actor });

  let ingest: ImportResult["ingest"];
  const r = classification.runner;
  if (r === "csv") {
    try {
      ingest = await runCsvSource(source);
    } catch (err) {
      ingest = {
        skipped: true,
        reason: `csv runner failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else if (r === "ai-extract") {
    try {
      ingest = await runAiExtract(source, { actor });
    } catch (err) {
      ingest = {
        skipped: true,
        reason: `ai-extract failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else if (r) {
    try {
      ingest = await runByKey(r, force);
    } catch (err) {
      ingest = {
        skipped: true,
        reason: `runner ${r} failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else {
    ingest = { skipped: true, reason: classification.reason };
  }

  const result: ImportResult = {
    cacheKey,
    category,
    source,
    fetched,
    cachedAt: new Date(mtime).toISOString(),
    bytes,
    classification,
    ingest,
  };

  const ingestRec = result.ingest;
  const rows = ingestRec && "rowsUpserted" in ingestRec ? ingestRec.rowsUpserted : 0;
  const errArr =
    ingestRec && "errors" in ingestRec && Array.isArray(ingestRec.errors) ? ingestRec.errors : [];
  const skipped = Boolean(ingestRec && "skipped" in ingestRec && ingestRec.skipped);
  const reason =
    ingestRec && "reason" in ingestRec && typeof ingestRec.reason === "string"
      ? ingestRec.reason
      : classification.reason;
  await recordImportResult({
    cacheKey,
    runner: classification.runner,
    rows,
    errors: errArr.length,
    errorSample: errArr.slice(0, 5),
    skipped,
    bytes,
    reason,
    ts: new Date().toISOString(),
    actor,
  });

  return result;
}

async function fetchAndCache(
  url: string,
  target: string,
): Promise<{ body: string; bytes: number }> {
  await mkdir(path.dirname(target), { recursive: true });
  if (url.startsWith("local://")) {
    const rel = url.slice("local://".length);
    const localPath = path.join(process.cwd(), "agent-resources", rel);
    const body = await readFile(localPath, "utf-8");
    await writeFile(target, body, "utf-8");
    return { body, bytes: body.length };
  }
  if (!url.startsWith("http")) {
    throw new Error(`url not fetchable: ${url}`);
  }
  const res = await fetch(url, {
    headers: {
      accept: "text/html,application/json,text/csv,*/*",
      "user-agent": "CountryIntel/1.0 (source-import)",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url}`);
  const body = await res.text();
  await writeFile(target, body, "utf-8");
  return { body, bytes: body.length };
}

export async function importAll(
  opts: { force?: boolean; max?: number; actor?: string } = {},
): Promise<ImportResult[]> {
  const manifest = loadManifest();
  const all: { cacheKey: string }[] = [];
  for (const cat of Object.values(manifest.categories)) {
    for (const s of cat.sources) all.push({ cacheKey: s.cacheKey });
  }
  const limit = opts.max ?? all.length;
  const picked = all.slice(0, limit);
  const results: ImportResult[] = [];
  const actor = opts.actor ?? "system";
  for (const { cacheKey } of picked) {
    try {
      results.push(await importSource(cacheKey, opts.force ?? false, actor));
    } catch (err) {
      results.push({
        cacheKey,
        category: "unknown",
        source: { name: cacheKey, url: "", coverage: "", bestUse: "", cacheKey },
        fetched: false,
        cachedAt: new Date().toISOString(),
        bytes: 0,
        classification: {
          runner: null,
          reason: err instanceof Error ? err.message : String(err),
          confidence: "low",
          usedRealApi: false,
        },
        ingest: { skipped: true, reason: "import failed" },
      });
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return results;
}
