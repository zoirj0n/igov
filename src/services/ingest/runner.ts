import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { COUNTRIES } from "@/lib/data/countries";
import { setAttributes, withSpan } from "@/lib/otel";
import { dbEnabled } from "@/services/database";
import { upsertIndicatorsDb } from "@/services/repo/indicators";
import type { Indicator } from "@/types";
import { fetchEmberFor } from "./ember";
import { fetchImfFor } from "./imf";
import { fetchOecdFor } from "./oecd";
import { upsertIndicators } from "./store";
import { type IngestStats, fetchWorldBankFor } from "./worldbank";

export type SourceKey = "worldbank" | "imf" | "ember" | "oecd";

export interface RunHistoryEntry {
  finishedAt: string;
  durationMs: number;
  rowsUpserted: number;
  errors: number;
  outcome: "ok" | "error";
}

interface SourceStatus {
  key: SourceKey;
  source: string;
  lastRun?: IngestStats;
  status: "idle" | "running" | "ok" | "error";
  freshness: string;
  history?: RunHistoryEntry[];
}

const MAX_HISTORY = 30;

declare global {
  // eslint-disable-next-line no-var
  var __ciRunnerStatus: Record<SourceKey, SourceStatus> | undefined;
}

const STATUS_PATH = path.join(process.cwd(), "data", "runner-status.json");

function defaultStatus(): Record<SourceKey, SourceStatus> {
  return {
    worldbank: { key: "worldbank", source: "World Bank Open Data", status: "idle", freshness: "—" },
    imf: { key: "imf", source: "IMF Datamapper", status: "idle", freshness: "—" },
    ember: { key: "ember", source: "Ember Electricity", status: "idle", freshness: "—" },
    oecd: { key: "oecd", source: "OECD SDMX", status: "idle", freshness: "—" },
  };
}

function loadStatusFromDisk(): Record<SourceKey, SourceStatus> {
  const base = defaultStatus();
  try {
    const raw = readFileSync(STATUS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Record<SourceKey, SourceStatus>>;
    for (const key of Object.keys(base) as SourceKey[]) {
      const p = parsed[key];
      if (p?.lastRun) {
        base[key].lastRun = p.lastRun;
        base[key].status = p.status === "running" ? "idle" : (p.status ?? "idle");
      }
      if (Array.isArray(p?.history)) {
        base[key].history = p.history.slice(-MAX_HISTORY);
      }
    }
  } catch {
    // fresh state
  }
  return base;
}

const status: Record<SourceKey, SourceStatus> = globalThis.__ciRunnerStatus ?? loadStatusFromDisk();
if (!globalThis.__ciRunnerStatus) globalThis.__ciRunnerStatus = status;

function persistStatus(): void {
  try {
    mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
    writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), "utf-8");
  } catch (err) {
    console.error("[runner] persist failed:", err instanceof Error ? err.message : err);
  }
}

export function getStatus(): SourceStatus[] {
  return Object.values(status).map((s) => ({
    ...s,
    freshness: freshnessLabel(s.lastRun?.finishedAt),
  }));
}

function freshnessLabel(ts?: string): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

async function runSource(
  key: SourceKey,
  label: string,
  fetcher: (countries: string[]) => Promise<{ rows: Indicator[]; errors: string[] }>,
): Promise<IngestStats> {
  return withSpan(
    `ingest.${key}`,
    async () => {
      const startedAt = new Date().toISOString();
      const t0 = Date.now();
      status[key].status = "running";

      const iso3List = COUNTRIES.map((c) => c.iso3);
      const { rows, errors } = await withSpan(`ingest.${key}.fetch`, () => fetcher(iso3List), {
        "ingest.source": label,
        "ingest.countries": iso3List.length,
      });
      const upserted = upsertIndicators(rows);
      if (dbEnabled()) {
        await withSpan(`ingest.${key}.db.upsert`, () => upsertIndicatorsDb(rows), {
          "ingest.rows": rows.length,
        });
      }

      const finishedAt = new Date().toISOString();
      const stats: IngestStats = {
        source: label,
        startedAt,
        finishedAt,
        durationMs: Date.now() - t0,
        rowsUpserted: upserted,
        errors,
      };
      status[key].lastRun = stats;
      const outcome: "ok" | "error" = errors.length > 0 && upserted === 0 ? "error" : "ok";
      status[key].status = outcome;
      const history = status[key].history ?? [];
      history.push({
        finishedAt,
        durationMs: stats.durationMs,
        rowsUpserted: upserted,
        errors: errors.length,
        outcome,
      });
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
      status[key].history = history;
      persistStatus();
      setAttributes({
        "ingest.upserted": upserted,
        "ingest.errors": errors.length,
        "ingest.duration_ms": stats.durationMs,
      });
      return stats;
    },
    { "ingest.source": label, "ingest.key": key },
  );
}

const STALE_TTL_MS = 24 * 60 * 60 * 1000;

function isFresh(key: SourceKey): boolean {
  const last = status[key].lastRun?.finishedAt;
  if (!last) return false;
  return Date.now() - new Date(last).getTime() < STALE_TTL_MS;
}

function skipStale(key: SourceKey, label: string): IngestStats {
  const last = status[key].lastRun;
  return {
    source: label,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    rowsUpserted: 0,
    errors: [
      `fresh: last run ${last?.finishedAt} · ${last?.rowsUpserted ?? 0} rows · skipped (force=false)`,
    ],
  };
}

export function runWorldBank(force = true): Promise<IngestStats> {
  if (!force && isFresh("worldbank")) return Promise.resolve(skipStale("worldbank", "World Bank"));
  return runSource("worldbank", "World Bank", fetchWorldBankFor);
}

export function runImf(force = true): Promise<IngestStats> {
  if (!force && isFresh("imf")) return Promise.resolve(skipStale("imf", "IMF"));
  return runSource("imf", "IMF", fetchImfFor);
}

export function runEmber(force = true): Promise<IngestStats> {
  if (!force && isFresh("ember")) return Promise.resolve(skipStale("ember", "Ember"));
  return runSource("ember", "Ember", fetchEmberFor);
}

export function runOecd(force = true): Promise<IngestStats> {
  if (!force && isFresh("oecd")) return Promise.resolve(skipStale("oecd", "OECD"));
  return runSource("oecd", "OECD", fetchOecdFor);
}

export function runByKey(key: SourceKey, force = true): Promise<IngestStats> {
  if (key === "worldbank") return runWorldBank(force);
  if (key === "imf") return runImf(force);
  if (key === "ember") return runEmber(force);
  if (key === "oecd") return runOecd(force);
  throw new Error(`unknown source: ${key}`);
}
