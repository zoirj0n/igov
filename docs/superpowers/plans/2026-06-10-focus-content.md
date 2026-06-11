# Focus Content + Viz Pack Implementation Plan (Plan C of the single-page redesign)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four remaining focus views — **Trade & Investment** (MOFA-style bilateral infographic + investment map with total-value headline + curated cited deals), **Compare** (live country-vs-UAE radar + table), **Forecast** (history/forecast chart with (e)/(f) markers + scenarios), **Profile** (HKTDC-style IR one-pager with live World Bank sector donut) — completing the 9-view command center the judges' example artifacts call for.

**Architecture:** Views build bottom-up (data → components), then ONE wiring task extends `FOCUS_VIEWS` to 9, adds CommandCenter branches and makes the bento tiles deep-link (trade tile → trade view, forecast tile → forecast, indicators tile → profile). New data: `data/seed/investments.json` (curated, cited UAE-bilateral deals) and a `country-facts` live client (World Bank `mrnev` most-recent values + static facts seed for the featured 14, air-gap safe) behind `GET /api/country-facts/[iso3]`. Compare and Forecast reuse EXISTING endpoints (`/api/countries/[iso3]/indicators`, `/api/insights/forecast`) and the shared `RadarChart`; a small shared `DonutChart` is added.

**Spec:** `docs/superpowers/specs/2026-06-10-single-page-experience-design.md` §7 + the gap-plan T2/T3 artifacts (MOFA infographic, investment map, IR one-pager).

---

## Context primer

- Commands: `pnpm vitest run <file>`; `pnpm typecheck`; format ONLY your files (`pnpm biome check --write <paths>`); NEVER `pnpm lint:fix` (pre-existing repo-wide lint baseline fails — not yours to fix).
- jsdom tests: automatic JSX runtime; `afterEach(cleanup)`; wrap i18n consumers in `<I18nProvider>`; explicit vitest imports; `isAirgapped()` is ALWAYS true under Vitest (test pure parsers + fallbacks; mock `fetch` for component data hooks).
- **Reusable (verified):** `RadarChart({ axes, series:[{label,color,values}], size? })` and `LineChart`/`Sparkline` in `src/components/shared/`; `GET /api/countries/[iso3]/indicators` → `{ indicators: Indicator[] }`; `GET /api/insights/forecast?iso3&metric&horizon` → `ForecastResult { series: ForecastPoint[{year,value,lower,upper,kind:"history"|"forecast"}], confidence, modelName, rmse }`; live runtime helpers `withCache/withTimeout/isAirgapped`; `AgentState.trade` (BilateralTrade), `.indicators`, `.briefing.scenarios/watchlist`, `.forecast`, `.gdpSeries`.
- **Experience shell (Plans A+B):** `FOCUS_VIEWS` in `src/lib/experience/machine.ts` (currently 5: `["overview","brief","counterpart","opportunities","sources"]`); CommandCenter renders one panel per focus; Bento tiles carry `layoutId tile-<view>`; i18n under `t.experience`.
- E2E: `pnpm dev` in background; route-mock APIs; kill server after.

### Curation & integrity rules for this plan
- `data/seed/investments.json` contains REAL, widely-reported UAE-bilateral deals (rounded public figures, year, parties, source name+URL). Every entry is demo-grade curation: the JSON carries a top-level `_meta.note` instructing verification before any official use, and every deal renders with its source link. Do not add deals beyond the ones specified.
- Profile facts: numbers come LIVE from the World Bank (or the dated seed); static civic facts (currency, political system, capital, language) are compile-time data for the featured 14 only — the long tail renders only what the live API returns. Every figure shows `source · year`.

---

### Task 1: Investments seed + loader

**Files:**
- Create: `data/seed/investments.json`
- Create: `src/lib/data/investments.ts`
- Test: `tests/unit/investments.test.ts`

- [ ] **Step 1: Create `data/seed/investments.json`** (verbatim):

```json
{
  "_meta": {
    "note": "Curated demo data — widely reported UAE bilateral investments, rounded public figures. Verify each entry before any official use.",
    "asOf": "2026-01-01"
  },
  "BRA": [
    {
      "title": "Mubadala Capital — Mataripe refinery (Acelen)",
      "valueUsd": 1800000000,
      "year": 2021,
      "parties": ["Mubadala Capital", "Acelen"],
      "sector": "energy",
      "source": { "name": "Mubadala", "url": "https://www.mubadala.com" }
    },
    {
      "title": "Mubadala Capital — Brazil biofuels platform commitment",
      "valueUsd": 2500000000,
      "year": 2024,
      "parties": ["Mubadala Capital"],
      "sector": "energy",
      "source": { "name": "Reuters", "url": "https://www.reuters.com" }
    }
  ],
  "IND": [
    {
      "title": "ADIA — NIIF master fund anchor commitment",
      "valueUsd": 1000000000,
      "year": 2017,
      "parties": ["ADIA", "NIIF"],
      "sector": "infrastructure",
      "source": { "name": "NIIF", "url": "https://niifindia.in" }
    },
    {
      "title": "DP World — Indian ports & logistics platform (Hindustan Infralog)",
      "valueUsd": 3000000000,
      "year": 2018,
      "parties": ["DP World", "NIIF"],
      "sector": "trade",
      "source": { "name": "DP World", "url": "https://www.dpworld.com" }
    }
  ],
  "IDN": [
    {
      "title": "UAE — Indonesia Investment Authority (INA) commitment",
      "valueUsd": 10000000000,
      "year": 2021,
      "parties": ["UAE (sovereign)", "INA"],
      "sector": "economy",
      "source": { "name": "Indonesia Investment Authority", "url": "https://www.ina.go.id" }
    },
    {
      "title": "Masdar — Cirata floating solar plant (145 MWac)",
      "valueUsd": 145000000,
      "year": 2023,
      "parties": ["Masdar", "PLN"],
      "sector": "energy",
      "source": { "name": "Masdar", "url": "https://masdar.ae" }
    }
  ],
  "DEU": [
    {
      "title": "ADNOC — Covestro acquisition (agreed)",
      "valueUsd": 16000000000,
      "year": 2024,
      "parties": ["ADNOC", "Covestro"],
      "sector": "economy",
      "source": { "name": "Reuters", "url": "https://www.reuters.com" }
    },
    {
      "title": "Masdar — German offshore wind & storage partnerships",
      "valueUsd": 1000000000,
      "year": 2023,
      "parties": ["Masdar"],
      "sector": "energy",
      "source": { "name": "Masdar", "url": "https://masdar.ae" }
    }
  ]
}
```

