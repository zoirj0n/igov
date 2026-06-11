import type { AgentState } from "../../src/services/agent/state";

export const FIXTURE_STATE: AgentState = {
  command: "Prepare me for Brazil's Energy Minister",
  scope: {
    iso3: "BRA",
    sector: "energy",
    audience: "Minister of Energy & Infrastructure",
    intent: "meeting_prep",
    classification: "internal",
  },
  indicators: [
    {
      code: "NY.GDP.MKTP.CD",
      label: "GDP",
      value: 2_170_000_000_000,
      unit: "US$",
      year: 2024,
      source: "World Bank",
    },
    {
      code: "EG.ELC.RNEW.ZS",
      label: "Renewables share of electricity",
      value: 89,
      unit: "%",
      year: 2023,
      source: "EIA",
    },
  ],
  passages: [],
  analysis:
    "## Deep analysis\nBrazil's grid is ~89% renewable; biofuels and SAF are the scale opportunities.",
  forecast: {
    label: "GDP growth",
    next: 2.1,
    lowerBand: 1.4,
    upperBand: 2.8,
    read: "Moderate expansion expected",
  },
  gdpSeries: [
    { year: 2020, value: 1_476_000_000_000 },
    { year: 2021, value: 1_670_000_000_000 },
    { year: 2022, value: 1_951_000_000_000 },
    { year: 2023, value: 2_140_000_000_000 },
    { year: 2024, value: 2_170_000_000_000 },
  ],
  opportunities: [
    {
      partnerIso3: "BRA",
      sector: "energy",
      title: "Biofuels & SAF partnership",
      score: 82,
      rationale: "Complementary feedstock supply and UAE aviation demand",
      signals: { trade: 0.7, policy: 0.8 },
    },
  ],
  risks: ["FX volatility"],
  trade: {
    reporterIso3: "ARE",
    partnerIso3: "BRA",
    year: 2024,
    exportsUsd: 1_900_000_000,
    importsUsd: 2_400_000_000,
    totalUsd: 4_300_000_000,
    source: "UN Comtrade",
    live: false,
  },
  developments: {
    query: "Brazil energy",
    answer: "Brazil expands its SAF mandate.",
    results: [
      {
        title: "Brazil SAF mandate grows",
        url: "https://example.org/saf",
        content: "",
        score: 0.9,
      },
    ],
    source: "tavily",
    live: false,
  } as AgentState["developments"],
  researchSteps: [
    { tool: "get_indicators", input: "BRA" },
    { tool: "bilateral_trade", input: "ARE-BRA" },
  ],
  counterpartRole: "energy",
  counterpart: {
    name: "Alexandre Silveira",
    nameAr: "ألكسندري سيلفيرا",
    role: "Minister of Mines and Energy",
    roleAr: "وزير المناجم والطاقة",
    summary:
      "Brazilian senator turned Minister of Mines and Energy; a lawyer and PSD politician from Minas Gerais who drives the SAF mandate, transmission auctions and grid-renewables agenda.",
    education: "Law (Milton Campos Faculty of Law)",
    career: [
      { period: "2023–", position: "Minister of Mines and Energy", org: "Government of Brazil" },
      { period: "2022", position: "Senator (Minas Gerais)", org: "Federal Senate" },
    ],
    likelyToRaise: [
      "Biofuels & SAF partnerships — seeks anchor investors",
      "Green hydrogen investment — Pecém and Açu court Gulf capital",
    ],
    statements: [{ text: "Brazil SAF mandate grows", url: "https://example.org/saf" }],
    citations: ["https://en.wikipedia.org/wiki/Alexandre_Silveira"],
    identifiedAsOf: "2026-06-01",
    confidence: "high",
  },
  briefing: {
    title: "Brazil — Energy Minister briefing",
    bluf: "Lead with biofuels & SAF co-investment; Brazil's 89% renewable grid complements UAE capital.",
    whyNow: "SAF mandate momentum creates a 12-month window.",
    heroMetric: { label: "Bilateral trade", value: "$4.3B", delta: "+18% YoY" },
    counterpart: { objectives: ["Attract energy FDI"], likelyAsks: ["Sovereign co-investment"] },
    position: {
      offers: ["Masdar partnership"],
      asks: ["SAF offtake terms"],
      redLines: ["No exclusivity"],
    },
    deals: [
      {
        title: "SAF joint venture",
        rationale: "Feedstock + capital fit",
        score: 82,
        horizon: "near",
        confidence: "H",
        evidence: "bilateral trade $4.3B",
      },
    ],
    risks: [{ text: "Currency volatility", likelihood: "likely", impact: "M", confidence: "M" }],
    scenarios: [{ name: "Base", outlook: "Steady growth", likelihood: "likely", confidence: "M" }],
    watchlist: ["COP-30 outcomes"],
    talkingPoints: ["Congratulate the SAF mandate", "Propose a Masdar JV scoping team"],
    citations: ["World Bank WDI 2024", "UN Comtrade 2024"],
    confidence: "high",
    overview: "Brazil overview for video narration.",
  },
  deliverables: {},
  trace: [
    { step: "scope", status: "done", detail: "BRA · energy", atMs: 100 },
    { step: "research", status: "done", detail: "12 datapoints", atMs: 2200 },
    { step: "counterpart", status: "done", detail: "Alexandre Silveira", atMs: 2600 },
    { step: "analyse", status: "done", atMs: 4200 },
    { step: "opportunities", status: "done", atMs: 5100 },
    { step: "briefing", status: "done", atMs: 9800 },
  ],
  classification: "internal",
};

/** Encode run events as an SSE body the way /api/agent/run streams them. */
export function sseBody(events: object[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}
