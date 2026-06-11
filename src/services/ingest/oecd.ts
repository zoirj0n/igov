import type { Indicator } from "@/types";

const BASE = process.env.OECD_API_BASE ?? "https://sdmx.oecd.org/public/rest/data";

interface MetricMap {
  dataflow: string;
  filter: string;
  metric: string;
  unit: string;
  description: string;
}

const METRICS: MetricMap[] = [
  {
    dataflow: "OECD.SDD.NAD,DSD_NAAG@DF_NAAG_VI,2.0",
    filter: "A.GDP_PC.USD_PPP_PS.{COUNTRIES}",
    metric: "gdp_per_capita_ppp_usd",
    unit: "USD",
    description: "GDP per capita PPP USD",
  },
];

interface SdmxJsonData {
  data?: {
    dataSets?: Array<{
      observations?: Record<string, [number | null, ...unknown[]]>;
    }>;
    structure?: {
      dimensions?: {
        observation?: Array<{
          id: string;
          values: Array<{ id: string; name?: string }>;
        }>;
      };
    };
  };
}

export async function fetchOecdFor(
  countries: string[],
): Promise<{ rows: Indicator[]; errors: string[] }> {
  const rows: Indicator[] = [];
  const errors: string[] = [];

  for (const m of METRICS) {
    const filter = m.filter.replace("{COUNTRIES}", countries.join("+"));
    const url = `${BASE}/${m.dataflow}/${filter}?dimensionAtObservation=AllDimensions&format=jsondata&startPeriod=2018`;
    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/vnd.sdmx.data+json;version=1.0,application/json",
          "user-agent": "CountryIntel/1.0",
        },
      });
      if (!res.ok) {
        errors.push(`${m.metric}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as SdmxJsonData;
      const ds = json.data?.dataSets?.[0];
      const obs = ds?.observations;
      const dims = json.data?.structure?.dimensions?.observation ?? [];
      if (!obs || dims.length === 0) {
        errors.push(`${m.metric}: empty payload`);
        continue;
      }
      const refIdx = dims.findIndex((d) => d.id === "REF_AREA");
      const timeIdx = dims.findIndex((d) => d.id === "TIME_PERIOD");
      if (refIdx < 0 || timeIdx < 0) {
        errors.push(`${m.metric}: missing REF_AREA/TIME_PERIOD dims`);
        continue;
      }

      const latestPerCountry: Record<string, { year: number; value: number }> = {};
      for (const [key, val] of Object.entries(obs)) {
        const parts = key.split(":").map((x) => Number.parseInt(x, 10));
        const refOrdinal = parts[refIdx];
        const timeOrdinal = parts[timeIdx];
        if (refOrdinal === undefined || timeOrdinal === undefined) continue;
        const iso = dims[refIdx]?.values[refOrdinal]?.id;
        const yearStr = dims[timeIdx]?.values[timeOrdinal]?.id;
        if (!iso || !yearStr) continue;
        const year = Number.parseInt(yearStr, 10);
        const value = val[0];
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        if (!countries.includes(iso)) continue;
        const cur = latestPerCountry[iso];
        if (!cur || year > cur.year) latestPerCountry[iso] = { year, value };
      }

      for (const [iso, { year, value }] of Object.entries(latestPerCountry)) {
        rows.push({
          id: `${iso}-${m.metric}-${year}`,
          countryIso3: iso,
          metric: m.metric,
          value,
          unit: m.unit,
          year,
          source: "OECD",
          confidence: "high",
        });
      }
    } catch (err) {
      errors.push(`${m.metric}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { rows, errors };
}