- [ ] **Step 2: Failing test** (`tests/unit/investments.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { investmentsFor, totalInvestmentUsd } from "@/lib/data/investments";

describe("investments seed", () => {
  it("returns cited deals for a seeded country", () => {
    const deals = investmentsFor("BRA");
    expect(deals.length).toBeGreaterThan(0);
    for (const d of deals) {
      expect(d.valueUsd).toBeGreaterThan(0);
      expect(d.source.url).toMatch(/^https:\/\//);
      expect(d.year).toBeGreaterThan(2000);
    }
  });
  it("sums the headline total", () => {
    const deals = investmentsFor("BRA");
    expect(totalInvestmentUsd("BRA")).toBe(deals.reduce((a, d) => a + d.valueUsd, 0));
  });
  it("returns empty for unseeded countries (graceful)", () => {
    expect(investmentsFor("JPN")).toEqual([]);
    expect(totalInvestmentUsd("JPN")).toBe(0);
  });
});
```

- [ ] **Step 3: Run → FAIL. Step 4: Implement `src/lib/data/investments.ts`:**

```ts
import raw from "../../../data/seed/investments.json";

export interface InvestmentDeal {
  title: string;
  valueUsd: number;
  year: number;
  parties: string[];
  sector: string;
  source: { name: string; url: string };
}

const SEED = raw as unknown as Record<string, InvestmentDeal[] | object>;

/** Curated UAE-bilateral deals for the demo countries; [] elsewhere. */
export function investmentsFor(iso3: string): InvestmentDeal[] {
  const v = SEED[iso3];
  return Array.isArray(v) ? v : [];
}

export function totalInvestmentUsd(iso3: string): number {
  return investmentsFor(iso3).reduce((acc, d) => acc + d.valueUsd, 0);
}
```

- [ ] **Step 5: Run → PASS (3). `pnpm typecheck` → 0. Format. Commit:**

```bash
git add data/seed/investments.json src/lib/data/investments.ts tests/unit/investments.test.ts
git commit -m "feat(data): curated cited UAE bilateral investment seed + loader"
```

---

### Task 2: Country-facts live client + seed + API route

**Files:**
- Create: `src/services/live/countryFacts.ts`
- Create: `data/seed/country-facts.json`
- Create: `src/app/api/country-facts/[iso3]/route.ts`
- Test: `tests/unit/country-facts.test.ts`

- [ ] **Step 1: Static + numeric seed** — `data/seed/country-facts.json` (verbatim; numbers = World Bank 2023/24 vintages, rounded):

```json
{
  "_meta": { "note": "Static civic facts + dated numeric fallbacks for the featured 14. Live World Bank values override numerics when online.", "asOf": "2026-01-01" },
  "ARE": { "capital": "Abu Dhabi", "currency": "UAE dirham (AED)", "politicalSystem": "Federation of emirates", "language": "Arabic", "populationM": 11.0, "gdpPerCapitaUsd": 49000, "tradePctGdp": 202, "sectors": { "agriculture": 0.7, "industry": 47.5, "services": 51.8 }, "year": 2024 },
  "SAU": { "capital": "Riyadh", "currency": "Saudi riyal (SAR)", "politicalSystem": "Absolute monarchy", "language": "Arabic", "populationM": 33.0, "gdpPerCapitaUsd": 32000, "tradePctGdp": 64, "sectors": { "agriculture": 2.6, "industry": 44.0, "services": 53.4 }, "year": 2023 },
  "USA": { "capital": "Washington, D.C.", "currency": "US dollar (USD)", "politicalSystem": "Federal presidential republic", "language": "English", "populationM": 335.0, "gdpPerCapitaUsd": 86000, "tradePctGdp": 25, "sectors": { "agriculture": 1.0, "industry": 17.9, "services": 81.1 }, "year": 2023 },
  "GBR": { "capital": "London", "currency": "Pound sterling (GBP)", "politicalSystem": "Parliamentary constitutional monarchy", "language": "English", "populationM": 68.5, "gdpPerCapitaUsd": 52000, "tradePctGdp": 64, "sectors": { "agriculture": 0.6, "industry": 17.3, "services": 82.1 }, "year": 2023 },
  "FRA": { "capital": "Paris", "currency": "Euro (EUR)", "politicalSystem": "Semi-presidential republic", "language": "French", "populationM": 68.2, "gdpPerCapitaUsd": 46000, "tradePctGdp": 73, "sectors": { "agriculture": 1.8, "industry": 16.7, "services": 81.5 }, "year": 2023 },
  "DEU": { "capital": "Berlin", "currency": "Euro (EUR)", "politicalSystem": "Federal parliamentary republic", "language": "German", "populationM": 84.5, "gdpPerCapitaUsd": 55000, "tradePctGdp": 83, "sectors": { "agriculture": 0.9, "industry": 26.6, "services": 72.5 }, "year": 2023 },
  "JPN": { "capital": "Tokyo", "currency": "Japanese yen (JPY)", "politicalSystem": "Parliamentary constitutional monarchy", "language": "Japanese", "populationM": 124.0, "gdpPerCapitaUsd": 33000, "tradePctGdp": 47, "sectors": { "agriculture": 1.0, "industry": 27.4, "services": 71.6 }, "year": 2023 },
  "KOR": { "capital": "Seoul", "currency": "South Korean won (KRW)", "politicalSystem": "Presidential republic", "language": "Korean", "populationM": 51.7, "gdpPerCapitaUsd": 35000, "tradePctGdp": 88, "sectors": { "agriculture": 1.6, "industry": 31.6, "services": 66.8 }, "year": 2023 },
  "CHN": { "capital": "Beijing", "currency": "Renminbi (CNY)", "politicalSystem": "One-party socialist republic", "language": "Mandarin Chinese", "populationM": 1410.0, "gdpPerCapitaUsd": 13000, "tradePctGdp": 37, "sectors": { "agriculture": 7.1, "industry": 38.3, "services": 54.6 }, "year": 2023 },
  "IND": { "capital": "New Delhi", "currency": "Indian rupee (INR)", "politicalSystem": "Federal parliamentary republic", "language": "Hindi, English", "populationM": 1430.0, "gdpPerCapitaUsd": 2700, "tradePctGdp": 46, "sectors": { "agriculture": 16.8, "industry": 25.0, "services": 58.2 }, "year": 2023 },
  "BRA": { "capital": "Brasília", "currency": "Brazilian real (BRL)", "politicalSystem": "Federal presidential republic", "language": "Portuguese", "populationM": 211.0, "gdpPerCapitaUsd": 10300, "tradePctGdp": 34, "sectors": { "agriculture": 6.0, "industry": 22.0, "services": 72.0 }, "year": 2023 },
  "ZAF": { "capital": "Pretoria", "currency": "South African rand (ZAR)", "politicalSystem": "Parliamentary republic", "language": "11 official languages", "populationM": 62.0, "gdpPerCapitaUsd": 6300, "tradePctGdp": 65, "sectors": { "agriculture": 2.7, "industry": 24.5, "services": 72.8 }, "year": 2023 },
  "IDN": { "capital": "Jakarta", "currency": "Indonesian rupiah (IDR)", "politicalSystem": "Presidential republic", "language": "Indonesian", "populationM": 278.0, "gdpPerCapitaUsd": 4900, "tradePctGdp": 41, "sectors": { "agriculture": 12.5, "industry": 40.2, "services": 47.3 }, "year": 2023 },
  "SGP": { "capital": "Singapore", "currency": "Singapore dollar (SGD)", "politicalSystem": "Parliamentary republic", "language": "English, Malay, Mandarin, Tamil", "populationM": 5.9, "gdpPerCapitaUsd": 88000, "tradePctGdp": 311, "sectors": { "agriculture": 0.0, "industry": 23.6, "services": 76.4 }, "year": 2023 }
}
```

- [ ] **Step 2: Failing test:**

```ts
import { describe, expect, it } from "vitest";
import { fetchCountryFacts, parseWbMrnev } from "@/services/live/countryFacts";

describe("country facts", () => {
  it("parseWbMrnev maps the most-recent value", () => {
    const j = [{ page: 1 }, [{ value: 2.17e12, date: "2024" }]];
    expect(parseWbMrnev(j)).toEqual({ value: 2.17e12, year: 2024 });
    expect(parseWbMrnev([{ page: 1 }, []])).toBeNull();
    expect(parseWbMrnev([{ page: 1 }, [{ value: null, date: "2024" }]])).toBeNull();
    expect(parseWbMrnev("junk")).toBeNull();
  });
  it("air-gapped (vitest): seeded country serves the dated seed", async () => {
    const f = await fetchCountryFacts("BRA");
    expect(f?.capital).toBe("Brasília");
    expect(f?.sectors?.services).toBeGreaterThan(50);
    expect(f?.live).toBe(false);
  });
  it("air-gapped: unseeded country returns static-less minimal facts (null)", async () => {
    expect(await fetchCountryFacts("JPN")).not.toBeNull();
    expect(await fetchCountryFacts("XKX")).toBeNull();
  });
});
```

- [ ] **Step 3: Run → FAIL. Step 4: Implement `src/services/live/countryFacts.ts`:**

```ts
/**
 * Country IR facts — HKTDC-style one-pager data. Numerics come live from the
 * World Bank (mrnev = most recent non-empty value); civic facts and dated
 * numeric fallbacks come from the featured-14 seed. Air-gapped ⇒ seed only.
 */
import seedRaw from "../../../data/seed/country-facts.json";
import { isAirgapped, withCache, withTimeout } from "@/services/live/runtime";

export interface CountryFacts {
  iso3: string;
  capital?: string;
  currency?: string;
  politicalSystem?: string;
  language?: string;
  populationM?: number;
  gdpPerCapitaUsd?: number;
  tradePctGdp?: number;
  sectors?: { agriculture: number; industry: number; services: number };
  year: number;
  source: string;
  live: boolean;
}

interface SeedRow {
  capital: string;
  currency: string;
  politicalSystem: string;
  language: string;
  populationM: number;
  gdpPerCapitaUsd: number;
  tradePctGdp: number;
  sectors: { agriculture: number; industry: number; services: number };
  year: number;
}

const SEED = seedRaw as unknown as Record<string, SeedRow | object>;

function seedFor(iso3: string): SeedRow | null {
  const v = SEED[iso3];
  return v && typeof v === "object" && "capital" in v ? (v as SeedRow) : null;
}

/** Pure: WB v2 mrnev payload → { value, year } | null. */
export function parseWbMrnev(j: unknown): { value: number; year: number } | null {
  if (!Array.isArray(j) || !Array.isArray(j[1])) return null;
  const row = j[1][0] as { value?: number | null; date?: string } | undefined;
  if (!row || row.value === null || row.value === undefined) return null;
  const year = Number.parseInt(row.date ?? "", 10);
  return Number.isFinite(row.value) && Number.isFinite(year)
    ? { value: row.value, year }
    : null;
}

const WB = "https://api.worldbank.org/v2/country";
const CODES = {
  population: "SP.POP.TOTL",
  gdpPerCapita: "NY.GDP.PCAP.CD",
  tradePct: "NE.TRD.GNFS.ZS",
  agriculture: "NV.AGR.TOTL.ZS",
  industry: "NV.IND.TOTL.ZS",
  services: "NV.SRV.TOTL.ZS",
} as const;

async function wbValue(iso3: string, code: string): Promise<{ value: number; year: number } | null> {
  const url = `${WB}/${iso3}/indicator/${code}?format=json&mrnev=1`;
  const res = await withTimeout(fetch(url), 12_000, "worldbank-facts");
  if (!res.ok) throw new Error(`wb ${res.status}`);
  return parseWbMrnev(await res.json());
}

export async function fetchCountryFacts(iso3: string): Promise<CountryFacts | null> {
  const seed = seedFor(iso3);
  const fromSeed = (): CountryFacts | null =>
    seed
      ? { iso3, ...seed, source: "World Bank (seed)", live: false }
      : null;

  if (isAirgapped()) return fromSeed();

  return withCache<CountryFacts | null>(
    `facts:${iso3}`,
    6 * 60 * 60 * 1000,
    async () => {
      const [pop, gpc, trade, agr, ind, srv] = await Promise.all([
        wbValue(iso3, CODES.population).catch(() => null),
        wbValue(iso3, CODES.gdpPerCapita).catch(() => null),
        wbValue(iso3, CODES.tradePct).catch(() => null),
        wbValue(iso3, CODES.agriculture).catch(() => null),
        wbValue(iso3, CODES.industry).catch(() => null),
        wbValue(iso3, CODES.services).catch(() => null),
      ]);
      const anyLive = pop || gpc || trade || agr || ind || srv;
      if (!anyLive) return fromSeed();
      const year = Math.max(
        ...[pop, gpc, trade, agr, ind, srv].filter(Boolean).map((v) => (v as { year: number }).year),
      );
      return {
        iso3,
        capital: seed?.capital,
        currency: seed?.currency,
        politicalSystem: seed?.politicalSystem,
        language: seed?.language,
        populationM: pop ? Math.round((pop.value / 1e6) * 10) / 10 : seed?.populationM,
        gdpPerCapitaUsd: gpc ? Math.round(gpc.value) : seed?.gdpPerCapitaUsd,
        tradePctGdp: trade ? Math.round(trade.value) : seed?.tradePctGdp,
        sectors:
          agr && ind && srv
            ? {
                agriculture: Math.round(agr.value * 10) / 10,
                industry: Math.round(ind.value * 10) / 10,
                services: Math.round(srv.value * 10) / 10,
              }
            : seed?.sectors,
        year,
        source: "World Bank",
        live: true,
      };
    },
    fromSeed,
  );
}
```

- [ ] **Step 5: API route** — `src/app/api/country-facts/[iso3]/route.ts`:

```ts
import { getCurrentUser } from "@/lib/auth/server";
import { isValidIso3 } from "@/lib/data/iso-countries";
import { fetchCountryFacts } from "@/services/live/countryFacts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ iso3: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { iso3 } = await ctx.params;
  const code = iso3.toUpperCase();
  if (!isValidIso3(code)) return NextResponse.json({ error: "unknown iso3" }, { status: 404 });
  const facts = await fetchCountryFacts(code);
  if (!facts) return NextResponse.json({ error: "no facts available" }, { status: 404 });
  return NextResponse.json({ facts });
}
```

Note on the test's `XKX` expectation: `isValidIso3("XKX")` may be false (route 404s first); the CLIENT function `fetchCountryFacts("XKX")` itself returns null when unseeded+air-gapped — both behaviors are correct. If `XKX` IS in ISO_COUNTRIES, nothing changes.

- [ ] **Step 6: Run tests (4 pass) + full unit suite + typecheck. Format. Commit:**

```bash
git add data/seed/country-facts.json src/services/live/countryFacts.ts src/app/api/country-facts tests/unit/country-facts.test.ts
git commit -m "feat(live): country IR facts — WB mrnev live + featured-14 seed + API route"
```

---

### Task 3: Shared format util + DonutChart + TradeView + InvestmentMap

**Files:**
- Create: `src/lib/experience/format.ts`
- Modify: `src/components/experience/Bento.tsx` (swap local `fmtUsd` for the shared one — delete the local function, add the import)
- Modify: `src/lib/experience/featured.ts` (add `FEATURED_COORDS`)
- Modify: `src/components/experience/PickerMap.tsx` (import `FEATURED_COORDS` instead of its local `COORDS`)
- Create: `src/components/shared/DonutChart.tsx`
- Create: `src/components/experience/InvestmentMap.tsx`
- Create: `src/components/experience/TradeView.tsx`
- Test: `tests/unit/format.test.ts`, `tests/unit/trade-view.test.tsx`

- [ ] **Step 1: format util (TDD).** Failing test `tests/unit/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fmtUsd } from "@/lib/experience/format";

describe("fmtUsd", () => {
  it("scales T/B/M and falls back to locale integers", () => {
    expect(fmtUsd(2_170_000_000_000)).toBe("$2.2T");
    expect(fmtUsd(4_300_000_000)).toBe("$4.3B");
    expect(fmtUsd(145_000_000)).toBe("$145.0M");
    expect(fmtUsd(950_000)).toBe("$950,000");
  });
});
```

Implement `src/lib/experience/format.ts` (the exact function currently local in Bento):

```ts
export function fmtUsd(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}
```

Then in `Bento.tsx`: delete the local `fmtUsd` and add `import { fmtUsd } from "@/lib/experience/format";`. Run the full unit suite — green.

- [ ] **Step 2: Shared coords.** In `src/lib/experience/featured.ts` append:

```ts
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
```

In `PickerMap.tsx`, delete the local `COORDS` array and iterate `Object.entries(FEATURED_COORDS)` instead (`const active = …regionOf(iso3)…` unchanged; keys/cx/cy as before). Run picker tests — green.

- [ ] **Step 3: DonutChart** — `src/components/shared/DonutChart.tsx`:

```tsx
"use client";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Minimal SVG donut — slices as stroked circle segments, legend below. */
export function DonutChart({
  slices,
  size = 150,
  thickness = 24,
  centerLabel,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={slices.map((s) => `${s.label} ${s.value}`).join(", ")}
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((s) => {
            const frac = s.value / total;
            const seg = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${frac * c} ${c}`}
                strokeDashoffset={-acc * c}
              />
            );
            acc += frac;
            return seg;
          })}
        </g>
        {centerLabel && (
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-ink-700 text-xs font-semibold"
          >
            {centerLabel}
          </text>
        )}
      </svg>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-2xs text-ink-500">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label} · {s.value}%
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: InvestmentMap** — `src/components/experience/InvestmentMap.tsx`:

