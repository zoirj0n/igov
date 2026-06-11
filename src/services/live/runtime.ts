/**
 * Shared runtime for the live-data tool layer: an air-gap toggle, a tiny
 * in-memory TTL cache, and timeout/parallel helpers. Every live source goes
 * through here so the demo stays resilient (live → cache → seed) and can be
 * flipped fully offline.
 */

/** When air-gapped, tools skip all network calls and serve cache/seed only.
 * Always on under Vitest so unit tests stay offline and deterministic. */
export function isAirgapped(): boolean {
  return (
    process.env.VITEST === "true" ||
    process.env.AGENT_AIRGAP === "1" ||
    process.env.AGENT_AIRGAP === "true"
  );
}

/** Provenance attached to live results so the UI can show "as of … · source". */
export interface Freshness {
  source: string; // e.g. "World Bank", "IMF", "UN Comtrade", "Tavily"
  live: boolean; // true = fetched this request, false = cache/seed fallback
  asOf?: string | number; // year or ISO date of the underlying datum
}

// ── tiny TTL cache (process-global so it survives HMR / per-request) ──────────
interface Entry {
  value: unknown;
  expires: number;
}
const g = globalThis as unknown as { __ciLiveCache?: Map<string, Entry> };
if (!g.__ciLiveCache) g.__ciLiveCache = new Map();
const store: Map<string, Entry> = g.__ciLiveCache;

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (e.expires < nowMs()) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expires: nowMs() + ttlMs });
  return value;
}

/**
 * Live-first with cache + graceful fallback. Tries the cache, then the live
 * fetch (skipped when air-gapped), then `fallback`. A successful live result is
 * cached; on any failure the last-known cache (even if expired) or `fallback`
 * is returned so a flaky API never breaks a run.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  fallback: () => T,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  if (isAirgapped()) return fallback();
  try {
    return cacheSet(key, await fetcher(), ttlMs);
  } catch {
    const stale = store.get(key)?.value as T | undefined;
    return stale ?? fallback();
  }
}

/** Reject after `ms`, so a single slow upstream can't stall a request. */
export function withTimeout<T>(p: Promise<T>, ms: number, label = "upstream"): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)),
  ]);
}

// new Date()/Date.now() are fine in app code (only forbidden inside Workflow scripts).
function nowMs(): number {
  return Date.now();
}
