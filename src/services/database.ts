import { Pool, type QueryResultRow } from "pg";
import { logger } from "../utils/logger";

declare global {
  // eslint-disable-next-line no-var
  var __ciPgPool: Pool | undefined;
}

const USE_DB = process.env.USE_DB === "1";
const connectionString = process.env.DATABASE_URL;

export function dbEnabled(): boolean {
  return USE_DB && Boolean(connectionString);
}

function ensurePool(): Pool | null {
  if (!USE_DB || !connectionString) return null;
  if (globalThis.__ciPgPool) return globalThis.__ciPgPool;
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });
  pool.on("error", (err) => {
    logger.error({ err }, "pg pool error");
  });
  globalThis.__ciPgPool = pool;
  return pool;
}

export const pool: Pool | null = ensurePool();

export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const p = ensurePool();
  if (!p) throw new Error("DATABASE_URL not set or USE_DB!=1");
  const { rows } = await p.query<T>(text, params as unknown[]);
  return rows;
}

export async function ping(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const p = ensurePool();
  if (!p) return { ok: false, error: "USE_DB=0 or DATABASE_URL missing" };
  const t0 = Date.now();
  try {
    await p.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