```tsx
"use client";

import { FEATURED_COORDS } from "@/lib/experience/featured";
import { fmtUsd } from "@/lib/experience/format";
import { WORLD_H, WORLD_LAND_PATH, WORLD_W } from "@/lib/data/world-map";

const px = (lon: number) => ((lon + 180) / 360) * WORLD_W;
const py = (lat: number) => ((90 - lat) / 180) * WORLD_H;

/** UAE → partner arc with a value-badged pin (investment total, else trade). */
export function InvestmentMap({
  iso3,
  headlineLabel,
  headlineUsd,
}: {
  iso3: string;
  headlineLabel: string;
  headlineUsd: number;
}) {
  const uae = FEATURED_COORDS.ARE;
  const partner = FEATURED_COORDS[iso3];
  const a = uae ? { x: px(uae[1]), y: py(uae[0]) } : null;
  const b = partner ? { x: px(partner[1]), y: py(partner[0]) } : null;
  const mid = a && b ? { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 70 } : null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-[#0c0c15]">
      <svg viewBox={`0 14 ${WORLD_W} 402`} className="h-44 w-full sm:h-56" role="img" aria-label={headlineLabel}>
        <path d={WORLD_LAND_PATH} fill="#181824" />
        {a && b && mid && (
          <>
            <path
              d={`M ${a.x} ${a.y} Q ${mid.x} ${mid.y} ${b.x} ${b.y}`}
              fill="none"
              stroke="#169f9f"
              strokeWidth="2.5"
              strokeDasharray="7 5"
            />
            <circle cx={a.x} cy={a.y} r="6" fill="#0eecda" />
            <circle cx={b.x} cy={b.y} r="9" fill="#169f9f" opacity="0.35" />
            <circle cx={b.x} cy={b.y} r="5.5" fill="#0eecda" />
          </>
        )}
      </svg>
      <div className="absolute start-4 top-4 rounded-lg border border-tamm-cyan/40 bg-[#080810]/85 px-4 py-2 backdrop-blur">
        <p className="text-2xs uppercase tracking-wide text-white/50">{headlineLabel}</p>
        <p className="font-display text-2xl font-bold text-tamm-cyan">{fmtUsd(headlineUsd)}</p>
      </div>
    </div>
  );
}
```

