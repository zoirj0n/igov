import type { Indicator } from "@/types";

const BASE = process.env.WORLDBANK_API_BASE ?? "https://api.worldbank.org/v2";

interface WbDatum {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
  unit: string;
  scale: string;
  decimal: number;
}

interface MetricMap {
  code: string;
  metric: string;
  unit: string;
}

const METRICS: MetricMap[] = [
  { code: "NY.GDP.MKTP.CD", metric: "gdp_usd_nominal", unit: "USD" },
  { code: "NY.GDP.MKTP.KD.ZG", metric: "gdp_growth_pct", unit: "%" },
  { code: "SP.POP.TOTL", metric: "population", unit: "people" },
  { code: "EN.ATM.CO2E.PC", metric: "co2_per_capita_t", unit: "t" },
  { code: "EG.FEC.RNEW.ZS", metric: "renewables_share_pct", unit: "%" },
  { code: "NE.EXP.GNFS.CD", metric: "exports_usd", unit: "USD" },
  { code: "BX.KLT.DINV.CD.WD", metric: "fdi_inflows_usd", unit: "USD" },
  { code: "IT.NET.USER.ZS", metric: "internet_users_pct", unit: "%" },
  { code: "IT.CEL.SETS.P2", metric: "mobile_per_100", unit: "per100" },
  { code: "SE.SEC.ENRR", metric: "secondary_enrollment_pct", unit: "%" },
  { code: "SH.XPD.CHEX.GD.ZS", metric: "health_expend_pct_gdp", unit: "%" },
  { code: "EG.USE.ELEC.KH.PC", metric: "electricity_kwh_per_capita", unit: "kWh" },
];

export interface IngestStats {
  source: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  rowsUpserted: number;
  errors: string[];
}

export async function fetchWorldBankFor(
  countries: string[],
): Promise<{ rows: Indicator[]; errors: string[] }> {
  const rows: Indicator[] = [];
  const errors: string[] = [];
  const iso3List = countries.join(";");

  for (const m of METRICS) {
    const url = `${BASE}/country/${iso3List}/indicator/${m.code}?format=json&per_page=2000&date=2018:2025`;
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        errors.push(`${m.code}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as unknown;
      if (!Array.isArray(json) || json.length < 2) {
        errors.push(`${m.code}: unexpected payload shape`);
        continue;
      }
      const data = json[1] as WbDatum[] | null;
      if (!Array.isArray(data)) {
        errors.push(`${m.code}: no data array`);
        continue;
      }
      const latestPerCountry: Record<string, WbDatum> = {};
      for (const d of data) {
        if (d.value === null || d.value === undefined) continue;
        const iso3 = d.countryiso3code;
        if (!iso3) continue;
        const yr = Number.parseInt(d.date, 10);
        if (!Number.isFinite(yr)) continue;
        const existing = latestPerCountry[iso3];
        if (!existing || yr > Number.parseInt(existing.date, 10)) {
          latestPerCountry[iso3] = d;
        }
      }
      for (const d of Object.values(latestPerCountry)) {
        const year = Number.parseInt(d.date, 10);
        const value = d.value as number;
        rows.push({
          id: `${d.countryiso3code}-${m.metric}-${year}`,
          countryIso3: d.countryiso3code,
          metric: m.metric,
          value,
          unit: m.unit,
          year,
          source: "World Bank",
          confidence: "high",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${m.code}: ${msg}`);
    }
  }

  return { rows, errors };
}
