import { COUNTRIES } from "@/lib/data/countries";

/** The 12 curated seeds + Indonesia & Singapore (named in the challenge guide). */
export const FEATURED_ISO3: readonly string[] = [
  "ARE",
  "SAU",
  "USA",
  "GBR",
  "FRA",
  "DEU",
  "JPN",
  "KOR",
  "CHN",
  "IND",
  "BRA",
  "ZAF",
  "IDN",
  "SGP",
];

/** Display hints for picker cards — World Bank WDI 2024, rounded. */
export const FEATURED_STATS: Record<string, string> = {
  USA: "GDP $29.2T",
  CHN: "GDP $18.7T",
  DEU: "GDP $4.7T",
  JPN: "GDP $4.1T",
  IND: "GDP $3.9T",
  GBR: "GDP $3.6T",
  FRA: "GDP $3.2T",
  BRA: "GDP $2.2T",
  KOR: "GDP $1.8T",
  IDN: "GDP $1.4T",
  SAU: "GDP $1.1T",
  ARE: "GDP $0.55T",
  SGP: "GDP $0.53T",
  ZAF: "GDP $0.40T",
};

export function arNameFor(iso3: string): string | undefined {
  return COUNTRIES.find((c) => c.iso3 === iso3)?.nameAr;
}

/** Approximate centroids for the featured 14 — map pins and arcs. */
export const FEATURED_COORDS: Record<string, [lat: number, lon: number]> = {
  ARE: [24, 54],
  SAU: [24, 45],
  USA: [38, -97],
  GBR: [54, -2],
  FRA: [46, 2],
  DEU: [51, 10],
  JPN: [36, 138],
  KOR: [36, 128],
  CHN: [35, 105],
  IND: [21, 78],
  BRA: [-14, -52],
  ZAF: [-30, 23],
  IDN: [-2, 118],
  SGP: [1.35, 103.8],
};