(For countries outside the featured 14, the map renders without arc/pin — the headline badge still shows. Acceptable.)

- [ ] **Step 5: TradeView (TDD).** Failing test `tests/unit/trade-view.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/context";
import { TradeView } from "@/components/experience/TradeView";
import { FIXTURE_STATE } from "../fixtures/agent-state";

afterEach(cleanup);

function show(state = FIXTURE_STATE) {
  return render(
    <I18nProvider>
      <TradeView state={state} iso3="BRA" countryName="Brazil" />
    </I18nProvider>,
  );
}

describe("TradeView", () => {
  it("renders the bilateral infographic numbers", () => {
    const { getByText } = show();
    expect(getByText("$4.3B")).toBeTruthy();
    expect(getByText("$1.9B")).toBeTruthy();
    expect(getByText("$2.4B")).toBeTruthy();
    expect(getByText(/UN Comtrade · 2024/)).toBeTruthy();
  });
  it("renders the curated investments with source links and headline total", () => {
    const { getByText, getAllByRole } = show();
    expect(getByText(/Mataripe refinery/)).toBeTruthy();
    expect(getByText("$4.3B").length ?? 1).toBeTruthy();
    const links = getAllByRole("link");
    expect(links.some((l) => (l as HTMLAnchorElement).href.includes("mubadala.com"))).toBe(true);
  });
  it("degrades gracefully without trade data", () => {
    const { queryByText, getByText } = show({ ...FIXTURE_STATE, trade: undefined });
    expect(queryByText("$1.9B")).toBeNull();
    expect(getByText(/Mataripe refinery/)).toBeTruthy();
  });
});
```

