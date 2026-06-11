/**
 * UN Comtrade — real bilateral trade between the UAE and a partner country.
 * Uses the free public preview endpoint (no key, ≤500 rows/call); set
 * COMTRADE_KEY to use the authenticated endpoint for higher limits.
 *
 * `primaryValue` is the canonical USD figure (CIF on imports, FOB on exports).
 */
import { withCache, withTimeout } from "@/services/live/runtime";

const PREVIEW = "https://comtradeapi.un.org/public/v1/preview/C/A/HS";
const AUTHED = "https://comtradeapi.un.org/data/v1/get/C/A/HS";

// ISO3 → UN M49 numeric code (Comtrade uses M49). Covers the major trading
// partners; countries not listed simply return no trade row (graceful — the
// other live sources still provide data).
const M49: Record<string, string> = {
  // seed twelve (USA/FRA use the Comtrade "incl. territories" variants)
  ARE: "784",
  SAU: "682",
  USA: "842",
  GBR: "826",
  FRA: "251",
  DEU: "276",
  JPN: "392",
  KOR: "410",
  CHN: "156",
  IND: "356",
  BRA: "076",
  ZAF: "710",
  // Europe
  ITA: "380",
  ESP: "724",
  NLD: "528",
  CHE: "757",
  BEL: "056",
  SWE: "752",
  NOR: "579",
  POL: "616",
  AUT: "040",
  IRL: "372",
  PRT: "620",
  GRC: "300",
  DNK: "208",
  FIN: "246",
  CZE: "203",
  HUN: "348",
  ROU: "642",
  RUS: "643",
  UKR: "804",
  TUR: "792",
  // MENA
  EGY: "818",
  MAR: "504",
  DZA: "012",
  TUN: "788",
  QAT: "634",
  KWT: "414",
  OMN: "512",
  BHR: "048",
  JOR: "400",
  LBN: "422",
  IRQ: "368",
  IRN: "364",
  ISR: "376",
  YEM: "887",
  // Asia-Pacific
  IDN: "360",
  MYS: "458",
  THA: "764",
  VNM: "704",
  PHL: "608",
  SGP: "702",
  PAK: "586",
  BGD: "050",
  LKA: "144",
  KAZ: "398",
  UZB: "860",
  AZE: "031",
  HKG: "344",
  TWN: "490",
  AUS: "036",
  NZL: "554",
  // Americas
  CAN: "124",
  MEX: "484",
  ARG: "032",
  CHL: "152",
  COL: "170",
  PER: "604",
  // Africa
  NGA: "566",
  KEN: "404",
  ETH: "231",
  GHA: "288",
  AGO: "024",
};

export interface BilateralTrade {
  reporterIso3: string;
  partnerIso3: string;
  year: number;
  exportsUsd: number; // reporter → partner
  importsUsd: number; // partner → reporter
  totalUsd: number;
  source: string;
  live: boolean;
}

interface ComtradeRow {
  period: string;
  flowCode: string; // "X" export, "M" import
  primaryValue: number | null;
}

/**
 * Latest available annual goods trade between `reporterIso3` (default UAE) and
 * `partnerIso3`. Returns null if neither country maps to M49 or no data exists.
 */
export async function bilateralTrade(
  partnerIso3: string,
  reporterIso3 = "ARE",
): Promise<BilateralTrade | null> {
  const reporter = M49[reporterIso3];
  const partner = M49[partnerIso3];
  if (!reporter || !partner) return null;

  const thisYear = new Date().getUTCFullYear();
  // Comtrade lags ~1-2 years; ask for the last few and pick the newest with data.
  const periods = [thisYear - 1, thisYear - 2, thisYear - 3].join(",");
  const key = `comtrade:${reporter}:${partner}`;

  return withCache<BilateralTrade | null>(
    key,
    24 * 60 * 60 * 1000, // 24h
    async () => {
      const apiKey = process.env.COMTRADE_KEY;
      const base = apiKey ? AUTHED : PREVIEW;
      const url = `${base}?reporterCode=${reporter}&partnerCode=${partner}&period=${periods}&flowCode=X,M&cmdCode=TOTAL`;
      const res = await withTimeout(
        fetch(url, {
          headers: apiKey ? { "Ocp-Apim-Subscription-Key": apiKey } : {},
        }),
        12_000,
        "comtrade",
      );
      if (!res.ok) throw new Error(`comtrade ${res.status}`);
      const json = (await res.json()) as { data?: ComtradeRow[] };
      const rows = json.data ?? [];
      if (rows.length === 0) return null;
      const year = Math.max(...rows.map((r) => Number(r.period)));
      const yr = rows.filter((r) => Number(r.period) === year);
      const exportsUsd = yr.find((r) => r.flowCode === "X")?.primaryValue ?? 0;
      const importsUsd = yr.find((r) => r.flowCode === "M")?.primaryValue ?? 0;
      return {
        reporterIso3,
        partnerIso3,
        year,
        exportsUsd,
        importsUsd,
        totalUsd: exportsUsd + importsUsd,
        source: "UN Comtrade",
        live: true,
      };
    },
    () => null,
  );
}
