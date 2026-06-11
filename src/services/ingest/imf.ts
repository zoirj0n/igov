import type { Indicator } from "@/types";

const BASE = process.env.IMF_API_BASE ?? "https://www.imf.org/external/datamapper/api/v1";

interface ImfPayload {
  values?: Record<string, Record<string, Record<string, number>>>;
}

interface MetricMap {
  imfCode: string;
  metric: string;
  unit: string;
}

const METRICS: MetricMap[] = [
  { imfCode: "NGDP_RPCH", metric: "gdp_growth_pct", unit: "%" },
  { imfCode: "PCPIPCH", metric: "inflation_pct", unit: "%" },
  { imfCode: "LUR", metric: "unemployment_pct", unit: "%" },
  { imfCode: "GGXWDG_NGDP", metric: "debt_to_gdp_pct", unit: "%" },
  { imfCode: "BCA_NGDPD", metric: "current_account_pct", unit: "%" },
];

export async function fetchImfFor(
  countries: string[],
): Promise<{ rows: Indicator[]; errors: string[] }> {
  const rows: Indicator[] = [];
  const errors: string[] = [];

  for (const m of METRICS) {
    const url = `${BASE}/${m.imfCode}`;
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) {
        errors.push(`${m.imfCode}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as ImfPayload;
      const block = json.values?.[m.imfCode];
      if (!block) {
        errors.push(`${m.imfCode}: missing values block`);
        continue;
      }
      for (const iso3 of countries) {
        const series = block[iso3];
        if (!series) continue;
        const years = Object.keys(series)
          .map((y) => Number.parseInt(y, 10))
          .filter((y) => Number.isFinite(y))
          .sort((a, b) => b - a);
        let picked: { year: number; value: number } | null = null;
        const currentYear = new Date().getUTCFullYear();
        for (const y of years) {
          if (y > currentYear) continue;
          const v = series[String(y)];
          if (typeof v !== "number" || !Number.isFinite(v)) continue;
          picked = { year: y, value: v };
          break;
        }
        if (!picked) continue;
        rows.push({
          id: `${iso3}-${m.metric}-${picked.year}`,
          countryIso3: iso3,
          metric: m.metric,
          value: picked.value,
          unit: m.unit,
          year: picked.year,
          source: "IMF",
          confidence: "high",
        });
      }
    } catch (err) {
      errors.push(`${m.imfCode}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { rows, errors };
}
