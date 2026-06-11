import type { Indicator } from "@/types";

declare global {
  // eslint-disable-next-line no-var
  var __ciIngestStore: Map<string, Indicator> | undefined;
}

const live: Map<string, Indicator> = globalThis.__ciIngestStore ?? new Map();
if (!globalThis.__ciIngestStore) {
  globalThis.__ciIngestStore = live;
}

function keyOf(countryIso3: string, metric: string, year: number): string {
  return `${countryIso3}|${metric}|${year}`;
}

export function upsertIndicators(rows: Indicator[]): number {
  let n = 0;
  for (const row of rows) {
    live.set(keyOf(row.countryIso3, row.metric, row.year), row);
    n++;
  }
  return n;
}

export function liveFor(iso3: string, metric: string): Indicator | undefined {
  let best: Indicator | undefined;
  for (const v of live.values()) {
    if (v.countryIso3 !== iso3 || v.metric !== metric) continue;
    if (!best || v.year > best.year) best = v;
  }
  return best;
}

export function liveCount(): number {
  return live.size;
}

export function liveByCountry(iso3: string): Indicator[] {
  const out: Indicator[] = [];
  for (const v of live.values()) {
    if (v.countryIso3 === iso3) out.push(v);
  }
  return out;
}

export function clearLive(): void {
  live.clear();
}