Implement `src/components/experience/TradeView.tsx`:

```tsx
"use client";

import { InvestmentMap } from "@/components/experience/InvestmentMap";
import { investmentsFor, totalInvestmentUsd } from "@/lib/data/investments";
import { fmtUsd } from "@/lib/experience/format";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";

export function TradeView({
  state,
  iso3,
  countryName,
}: {
  state: AgentState;
  iso3: string;
  countryName: string;
}) {
  const { t } = useI18n();
  const x = t.experience.tradeView;
  const trade = state.trade;
  const deals = investmentsFor(iso3);
  const invTotal = totalInvestmentUsd(iso3);
  const fdi = state.indicators.find((i) => i.code.toLowerCase().includes("fdi"));
  const headlineUsd = invTotal > 0 ? invTotal : (trade?.totalUsd ?? 0);
  const headlineLabel = invTotal > 0 ? x.investmentHeadline : x.tradeHeadline;

  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-2xs uppercase tracking-wide text-white/45">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-tamm-cyan">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-tamm-olive/30 bg-[#0c0c15] p-5">
        <p className="inline-block rounded bg-tamm-olive/20 px-3 py-1 text-sm font-semibold text-tamm-olive">
          {x.banner.replace("{country}", countryName)}
        </p>
        {trade ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stat(x.total, fmtUsd(trade.totalUsd))}
              {stat(x.exports, fmtUsd(trade.exportsUsd), "↑ UAE → " + countryName)}
              {stat(x.imports, fmtUsd(trade.importsUsd), "↓ " + countryName + " → UAE")}
              {stat(
                x.balance,
                `${trade.exportsUsd - trade.importsUsd >= 0 ? "+" : "−"}${fmtUsd(Math.abs(trade.exportsUsd - trade.importsUsd))}`,
              )}
            </div>
            <p className="mt-3 text-2xs text-white/40">
              {trade.source} · {trade.year}
              {fdi && (
                <span className="ms-3">
                  {x.fdi}: {fmtUsd(fdi.value)} ({fdi.source} · {fdi.year})
                </span>
              )}
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-white/50">{x.noTrade}</p>
        )}
      </div>

      <InvestmentMap iso3={iso3} headlineLabel={headlineLabel} headlineUsd={headlineUsd} />

      {deals.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {x.deals}
          </h3>
          <ul className="mt-2 space-y-2">
            {deals.map((d) => (
              <li
                key={d.title}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-800">{d.title}</p>
                  <p className="text-2xs text-ink-500">
                    {d.parties.join(" · ")} · {d.year} ·{" "}
                    <a
                      href={d.source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent-strong hover:underline"
                    >
                      {d.source.name}
                    </a>
                  </p>
                </div>
                <span className="font-mono text-lg font-bold text-tamm-cyan">
                  {fmtUsd(d.valueUsd)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-2xs text-ink-400">{x.dealsNote}</p>
        </section>
      )}
    </div>
  );
}
```

NOTE: the i18n keys (`t.experience.tradeView.*`) are added in Task 6 — to keep THIS task green standalone, add the EN/AR `tradeView` blocks to `messages.ts` NOW as part of this task (keys: banner "UAE — {country} bilateral relationship", total "Total trade", exports "UAE exports", imports "UAE imports", balance "Balance", fdi "FDI inflows", noTrade "No bilateral trade data available for this run.", investmentHeadline "Announced UAE investment", tradeHeadline "Bilateral trade", deals "Announced investments & partnerships", dealsNote "Curated public figures — verify before official use." — with Arabic mirrors: banner "الإمارات — {country} علاقة ثنائية", total "إجمالي التجارة", exports "صادرات الإمارات", imports "واردات الإمارات", balance "الميزان", fdi "تدفقات الاستثمار الأجنبي", noTrade "لا تتوفر بيانات تجارة ثنائية لهذا التشغيل.", investmentHeadline "استثمارات إماراتية معلنة", tradeHeadline "التجارة الثنائية", deals "استثمارات وشراكات معلنة", dealsNote "أرقام عامة منسّقة — تحقّق قبل الاستخدام الرسمي.").

