export interface TimeSeriesPoint {
  year: number;
  value: number;
}

function seedRand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function seriesFor(
  iso3: string,
  metric: string,
  latest: number,
  years = 5,
): TimeSeriesPoint[] {
  const rand = seedRand(`${iso3}-${metric}`);
  const out: TimeSeriesPoint[] = [];
  const drift = rand() * 0.06 + 0.01;
  const startYear = 2026 - years + 1;
  for (let i = 0; i < years; i++) {
    const t = (years - 1 - i) / Math.max(1, years - 1);
    const value = latest * (1 - drift * t) * (1 + (rand() - 0.5) * 0.04);
    out.push({ year: startYear + i, value: Math.max(0, value) });
  }
  return out;
}
