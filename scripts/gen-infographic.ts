/* eslint-disable no-console */
/** Dev preview: render the country one-pager to /tmp for visual QA.
 *   pnpm tsx scripts/gen-infographic.ts [ISO3] */
import { writeFileSync } from "node:fs";
import { readSeedHistory, readSeedIndicators } from "@/lib/data/indicator-codes";
import { emptyState } from "@/services/agent/state";
import { countryOnePagerSvg } from "@/services/export/infographic";
import { Resvg } from "@resvg/resvg-js";

const iso3 = (process.argv[2] ?? "BRA").toUpperCase();
const s = emptyState(`Prepare me for ${iso3}`);
s.scope = {
  iso3,
  sector: "energy",
  audience: "Minister",
  intent: "meeting_prep",
  classification: "internal",
};
s.indicators = readSeedIndicators(iso3);
const gdp = readSeedHistory(iso3).gdp ?? [];
s.gdpSeries = gdp.slice(-12);
const lastV = gdp[gdp.length - 1]?.value ?? 0;
s.forecast = {
  label: "GDP",
  next: lastV * 1.04,
  lowerBand: lastV,
  upperBand: lastV * 1.08,
  read: "",
};
s.opportunities = [
  {
    partnerIso3: iso3,
    sector: "energy",
    title: "Clean-energy / green-hydrogen cooperation",
    score: 78,
    rationale: "",
    signals: {},
  },
  {
    partnerIso3: iso3,
    sector: "infrastructure",
    title: "Smart-port & infrastructure standards",
    score: 55,
    rationale: "",
    signals: {},
  },
  {
    partnerIso3: iso3,
    sector: "trade",
    title: "Bilateral trade / CEPA expansion",
    score: 41,
    rationale: "",
    signals: {},
  },
];
s.briefing = {
  title: "",
  overview:
    "Brazil's energy sector is robust, led by high renewables penetration and strong FDI inflows. Its scale and clean-energy base make it a priority partner for UAE cooperation in green hydrogen and smart ports.",
  talkingPoints: [],
  citations: [],
  confidence: "med",
};

const svg = countryOnePagerSvg(s);
writeFileSync("/tmp/onepager.svg", svg);
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 1280 },
  font: { loadSystemFonts: true },
});
writeFileSync("/tmp/onepager.png", resvg.render().asPng());
console.log(`wrote /tmp/onepager.png (${iso3})`);
