const BASE = process.env.WORLDBANK_API_BASE ?? "https://api.worldbank.org/v2";

export interface HistoricalPoint {
  year: number;
  value: number;
}

interface WbDatum {
  countryiso3code: string;
  date: string;
  value: number | null;
}

const METRIC_TO_WB: Record<string, string> = {
  gdp_usd_nominal: "NY.GDP.MKTP.CD",
  gdp_growth_pct: "NY.GDP.MKTP.KD.ZG",
  population: "SP.POP.TOTL",
  co2_per_capita_t: "EN.ATM.CO2E.PC",
  renewables_share_pct: "EG.FEC.RNEW.ZS",
  exports_usd: "NE.EXP.GNFS.CD",
  fdi_inflows_usd: "BX.KLT.DINV.CD.WD",
};

const CACHE = new Map<string, { ts: number; data: HistoricalPoint[] }>();
const TTL_MS = 60 * 60 * 1000;

export function isPredictableMetric(metric: string): boolean {
  return metric in METRIC_TO_WB;
}

export async function fetchHistorical(
  iso3: string,
  metric: string,
  fromYear = 2000,
  toYear = 2025,
): Promise<HistoricalPoint[]> {
  const code = METRIC_TO_WB[metric];
  if (!code) throw new Error(`metric not predictable: ${metric}`);

  const key = `${iso3}|${metric}|${fromYear}-${toYear}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.data;

  const url = `${BASE}/country/${iso3}/indicator/${code}?format=json&per_page=1000&date=${fromYear}:${toYear}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`World Bank ${res.status}`);
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json) || json.length < 2) throw new Error("unexpected payload");
  const data = json[1] as WbDatum[] | null;
  if (!Array.isArray(data)) throw new Error("no data array");

  const out: HistoricalPoint[] = [];
  for (const d of data) {
    if (d.value === null || d.value === undefined) continue;
    const yr = Number.parseInt(d.date, 10);
    if (!Number.isFinite(yr)) continue;
    out.push({ year: yr, value: d.value });
  }
  out.sort((a, b) => a.year - b.year);

  CACHE.set(key, { ts: Date.now(), data: out });
  return out;
}