- [ ] **Step 6: All tests green** (`pnpm vitest run tests/unit`), `pnpm typecheck` → 0. Format all touched files. Commit:

```bash
git add src/lib/experience/format.ts src/lib/experience/featured.ts src/components/experience/PickerMap.tsx src/components/experience/Bento.tsx src/components/shared/DonutChart.tsx src/components/experience/InvestmentMap.tsx src/components/experience/TradeView.tsx src/lib/i18n/messages.ts tests/unit/format.test.ts tests/unit/trade-view.test.tsx
git commit -m "feat(experience): trade & investment view — MOFA infographic, investment map, cited deals"
```

---

### Task 4: ProfileView (IR one-pager)

**Files:**
- Create: `src/components/experience/ProfileView.tsx`
- Modify: `src/lib/i18n/messages.ts` (add `profileView` blocks EN/AR)
- Test: `tests/unit/profile-view.test.tsx`

- [ ] **Step 1: i18n.** Add to `en.experience`:

```ts
      profileView: {
        gdpPerCapita: "GDP per capita",
        population: "Population (millions)",
        tradePct: "External trade (% of GDP)",
        capital: "Capital",
        currency: "Currency",
        politicalSystem: "Political system",
        language: "Language",
        sectors: "Economic structure (GDP composition)",
        agriculture: "Agriculture",
        industry: "Industry",
        services: "Services",
        loading: "Loading country profile…",
        unavailable: "Country facts unavailable.",
        liveBadge: "live",
        seedBadge: "seed",
      },
```

AR mirror:

```ts
      profileView: {
        gdpPerCapita: "نصيب الفرد من الناتج المحلي",
        population: "السكان (بالملايين)",
        tradePct: "التجارة الخارجية (% من الناتج)",
        capital: "العاصمة",
        currency: "العملة",
        politicalSystem: "النظام السياسي",
        language: "اللغة",
        sectors: "هيكل الاقتصاد (تكوين الناتج المحلي)",
        agriculture: "الزراعة",
        industry: "الصناعة",
        services: "الخدمات",
        loading: "جارٍ تحميل ملف الدولة…",
        unavailable: "بيانات الدولة غير متاحة.",
        liveBadge: "حي",
        seedBadge: "أساسي",
      },
```

- [ ] **Step 2: Failing test** (`tests/unit/profile-view.test.tsx`) — mocked fetch:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/context";
import { ProfileView } from "@/components/experience/ProfileView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FACTS = {
  iso3: "BRA",
  capital: "Brasília",
  currency: "Brazilian real (BRL)",
  politicalSystem: "Federal presidential republic",
  language: "Portuguese",
  populationM: 211,
  gdpPerCapitaUsd: 10300,
  tradePctGdp: 34,
  sectors: { agriculture: 6, industry: 22, services: 72 },
  year: 2023,
  source: "World Bank",
  live: true,
};

describe("ProfileView", () => {
  it("fetches facts and renders the one-pager", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ facts: FACTS }), { status: 200 })),
    );
    const { getByText } = render(
      <I18nProvider>
        <ProfileView iso3="BRA" countryName="Brazil" />
      </I18nProvider>,
    );
    await waitFor(() => {
      expect(getByText("Brasília")).toBeTruthy();
      expect(getByText("$10,300")).toBeTruthy();
      expect(getByText(/Services · 72%/)).toBeTruthy();
      expect(getByText(/World Bank · 2023/)).toBeTruthy();
    });
  });
  it("shows the unavailable state on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const { getByText } = render(
      <I18nProvider>
        <ProfileView iso3="XXX" countryName="Nowhere" />
      </I18nProvider>,
    );
    await waitFor(() => expect(getByText(/unavailable/i)).toBeTruthy());
  });
});
```

- [ ] **Step 3: Run → FAIL. Step 4: Implement** `src/components/experience/ProfileView.tsx`:

```tsx
"use client";

import { DonutChart } from "@/components/shared/DonutChart";
import { fmtUsd } from "@/lib/experience/format";
import { useI18n } from "@/lib/i18n/context";
import type { CountryFacts } from "@/services/live/countryFacts";
import { useEffect, useState } from "react";

export function ProfileView({ iso3, countryName }: { iso3: string; countryName: string }) {
  const { t } = useI18n();
  const x = t.experience.profileView;
  const [facts, setFacts] = useState<CountryFacts | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let on = true;
    setStatus("loading");
    fetch(`/api/country-facts/${iso3}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { facts: CountryFacts }).facts : null))
      .then((f) => {
        if (!on) return;
        if (f) {
          setFacts(f);
          setStatus("ready");
        } else setStatus("error");
      })
      .catch(() => on && setStatus("error"));
    return () => {
      on = false;
    };
  }, [iso3]);

  if (status === "loading")
    return <p className="py-10 text-center text-sm text-ink-500">{x.loading}</p>;
  if (status === "error" || !facts)
    return <p className="py-10 text-center text-sm text-ink-500">{x.unavailable}</p>;

  const big = (label: string, value: string) => (
    <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
      <p className="text-2xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink-900">{value}</p>
    </div>
  );
  const civic = (label: string, value?: string) =>
    value ? (
      <div className="flex items-baseline justify-between gap-3 border-b border-ink-150 py-2 text-sm last:border-0">
        <span className="text-ink-500">{label}</span>
        <span className="text-end font-medium text-ink-800">{value}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-ink-900">{countryName}</h3>
        <span className="rounded-full border border-ink-200 px-2.5 py-0.5 font-mono text-2xs text-ink-500">
          {facts.source} · {facts.year} ·{" "}
          <span className={facts.live ? "text-signal-ok" : "text-tamm-olive"}>
            {facts.live ? x.liveBadge : x.seedBadge}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {facts.gdpPerCapitaUsd !== undefined &&
          big(x.gdpPerCapita, `$${Math.round(facts.gdpPerCapitaUsd).toLocaleString()}`)}
        {facts.populationM !== undefined && big(x.population, `${facts.populationM}`)}
        {facts.tradePctGdp !== undefined && big(x.tradePct, `${facts.tradePctGdp}%`)}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
          {civic(x.capital, facts.capital)}
          {civic(x.currency, facts.currency)}
          {civic(x.politicalSystem, facts.politicalSystem)}
          {civic(x.language, facts.language)}
        </div>
        {facts.sectors && (
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
            <p className="mb-3 text-2xs uppercase tracking-wide text-ink-400">{x.sectors}</p>
            <DonutChart
              slices={[
                { label: x.agriculture, value: facts.sectors.agriculture, color: "#c0c171" },
                { label: x.industry, value: facts.sectors.industry, color: "#0f7d7d" },
                { label: x.services, value: facts.sectors.services, color: "#0eecda" },
              ]}
              centerLabel="%"
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

Note on the test's `Services · 72%` assertion: the DonutChart legend renders `{label} · {value}%` — exact text "Services · 72%". The `$10,300` assertion matches the `toLocaleString` of 10300 in en-US (jsdom default).

- [ ] **Step 5: Run → PASS (2). Full suite + typecheck. Format. Commit:**

```bash
git add src/components/experience/ProfileView.tsx src/lib/i18n/messages.ts tests/unit/profile-view.test.tsx
git commit -m "feat(experience): IR one-pager profile view — live WB facts + sector donut"
```

---

### Task 5: CompareView (focus) + ForecastView

**Files:**
- Create: `src/components/experience/CompareFocusView.tsx`
- Create: `src/components/experience/ForecastView.tsx`
- Modify: `src/lib/i18n/messages.ts` (add `compareView` + `forecastView` blocks EN/AR)
- Test: `tests/unit/compare-focus-view.test.tsx`, `tests/unit/forecast-view.test.tsx`

- [ ] **Step 1: i18n.** EN additions to `en.experience`:

```ts
      compareView: {
        vsUae: "vs United Arab Emirates",
        addPeer: "Add peer…",
        loading: "Loading comparison…",
        unavailable: "Comparison data unavailable.",
        metric: "Metric",
      },
      forecastView: {
        metricLabel: "Metric",
        loading: "Computing forecast…",
        unavailable: "Forecast unavailable for this country.",
        history: "history",
        forecast: "forecast (f)",
        scenarios: "Scenarios",
        watchlist: "Watchlist",
        model: "Model",
      },
```

AR mirror:

```ts
      compareView: {
        vsUae: "مقابل الإمارات العربية المتحدة",
        addPeer: "أضف دولة…",
        loading: "جارٍ تحميل المقارنة…",
        unavailable: "بيانات المقارنة غير متاحة.",
        metric: "المؤشر",
      },
      forecastView: {
        metricLabel: "المؤشر",
        loading: "جارٍ حساب التوقعات…",
        unavailable: "التوقعات غير متاحة لهذه الدولة.",
        history: "تاريخي",
        forecast: "توقع (f)",
        scenarios: "السيناريوهات",
        watchlist: "قائمة المتابعة",
        model: "النموذج",
      },
```

- [ ] **Step 2: CompareFocusView.** FIRST read `src/components/compare/CompareView.tsx` to copy its normalization approach and its 6 `METRIC_SET` codes + label source, and check the `Indicator` shape in `src/types/index.ts` (the API returns `{ indicators: Indicator[] }` from `/api/countries/[iso3]/indicators`). Then implement `src/components/experience/CompareFocusView.tsx`: props `{ iso3, countryName }`; fetches indicators for `iso3` and `"ARE"` in parallel (plus an optional third peer chosen from a `<select>` of `FEATURED_ISO3` minus the two); per metric, take the latest-year value; normalize each axis 0–100 across the loaded series (same approach as the legacy CompareView); render the shared `RadarChart` (`axes` = 6 metric labels, series = [{label: countryName, color: "#0eecda"}, {label: "United Arab Emirates", color: "#c0c171"}, optional peer "#8b8c98"]) plus a compact value table beneath (metric · per-country formatted value with year). Loading/unavailable states via the i18n keys. Failing test first (`tests/unit/compare-focus-view.test.tsx`): stub fetch returning two minimal indicator payloads (e.g. `gdp_usd_nominal` BRA 2.17e12 / ARE 0.5e12 + one more metric), assert the radar axes labels render and the table shows both country names; second test: 500 response → unavailable text. Mock-fetch keying: inspect the requested URL in the mock to return per-country payloads.

- [ ] **Step 3: ForecastView.** Implement `src/components/experience/ForecastView.tsx`: props `{ state, iso3 }`; a metric `<select>` (`gdp_usd_nominal` default, `gdp_growth_pct`, `renewables_share_pct` — labels can be the raw codes prettified); fetches `/api/insights/forecast?iso3=${iso3}&metric=${metric}&horizon=5`; renders an SVG line chart (~70 lines, follow the pattern in `src/components/insights/InsightsView.tsx`'s internal ForecastChart — read it first): history points solid polyline, forecast points dashed polyline, confidence band polygon (lower/upper), year ticks where forecast years get an `(f)` suffix and the last history year `(e)` — the judges' example uses (e)/(f) markers; below the chart: `state.forecast?.read` line, scenario cards from `state.briefing?.scenarios` (name, outlook, likelihood), watchlist chips from `state.briefing?.watchlist`, and a `Model: {modelName} · RMSE {rmse}` footer. Loading/unavailable states. Failing test first (`tests/unit/forecast-view.test.tsx`): stub fetch with a small `ForecastResult` (3 history + 2 forecast points), assert "(f)" appears, scenario name from `FIXTURE_STATE.briefing.scenarios[0].name` ("Base") renders, and the model footer renders; second test: failed fetch → unavailable.

- [ ] **Step 4: All tests green; full suite; typecheck; format. Commit:**

```bash
git add src/components/experience/CompareFocusView.tsx src/components/experience/ForecastView.tsx src/lib/i18n/messages.ts tests/unit/compare-focus-view.test.tsx tests/unit/forecast-view.test.tsx
git commit -m "feat(experience): compare radar + forecast chart with (e)/(f) markers"
```

---

### Task 6: Wire the 9-view command center

**Files:**
- Modify: `src/lib/experience/machine.ts` (FOCUS_VIEWS → 9)
- Modify: `tests/unit/experience-machine.test.ts`
- Modify: `src/lib/i18n/messages.ts` (focus labels EN/AR)
- Modify: `src/components/experience/CommandCenter.tsx` (4 new panel branches)
- Modify: `src/components/experience/Bento.tsx` (tile deep-links)

- [ ] **Step 1: machine.**

```ts
export const FOCUS_VIEWS = [
  "overview",
  "brief",
  "counterpart",
  "opportunities",
  "trade",
  "compare",
  "forecast",
  "profile",
  "sources",
] as const;
```

Test additions (hash-codec test): `expect(FOCUS_VIEWS).toContain("trade");` plus one round-trip `expect(parseHash("#run=r1&focus=profile")).toEqual({ runId: "r1", focus: "profile" });`. Run → green.

- [ ] **Step 2: i18n focus labels.** EN `focus` block gains: `trade: "Trade & investment", compare: "Compare", forecast: "Forecast", profile: "Profile",` — AR: `trade: "التجارة والاستثمار", compare: "مقارنة", forecast: "التوقعات", profile: "الملف",`. Keep key ORDER mirrored between locales.

- [ ] **Step 3: CommandCenter.** Import the four views. Derive once before the return: `const iso3 = country?.iso3 ?? state.scope?.iso3 ?? "";` and `const cName = country?.name ?? iso3;`. Add panel branches alongside the existing ones:

```tsx
            {focus === "trade" && <TradeView state={state} iso3={iso3} countryName={cName} />}
            {focus === "compare" && <CompareFocusView iso3={iso3} countryName={cName} />}
            {focus === "forecast" && <ForecastView state={state} iso3={iso3} />}
            {focus === "profile" && <ProfileView iso3={iso3} countryName={cName} />}
```

- [ ] **Step 4: Bento tile deep-links.** Trade tile: add `id="trade"` and `onClick={trade && onFocus ? () => onFocus("trade") : undefined}`. Forecast tile: add `id="forecast"` and `onClick={forecast && onFocus ? () => onFocus("forecast") : undefined}`. Indicators tile: add `id="profile"` and `onClick={indicators.length > 0 && onFocus ? () => onFocus("profile") : undefined}`. (The Tile wrapper already turns clickable tiles into motion.buttons with `tile-<id>` layoutIds that morph into the matching focus panels.)

- [ ] **Step 5: Gates.** `pnpm vitest run tests/unit` ALL green; `pnpm typecheck` → 0; format touched files. Commit:

```bash
git add src/lib/experience/machine.ts tests/unit/experience-machine.test.ts src/lib/i18n/messages.ts src/components/experience/CommandCenter.tsx src/components/experience/Bento.tsx
git commit -m "feat(experience): nine-view command center — trade/compare/forecast/profile wired"
```

---

### Task 7: E2E extension + full verification sweep

**Files:**
- Modify: `tests/e2e/experience.spec.ts`

- [ ] **Step 1: Add route mocks** to `mockRunApis` (so the new views need no live upstreams):

```ts
  await page.route(`**/api/country-facts/BRA`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        facts: {
          iso3: "BRA",
          capital: "Brasília",
          currency: "Brazilian real (BRL)",
          politicalSystem: "Federal presidential republic",
          language: "Portuguese",
          populationM: 211,
          gdpPerCapitaUsd: 10300,
          tradePctGdp: 34,
          sectors: { agriculture: 6, industry: 22, services: 72 },
          year: 2023,
          source: "World Bank",
          live: false,
        },
      }),
    }),
  );
  await page.route("**/api/insights/forecast*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        iso3: "BRA",
        metric: "gdp_usd_nominal",
        horizon: 5,
        series: [
          { year: 2022, value: 1.95e12, lower: 1.95e12, upper: 1.95e12, kind: "history" },
          { year: 2023, value: 2.14e12, lower: 2.14e12, upper: 2.14e12, kind: "history" },
          { year: 2024, value: 2.17e12, lower: 2.17e12, upper: 2.17e12, kind: "history" },
          { year: 2025, value: 2.25e12, lower: 2.1e12, upper: 2.4e12, kind: "forecast" },
          { year: 2026, value: 2.33e12, lower: 2.1e12, upper: 2.55e12, kind: "forecast" },
        ],
        alpha: 0.5,
        beta: 0.3,
        rmse: 1.2e10,
        confidence: "med",
        modelName: "Holt's linear trend",
      }),
    }),
  );
  await page.route("**/api/countries/*/indicators", (route) => {
    const url = route.request().url();
    const iso = url.includes("/ARE/") ? "ARE" : "BRA";
    const gdp = iso === "ARE" ? 5.5e11 : 2.17e12;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        country: iso,
        indicators: [
          { iso3: iso, metric: "gdp_usd_nominal", value: gdp, year: 2024, unit: "USD", source: "World Bank" },
        ],
        source: "memory",
      }),
    });
  });
```

(Adapt the indicator row fields to whatever the real `Indicator` type requires — read `src/types/index.ts` first; the CompareFocusView only consumes the fields it reads.)

- [ ] **Step 2: Extend the golden-path test** after the Counterpart assertions:

```ts
    await page.getByRole("tab", { name: /Trade & investment/ }).click();
    await expect(page.getByText("Mataripe", { exact: false })).toBeVisible();
    await expect(page.getByText(/Announced UAE investment/i)).toBeVisible();

    await page.getByRole("tab", { name: /^Compare$/ }).click();
    await expect(page.getByText(/vs United Arab Emirates/i)).toBeVisible();

    await page.getByRole("tab", { name: /^Forecast$/ }).click();
    await expect(page.getByText(/Holt's linear trend/)).toBeVisible();
    await expect(page.getByText(/\(f\)/).first()).toBeVisible();

    await page.getByRole("tab", { name: /^Profile$/ }).click();
    await expect(page.getByText("Brasília")).toBeVisible();
    await expect(page.getByText(/Services · 72%/)).toBeVisible();
```

- [ ] **Step 3: Run** — dev server up → `pnpm test:e2e --project=chromium` → ALL 13 passing. Kill server.

- [ ] **Step 4: Full sweep** — `pnpm typecheck` → 0; `pnpm vitest run` → all pass; biome clean on touched files; `git status --porcelain` empty.

- [ ] **Step 5: Commit:**

```bash
git add tests/e2e/experience.spec.ts
git commit -m "test(e2e): trade/compare/forecast/profile focus views on the golden path"
```

---

## Execution handoff

Execute with **superpowers:subagent-driven-development**, strict order 1 → 7. Task 3 is the largest (multiple files); Tasks 4–5 are independent of each other but both depend on 2–3.

**After Plan C ships:** Plan D (chat responder — landing free-text → intent parse → grounded cited answers) → Plan E (polish: voice, provenance badges, AR dossier translation, dedupe, SSE resume, demo script docs).
