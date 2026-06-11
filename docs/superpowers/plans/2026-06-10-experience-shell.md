# Experience Shell Implementation Plan (Plan A of the single-page redesign)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the marketing `/` page with the single-page executive experience: sentence-composer landing → country picker overlay → agents theater → persisted run record → bento command center with focus views — wired to the existing agent SSE stream.

**Architecture:** One client-side state machine (`landing → running → ready ⇄ focus`, picker as overlay) rendered by a single `Experience` component at `/`. The existing `POST /api/agent/run` SSE stream is consumed by a new `useAgentRun` hook; on completion the server persists the full `AgentState` as a run record (`data/runs/*.json`) and emits a `saved` SSE event; `#run=<id>` rehydrates the command center from `GET /api/agent/runs/:id`. Legacy routes (`/agent`, `/dashboard`, …) stay untouched.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Tailwind (dark-first `ink-*` scale + `tamm-*` accents) · `motion` (framer-motion v12, the only new dep) · Vitest + @testing-library/react (jsdom, NO jest-dom matchers — use plain DOM assertions) · Playwright.

**Spec:** `docs/superpowers/specs/2026-06-10-single-page-experience-design.md` (sections 2, 3, 6, and the Plan-A slice of 8–11).

---

## Context primer (read first — zero-context engineer)

- **Run `pnpm vitest run <file>`** for a single pass (`pnpm test` starts watch mode). Typecheck: `pnpm typecheck`. Format/lint: `pnpm lint:fix` then `pnpm lint`.
- **SSE protocol** (existing, `src/app/api/agent/run/route.ts`): `POST {command}` → frames `data: {"event":"trace"|"final"|"error","state":…,"message":…}\n\n` plus `: keepalive\n\n` comment lines every 10s. **Every trace event carries the FULL accumulated `AgentState`** — artifacts (indicators, trade, developments, opportunities, forecast, briefing) appear progressively on the same object. This plan adds a fourth event: `{"event":"saved","runId":"…"}` after `final`.
- **`AgentState`** (`src/services/agent/state.ts`): `command, scope?{iso3,sector,…}, indicators[], analysis?, forecast?, gdpSeries?, opportunities[], risks[], trade? (BilateralTrade{exportsUsd,importsUsd,totalUsd,year,source,live}), developments? (WebResearch{answer?,results[{title,url}],…}), researchSteps?[{tool,input}], briefing? (Briefing{title,bluf,whyNow,heroMetric?,deals[],risks[],talkingPoints[],citations[],confidence,…}), briefingAr?, trace[{step,status:"start"|"done"|"error",detail?,note?,atMs}], classification`. Trace step keys: `scope, research, analyse, opportunities, briefing`.
- **i18n**: `useI18n()` → `{ locale, dir, t, setLocale }`; `t` is the catalog object from `src/lib/i18n/messages.ts` (`en` + `ar` must stay structurally identical). Some legacy components keep local `COPY` consts — new experience-level strings go in the catalog; brief-internal labels may stay local (matches `AgentRunner` precedent).
- **Country data**: `src/lib/data/iso-countries.ts` exports `ISO_COUNTRIES: {iso3,iso2,name}[]` (~193), `iso3Name(iso3)`, `flagForIso3(iso3)` (emoji). `src/lib/data/countries.ts` exports the 12 curated seeds with `nameAr` + `flagEmoji`.
- **Auth**: middleware redirects unauthenticated page requests to `/login?next=…`. `getCurrentUser()` (server, `@/lib/auth/server`) returns the user (has `email`, `clearance`) or null. Client: `useAuthedUser()` (`@/lib/auth/client`) → `{ user: ClientUser | null, loading }`.
- **A11y util**: `useTablistKeys(items, current, onChange)` (`@/lib/hooks/useTablistKeys`) — WAI-ARIA tablist arrow-key handler; tabs need `data-tab={key}`, `role="tab"`, roving `tabIndex`.
- **Styling**: dark theme classes — surfaces `bg-ink-100 border-ink-200`, muted text `text-ink-400/500/600`, bright `text-ink-800/900`, accents `text-tamm-cyan`, `bg-accent`/`accent-strong` (teal), status `signal-ok/warn/risk`. Existing keyframes: `animate-reveal`, `shimmer`, `pulse-dot`, `animate-aurora`. `prefers-reduced-motion` is globally respected for those; for `motion` components pass plain opacity fades via `useReducedMotion()` where noted.
- **Component tests**: wrap anything using `useI18n` in `<I18nProvider>…</I18nProvider>` from `@/lib/i18n/context`. Vitest config: jsdom for `tests/unit`, node for `tests/integration`, alias `@` → `src`, `globals:false` (always `import { describe, it, expect } from "vitest"`).
- **Commits**: small, conventional (`feat:`, `test:`, `chore:`), after each task's verify step.

### Out of scope for Plan A (explicit deviations from the spec, all sequenced later)
- Free-text chat input on the landing → **Plan D** (the layout leaves vertical room under the sentence).
- Counterpart agent + its tile/focus view → **Plan B** (the bento grid needs no placeholder; tiles render only when data exists).
- Compare/Forecast/Trade/Profile focus views + viz pack → **Plan C** (Plan A ships Overview, Brief, Opportunities, Sources).
- Voice, vendored SVG flags, granular live/cached/seed provenance badges, mid-run SSE resume → **Plan E** (Plan A shows per-tile source labels, e.g. "UN Comtrade · 2024", and after a refresh mid-run returns to landing; post-save refreshes rehydrate).
- `AgentRunner.tsx` is intentionally NOT refactored onto `useAgentRun` — legacy `/agent` is the demo fallback; dedupe lands in Plan E.

---

### Task 1: Add the `motion` dependency

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Install**

Run: `pnpm add motion`
Expected: `dependencies` gains `"motion": "^12.x"`.

- [ ] **Step 2: Verify it resolves with React 19**

Run: `pnpm typecheck`
Expected: exits 0 (no new errors — nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add motion (framer-motion v12) for the experience shell"
```

---

### Task 2: Role definitions + command templates

**Files:**
- Create: `src/lib/experience/roles.ts`
- Test: `tests/unit/experience-roles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ROLE_KEYS, commandFor, roleSelectionFrom } from "@/lib/experience/roles";

describe("commandFor", () => {
  it("builds the energy-minister command (router-proven shape)", () => {
    expect(commandFor("Brazil", { key: "energy" })).toBe(
      "Prepare me for Brazil's Energy Minister",
    );
  });
  it("builds sector commands for infrastructure and trade", () => {
    expect(commandFor("Germany", { key: "infrastructure" })).toBe(
      "Prepare me for Germany — infrastructure cooperation",
    );
    expect(commandFor("India", { key: "trade" })).toBe(
      "Prepare me for India — trade & investment",
    );
  });
  it("builds people-shaped commands for foreign / head of state / custom", () => {
    expect(commandFor("Japan", { key: "foreign" })).toBe(
      "Prepare me for Japan's Foreign Minister",
    );
    expect(commandFor("Brazil", { key: "headOfState" })).toBe(
      "Prepare me for a meeting with Brazil's Head of State",
    );
    expect(commandFor("Brazil", { key: "custom", customName: "Alexandre Silveira" })).toBe(
      "Prepare me for a meeting with Alexandre Silveira of Brazil",
    );
  });
  it("falls back when the custom name is blank", () => {
    expect(commandFor("Brazil", { key: "custom", customName: "  " })).toBe(
      "Prepare me for a meeting with the counterpart of Brazil",
    );
  });
  it("roleSelectionFrom validates keys and defaults to energy", () => {
    expect(roleSelectionFrom("trade")).toEqual({ key: "trade", customName: undefined });
    expect(roleSelectionFrom("bogus")).toEqual({ key: "energy" });
    expect(ROLE_KEYS).toContain("energy");
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `pnpm vitest run tests/unit/experience-roles.test.ts`
Expected: FAIL — cannot resolve `@/lib/experience/roles`.

- [ ] **Step 3: Implement**

```ts
import type { Locale } from "@/lib/i18n/messages";

export const ROLE_KEYS = [
  "energy",
  "infrastructure",
  "foreign",
  "headOfState",
  "trade",
  "custom",
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export interface RoleSelection {
  key: RoleKey;
  /** Only meaningful when key === "custom" — a free-typed name or title. */
  customName?: string;
}

export const ROLE_LABELS: Record<RoleKey, Record<Locale, string>> = {
  energy: { en: "Energy Minister", ar: "وزير الطاقة" },
  infrastructure: { en: "Infrastructure Minister", ar: "وزير البنية التحتية" },
  foreign: { en: "Foreign Minister", ar: "وزير الخارجية" },
  headOfState: { en: "Head of State", ar: "رئيس الدولة" },
  trade: { en: "Trade Minister", ar: "وزير التجارة" },
  custom: { en: "Custom…", ar: "مخصص…" },
};

export function roleSelectionFrom(key?: string, customName?: string): RoleSelection {
  return (ROLE_KEYS as readonly string[]).includes(key ?? "")
    ? { key: key as RoleKey, customName }
    : { key: "energy" };
}

/**
 * Natural-language command for the existing agent router. Shapes mirror the
 * proven examples ("Prepare me for Brazil's Energy Minister") so the router's
 * country + sector extraction keeps working unchanged.
 */
export function commandFor(countryName: string, role: RoleSelection): string {
  switch (role.key) {
    case "energy":
      return `Prepare me for ${countryName}'s Energy Minister`;
    case "infrastructure":
      return `Prepare me for ${countryName} — infrastructure cooperation`;
    case "foreign":
      return `Prepare me for ${countryName}'s Foreign Minister`;
    case "headOfState":
      return `Prepare me for a meeting with ${countryName}'s Head of State`;
    case "trade":
      return `Prepare me for ${countryName} — trade & investment`;
    case "custom":
      return `Prepare me for a meeting with ${role.customName?.trim() || "the counterpart"} of ${countryName}`;
  }
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `pnpm vitest run tests/unit/experience-roles.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/experience/roles.ts tests/unit/experience-roles.test.ts
git commit -m "feat(experience): role definitions + router-compatible command templates"
```

---

### Task 3: Experience state machine + hash codec

**Files:**
- Create: `src/lib/experience/machine.ts`
- Test: `tests/unit/experience-machine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  type ExperienceState,
  FOCUS_VIEWS,
  hashFor,
  initialState,
  parseHash,
  reduce,
} from "@/lib/experience/machine";

const BRA = { iso3: "BRA", name: "Brazil", flag: "🇧🇷" };

describe("experience machine", () => {
  it("opens and closes the picker only from landing", () => {
    const open = reduce(initialState, { type: "OPEN_PICKER" });
    expect(open.pickerOpen).toBe(true);
    const closed = reduce(open, { type: "CLOSE_PICKER" });
    expect(closed.pickerOpen).toBe(false);
    const running: ExperienceState = { ...initialState, view: { kind: "running" } };
    expect(reduce(running, { type: "OPEN_PICKER" }).pickerOpen).toBe(false);
  });

  it("selecting a country stores it and closes the picker", () => {
    const s = reduce(
      reduce(initialState, { type: "OPEN_PICKER" }),
      { type: "SELECT_COUNTRY", country: BRA },
    );
    expect(s.country).toEqual(BRA);
    expect(s.pickerOpen).toBe(false);
  });

  it("BEGIN requires a country and moves landing → running", () => {
    expect(reduce(initialState, { type: "BEGIN" }).view.kind).toBe("landing");
    const withCountry = { ...initialState, country: BRA };
    const s = reduce(withCountry, { type: "BEGIN" });
    expect(s.view.kind).toBe("running");
    expect(s.runId).toBeNull();
  });

  it("RUN_SAVED stores the id; RUN_DONE lands on ready/overview", () => {
    let s: ExperienceState = { ...initialState, country: BRA, view: { kind: "running" } };
    s = reduce(s, { type: "RUN_SAVED", runId: "run-1" });
    expect(s.runId).toBe("run-1");
    s = reduce(s, { type: "RUN_DONE" });
    expect(s.view).toEqual({ kind: "ready", focus: "overview" });
  });

  it("SET_FOCUS only applies in ready", () => {
    const ready: ExperienceState = {
      ...initialState,
      country: BRA,
      runId: "run-1",
      view: { kind: "ready", focus: "overview" },
    };
    expect(reduce(ready, { type: "SET_FOCUS", focus: "brief" }).view).toEqual({
      kind: "ready",
      focus: "brief",
    });
    expect(reduce(initialState, { type: "SET_FOCUS", focus: "brief" }).view.kind).toBe("landing");
  });

  it("HYDRATE_READY restores a full ready state; RESET keeps the chosen role", () => {
    const s = reduce(initialState, {
      type: "HYDRATE_READY",
      runId: "run-9",
      focus: "sources",
      country: BRA,
      role: { key: "trade" },
    });
    expect(s.view).toEqual({ kind: "ready", focus: "sources" });
    expect(s.runId).toBe("run-9");
    const r = reduce({ ...s, role: { key: "trade" } }, { type: "RESET" });
    expect(r.view.kind).toBe("landing");
    expect(r.country).toBeNull();
    expect(r.role).toEqual({ key: "trade" });
  });

  it("hash codec round-trips and rejects junk", () => {
    const ready: ExperienceState = {
      ...initialState,
      runId: "run-ab12",
      view: { kind: "ready", focus: "opportunities" },
    };
    expect(hashFor(ready)).toBe("#run=run-ab12&focus=opportunities");
    expect(hashFor({ ...ready, view: { kind: "ready", focus: "overview" } })).toBe(
      "#run=run-ab12",
    );
    expect(hashFor(initialState)).toBe("");
    expect(parseHash("#run=run-ab12&focus=opportunities")).toEqual({
      runId: "run-ab12",
      focus: "opportunities",
    });
    expect(parseHash("run=run-ab12&focus=nonsense")).toEqual({
      runId: "run-ab12",
      focus: "overview",
    });
    expect(parseHash("#focus=brief")).toBeNull();
    expect(parseHash("")).toBeNull();
    expect(FOCUS_VIEWS).toContain("overview");
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `pnpm vitest run tests/unit/experience-machine.test.ts`
Expected: FAIL — cannot resolve `@/lib/experience/machine`.

- [ ] **Step 3: Implement**

```ts
import type { RoleSelection } from "./roles";

export const FOCUS_VIEWS = ["overview", "brief", "opportunities", "sources"] as const;
export type FocusView = (typeof FOCUS_VIEWS)[number];

export interface CountryChoice {
  iso3: string;
  name: string;
  flag: string;
}

export type ViewState =
  | { kind: "landing" }
  | { kind: "running" }
  | { kind: "ready"; focus: FocusView };

export interface ExperienceState {
  view: ViewState;
  pickerOpen: boolean;
  country: CountryChoice | null;
  role: RoleSelection;
  runId: string | null;
}

export type ExperienceEvent =
  | { type: "OPEN_PICKER" }
  | { type: "CLOSE_PICKER" }
  | { type: "SELECT_COUNTRY"; country: CountryChoice }
  | { type: "SET_ROLE"; role: RoleSelection }
  | { type: "BEGIN" }
  | { type: "RUN_SAVED"; runId: string }
  | { type: "RUN_DONE" }
  | { type: "SET_FOCUS"; focus: FocusView }
  | {
      type: "HYDRATE_READY";
      runId: string;
      focus: FocusView;
      country: CountryChoice;
      role: RoleSelection;
    }
  | { type: "RESET" };

export const initialState: ExperienceState = {
  view: { kind: "landing" },
  pickerOpen: false,
  country: null,
  role: { key: "energy" },
  runId: null,
};

export function reduce(state: ExperienceState, event: ExperienceEvent): ExperienceState {
  switch (event.type) {
    case "OPEN_PICKER":
      return state.view.kind === "landing" ? { ...state, pickerOpen: true } : state;
    case "CLOSE_PICKER":
      return { ...state, pickerOpen: false };
    case "SELECT_COUNTRY":
      return { ...state, country: event.country, pickerOpen: false };
    case "SET_ROLE":
      return { ...state, role: event.role };
    case "BEGIN":
      if (state.view.kind !== "landing" || !state.country) return state;
      return { ...state, view: { kind: "running" }, runId: null };
    case "RUN_SAVED":
      return { ...state, runId: event.runId };
    case "RUN_DONE":
      return state.view.kind === "running"
        ? { ...state, view: { kind: "ready", focus: "overview" } }
        : state;
    case "SET_FOCUS":
      return state.view.kind === "ready"
        ? { ...state, view: { kind: "ready", focus: event.focus } }
        : state;
    case "HYDRATE_READY":
      return {
        view: { kind: "ready", focus: event.focus },
        pickerOpen: false,
        country: event.country,
        role: event.role,
        runId: event.runId,
      };
    case "RESET":
      return { ...initialState, role: state.role };
  }
}

/** URL-hash projection of the state — only saved, ready runs are addressable. */
export function hashFor(state: ExperienceState): string {
  if (state.view.kind !== "ready" || !state.runId) return "";
  return state.view.focus === "overview"
    ? `#run=${state.runId}`
    : `#run=${state.runId}&focus=${state.view.focus}`;
}

export function parseHash(hash: string): { runId: string; focus: FocusView } | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const runId = params.get("run");
  if (!runId) return null;
  const f = params.get("focus") ?? "overview";
  const focus = (FOCUS_VIEWS as readonly string[]).includes(f) ? (f as FocusView) : "overview";
  return { runId, focus };
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `pnpm vitest run tests/unit/experience-machine.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/experience/machine.ts tests/unit/experience-machine.test.ts
git commit -m "feat(experience): view state machine + run/focus hash codec"
```

---

### Task 4: Region classification for all countries

**Files:**
- Create: `src/lib/data/regions.ts`
- Test: `tests/unit/regions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ISO_COUNTRIES } from "@/lib/data/iso-countries";
import { REGION_LABELS, REGION_OF, REGIONS, regionOf } from "@/lib/data/regions";

describe("regions", () => {
  it("covers every ISO country — on failure, add each printed code to its bucket", () => {
    const missing = ISO_COUNTRIES.filter((c) => !REGION_OF[c.iso3]).map((c) => c.iso3);
    expect(missing).toEqual([]);
  });
  it("spot checks", () => {
    expect(regionOf("BRA")).toBe("americas");
    expect(regionOf("DEU")).toBe("europe");
    expect(regionOf("ARE")).toBe("mea");
    expect(regionOf("SGP")).toBe("apac");
    expect(regionOf("XXX")).toBeNull();
  });
  it("labels exist for every region in both locales", () => {
    for (const r of REGIONS) {
      expect(REGION_LABELS[r].en.length).toBeGreaterThan(0);
      expect(REGION_LABELS[r].ar.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `pnpm vitest run tests/unit/regions.test.ts`
Expected: FAIL — cannot resolve `@/lib/data/regions`.

- [ ] **Step 3: Implement**

```ts
export const REGIONS = ["americas", "europe", "mea", "apac"] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_LABELS: Record<Region, { en: string; ar: string }> = {
  americas: { en: "Americas", ar: "الأمريكتان" },
  europe: { en: "Europe", ar: "أوروبا" },
  mea: { en: "Middle East & Africa", ar: "الشرق الأوسط وأفريقيا" },
  apac: { en: "Asia-Pacific", ar: "آسيا والمحيط الهادئ" },
};

const AMERICAS = [
  "ATG", "ARG", "BHS", "BRB", "BLZ", "BOL", "BRA", "CAN", "CHL", "COL",
  "CRI", "CUB", "DMA", "DOM", "ECU", "SLV", "GRD", "GTM", "GUY", "HTI",
  "HND", "JAM", "MEX", "NIC", "PAN", "PRY", "PER", "KNA", "LCA", "VCT",
  "SUR", "TTO", "USA", "URY", "VEN",
];
const EUROPE = [
  "ALB", "AND", "AUT", "BLR", "BEL", "BIH", "BGR", "HRV", "CYP", "CZE",
  "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "ISL", "IRL", "ITA",
  "LVA", "LIE", "LTU", "LUX", "MLT", "MDA", "MCO", "MNE", "NLD", "MKD",
  "NOR", "POL", "PRT", "ROU", "RUS", "SMR", "SRB", "SVK", "SVN", "ESP",
  "SWE", "CHE", "UKR", "GBR", "VAT", "XKX",
];
const MEA = [
  "DZA", "AGO", "BHR", "BEN", "BWA", "BFA", "BDI", "CPV", "CMR", "CAF",
  "TCD", "COM", "COG", "COD", "CIV", "DJI", "EGY", "GNQ", "ERI", "SWZ",
  "ETH", "GAB", "GMB", "GHA", "GIN", "GNB", "IRN", "IRQ", "ISR", "JOR",
  "KEN", "KWT", "LBN", "LSO", "LBR", "LBY", "MDG", "MWI", "MLI", "MRT",
  "MUS", "MAR", "MOZ", "NAM", "NER", "NGA", "OMN", "PSE", "QAT", "RWA",
  "STP", "SAU", "SEN", "SYC", "SLE", "SOM", "ZAF", "SSD", "SDN", "SYR",
  "TZA", "TGO", "TUN", "TUR", "UGA", "ARE", "YEM", "ZMB", "ZWE",
];
const APAC = [
  "AFG", "ARM", "AUS", "AZE", "BGD", "BTN", "BRN", "KHM", "CHN", "FJI",
  "GEO", "IND", "IDN", "JPN", "KAZ", "KIR", "PRK", "KOR", "KGZ", "LAO",
  "MYS", "MDV", "MHL", "FSM", "MNG", "MMR", "NRU", "NPL", "NZL", "PAK",
  "PLW", "PNG", "PHL", "WSM", "SGP", "SLB", "LKA", "TJK", "THA", "TLS",
  "TON", "TKM", "TUV", "UZB", "VUT", "VNM", "TWN",
];

export const REGION_OF: Record<string, Region> = Object.fromEntries([
  ...AMERICAS.map((c) => [c, "americas"] as const),
  ...EUROPE.map((c) => [c, "europe"] as const),
  ...MEA.map((c) => [c, "mea"] as const),
  ...APAC.map((c) => [c, "apac"] as const),
]);

export function regionOf(iso3: string): Region | null {
  return REGION_OF[iso3] ?? null;
}
```

- [ ] **Step 4: Run the test — iterate to green**

Run: `pnpm vitest run tests/unit/regions.test.ts`
Expected: the coverage test prints any iso3 codes missing from the buckets (the curated list above may not exactly match `ISO_COUNTRIES`). Add each printed code to its geographically correct array and re-run until PASS. If a code in the arrays does not exist in `ISO_COUNTRIES` (e.g. `XKX`, `TWN`), that is harmless — leave it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/regions.ts tests/unit/regions.test.ts
git commit -m "feat(data): continental region classification for all ISO countries"
```

---

### Task 5: Trace helpers (+ degraded-mode detector)

**Files:**
- Create: `src/lib/experience/trace.ts`
- Test: `tests/unit/experience-trace.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { AgentState } from "@/services/agent/state";
import { doneCount, lastDetail, looksDegraded, notesFor, statusFor } from "@/lib/experience/trace";

function stateWith(trace: AgentState["trace"], extra?: Partial<AgentState>): AgentState {
  return {
    command: "x",
    indicators: [],
    passages: [],
    opportunities: [],
    risks: [],
    deliverables: {},
    trace,
    classification: "internal",
    ...extra,
  };
}

describe("trace helpers", () => {
  const s = stateWith([
    { step: "scope", status: "start", atMs: 1 },
    { step: "scope", status: "done", detail: "BRA · energy", atMs: 5 },
    { step: "research", status: "start", note: "World Bank: GDP", atMs: 6 },
    { step: "research", status: "start", note: "Comtrade: $4.3B", atMs: 9 },
  ]);

  it("statusFor returns the LAST status per step, idle when absent or null state", () => {
    expect(statusFor(s, "scope")).toBe("done");
    expect(statusFor(s, "research")).toBe("start");
    expect(statusFor(s, "briefing")).toBe("idle");
    expect(statusFor(null, "scope")).toBe("idle");
  });

  it("lastDetail and notesFor aggregate per step", () => {
    expect(lastDetail(s, "scope")).toBe("BRA · energy");
    expect(notesFor(s, "research")).toEqual(["World Bank: GDP", "Comtrade: $4.3B"]);
    expect(notesFor(s, "scope")).toEqual([]);
  });

  it("doneCount counts done steps among the given keys", () => {
    expect(doneCount(s, ["scope", "research", "briefing"])).toBe(1);
    expect(doneCount(null, ["scope"])).toBe(0);
  });

  it("looksDegraded flags the template-fallback signature (title === rationale)", () => {
    expect(looksDegraded(null)).toBe(false);
    expect(looksDegraded(s)).toBe(false);
    const degraded = stateWith([], {
      opportunities: [
        {
          partnerIso3: "BRA",
          sector: "energy",
          title: "Smart-port & digital-infrastructure standards",
          score: 70,
          rationale: "Smart-port & digital-infrastructure standards",
          signals: {},
        },
      ],
    });
    expect(looksDegraded(degraded)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `pnpm vitest run tests/unit/experience-trace.test.ts`
Expected: FAIL — cannot resolve `@/lib/experience/trace`.

- [ ] **Step 3: Implement**

```ts
import type { AgentState } from "@/services/agent/state";

export type StepStatus = "idle" | "start" | "done" | "error";

export function statusFor(state: AgentState | null, key: string): StepStatus {
  if (!state) return "idle";
  let s: StepStatus = "idle";
  for (const t of state.trace) if (t.step === key) s = t.status as StepStatus;
  return s;
}

export function lastDetail(state: AgentState | null, key: string): string | undefined {
  if (!state) return undefined;
  let d: string | undefined;
  for (const t of state.trace) if (t.step === key) d = t.detail;
  return d;
}

export function notesFor(state: AgentState | null, key: string): string[] {
  if (!state) return [];
  return state.trace.flatMap((t) => (t.step === key && t.note ? [t.note] : []));
}

export function doneCount(state: AgentState | null, keys: readonly string[]): number {
  return keys.filter((k) => statusFor(state, k) === "done").length;
}

/**
 * CLAUDE.md "silent-fallback" tell: when the local LLM was never reached, the
 * deterministic templates set opportunity title === rationale. Surfacing this
 * honestly is a spec requirement (degraded composition mode).
 */
export function looksDegraded(state: AgentState | null): boolean {
  if (!state) return false;
  return state.opportunities.some(
    (o) => o.title.length > 0 && o.title === o.rationale,
  );
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `pnpm vitest run tests/unit/experience-trace.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/experience/trace.ts tests/unit/experience-trace.test.ts
git commit -m "feat(experience): trace status helpers + degraded-mode detector"
```

---

### Task 6: Focus-trap hook

**Files:**
- Create: `src/lib/hooks/useFocusTrap.ts`
- Test: `tests/unit/use-focus-trap.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  return (
    <div ref={ref}>
      <button type="button">first</button>
      <button type="button">last</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  it("focuses the first focusable on mount", () => {
    render(<Dialog onClose={() => {}} />);
    expect((document.activeElement as HTMLElement).textContent).toBe("first");
  });

  it("wraps Tab from last → first and Shift+Tab from first → last", () => {
    const { getByText } = render(<Dialog onClose={() => {}} />);
    (getByText("last") as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect((document.activeElement as HTMLElement).textContent).toBe("first");
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect((document.activeElement as HTMLElement).textContent).toBe("last");
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `pnpm vitest run tests/unit/use-focus-trap.test.tsx`
Expected: FAIL — cannot resolve `@/lib/hooks/useFocusTrap`.

- [ ] **Step 3: Implement**

```ts
"use client";

import { type RefObject, useEffect } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Minimal WAI-ARIA dialog focus trap: focuses the first focusable on activate,
 * cycles Tab/Shift+Tab inside the container, closes on Escape, and restores
 * focus to the previously focused element on deactivate.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const prev = document.activeElement as HTMLElement | null;
    root.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [active, onClose, ref]);
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `pnpm vitest run tests/unit/use-focus-trap.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hooks/useFocusTrap.ts tests/unit/use-focus-trap.test.tsx
git commit -m "feat(hooks): focus-trap hook for the picker dialog"
```

---

### Task 7: Shared AgentState fixture

**Files:**
- Create: `tests/fixtures/agent-state.ts`

This fixture is shared by unit tests (repo, hook) and the Playwright e2e (which is why it uses a RELATIVE type import — the `@` alias does not resolve under Playwright's transpiler; `import type` erases at runtime so both runners are happy).

- [ ] **Step 1: Create the fixture**

```ts
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
    results: [{ title: "Brazil SAF mandate grows", url: "https://example.org/saf" }],
    source: "tavily",
    live: false,
  } as AgentState["developments"],
  researchSteps: [
    { tool: "get_indicators", input: "BRA" },
    { tool: "bilateral_trade", input: "ARE-BRA" },
  ],
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
```

Note: `developments` is cast through `AgentState["developments"]` because `WebResult` (in `src/services/live/tavily.ts`) may declare more optional fields than the UI consumes (`title`, `url`). If `pnpm typecheck` complains anyway, open that interface and add the missing required fields to the fixture object instead of widening the cast.

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: exits 0. If the `briefing.risks[0].likelihood` literal errors, check `LIKELIHOOD_BANDS` in `src/services/agent/state.ts` and use one of its exact values.

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/agent-state.ts
git commit -m "test: shared AgentState fixture + SSE body encoder"
```

---

### Task 8: `useAgentRun` SSE hook

**Files:**
- Create: `src/lib/hooks/useAgentRun.ts`
- Test: `tests/unit/use-agent-run.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { FIXTURE_STATE, sseBody } from "../fixtures/agent-state";
import { useAgentRun } from "@/lib/hooks/useAgentRun";

function sseResponse(body: string): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(body));
      c.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useAgentRun", () => {
  it("parses trace, final and saved events from the stream", async () => {
    const body =
      ": connected\n\n" +
      sseBody([
        { event: "trace", state: { ...FIXTURE_STATE, briefing: undefined } },
        { event: "final", state: FIXTURE_STATE },
        { event: "saved", runId: "run-test-1" },
      ]);
    const fetchMock = vi.fn(async () => sseResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAgentRun());
    await act(async () => {
      await result.current.start("Prepare me for Brazil's Energy Minister", "energy");
    });

    await waitFor(() => {
      expect(result.current.final?.briefing?.title).toBe("Brazil — Energy Minister briefing");
      expect(result.current.runId).toBe("run-test-1");
      expect(result.current.running).toBe(false);
      expect(result.current.error).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent/run",
      expect.objectContaining({ method: "POST" }),
    );
    const sent = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(sent).toEqual({ command: "Prepare me for Brazil's Energy Minister", role: "energy" });
  });

  it("surfaces error events and non-OK responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(sseBody([{ event: "error", message: "model offline" }]))),
    );
    const { result } = renderHook(() => useAgentRun());
    await act(async () => {
      await result.current.start("x y", "energy");
    });
    await waitFor(() => expect(result.current.error).toBe("model offline"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const { result: r2 } = renderHook(() => useAgentRun());
    await act(async () => {
      await r2.current.start("x y", "energy");
    });
    await waitFor(() => expect(r2.current.error).toContain("boom"));
  });

  it("reset clears all run state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(sseBody([{ event: "final", state: FIXTURE_STATE }]))),
    );
    const { result } = renderHook(() => useAgentRun());
    await act(async () => {
      await result.current.start("x y", "energy");
    });
    await waitFor(() => expect(result.current.final).not.toBeNull());
    act(() => result.current.reset());
    expect(result.current.state).toBeNull();
    expect(result.current.final).toBeNull();
    expect(result.current.runId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `pnpm vitest run tests/unit/use-agent-run.test.ts`
Expected: FAIL — cannot resolve `@/lib/hooks/useAgentRun`.

- [ ] **Step 3: Implement**

```ts
"use client";

import type { AgentState } from "@/services/agent/state";
import { useCallback, useRef, useState } from "react";

export interface RunEvent {
  event: "trace" | "final" | "error" | "saved";
  state?: AgentState;
  message?: string;
  runId?: string;
}

export interface AgentRunHandle {
  running: boolean;
  /** Latest accumulated state (every trace frame carries the full object). */
  state: AgentState | null;
  final: AgentState | null;
  /** Persisted run record id, present once the server emits `saved`. */
  runId: string | null;
  error: string | null;
  start: (command: string, role: string) => Promise<void>;
  abort: () => void;
  reset: () => void;
}

export function useAgentRun(): AgentRunHandle {
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<AgentState | null>(null);
  const [final, setFinal] = useState<AgentState | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
    setState(null);
    setFinal(null);
    setRunId(null);
    setError(null);
  }, []);

  const start = useCallback(async (command: string, role: string) => {
    abortRef.current?.abort();
    setRunning(true);
    setState(null);
    setFinal(null);
    setRunId(null);
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, role }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `agent run failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim()) as RunEvent;
          if (ev.event === "trace" && ev.state) setState(ev.state);
          else if (ev.event === "final" && ev.state) {
            setState(ev.state);
            setFinal(ev.state);
          } else if (ev.event === "saved" && ev.runId) setRunId(ev.runId);
          else if (ev.event === "error") setError(ev.message ?? "agent error");
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  return { running, state, final, runId, error, start, abort, reset };
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `pnpm vitest run tests/unit/use-agent-run.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hooks/useAgentRun.ts tests/unit/use-agent-run.test.ts
git commit -m "feat(hooks): useAgentRun SSE consumer (trace/final/saved/error)"
```

---

### Task 9: Run-record repository

**Files:**
- Create: `src/services/repo/agent-runs.ts`
- Modify: `.gitignore` (add `data/runs/`)
- Test: `tests/unit/agent-runs-repo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIXTURE_STATE } from "../fixtures/agent-state";
import {
  __resetRunsForTest,
  getRun,
  listRuns,
  saveRun,
} from "@/services/repo/agent-runs";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-runs-"));
  process.env.RUNS_DIR = dir;
  __resetRunsForTest();
});

afterEach(() => {
  delete process.env.RUNS_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
  __resetRunsForTest();
});

describe("agent-runs repo", () => {
  it("saves and reads a run, writing one JSON file", () => {
    const rec = saveRun({
      command: FIXTURE_STATE.command,
      role: "energy",
      state: FIXTURE_STATE,
      createdBy: "exec@example.ae",
      durationMs: 1234,
    });
    expect(rec.id).toMatch(/^run-/);
    expect(rec.iso3).toBe("BRA");
    expect(rec.title).toBe("Brazil — Energy Minister briefing");
    expect(getRun(rec.id)?.state.briefing?.bluf).toContain("biofuels");
    expect(fs.readdirSync(dir)).toEqual([`${rec.id}.json`]);
  });

  it("lists newest-first summaries without the heavy state", () => {
    const a = saveRun({
      command: "a b",
      role: "energy",
      state: FIXTURE_STATE,
      createdBy: "u",
      durationMs: 1,
    });
    const b = saveRun({
      command: "c d",
      role: "trade",
      state: FIXTURE_STATE,
      createdBy: "u",
      durationMs: 1,
    });
    const list = listRuns(8);
    expect(list.map((r) => r.id)).toEqual([b.id, a.id].sort((x, y) => {
      const ra = getRun(x)?.createdAt ?? "";
      const rb = getRun(y)?.createdAt ?? "";
      return rb.localeCompare(ra);
    }));
    expect(list[0]).not.toHaveProperty("state");
    expect(list[0]).toHaveProperty("classification", "internal");
  });

  it("reloads records from disk after a cold start", () => {
    const rec = saveRun({
      command: "a b",
      role: "energy",
      state: FIXTURE_STATE,
      createdBy: "u",
      durationMs: 1,
    });
    __resetRunsForTest();
    expect(getRun(rec.id)?.id).toBe(rec.id);
    expect(listRuns(8).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `pnpm vitest run tests/unit/agent-runs-repo.test.ts`
Expected: FAIL — cannot resolve `@/services/repo/agent-runs`.

- [ ] **Step 3: Implement**

```ts
import fs from "node:fs";
import path from "node:path";
import type { AgentState } from "@/services/agent/state";
import type { Classification } from "@/types";

export interface RunSummary {
  id: string;
  title: string;
  iso3: string;
  role?: string;
  createdAt: string;
  createdBy: string;
  classification: Classification;
}

export interface RunRecord extends RunSummary {
  command: string;
  durationMs: number;
  state: AgentState;
}

declare global {
  // eslint-disable-next-line no-var
  var __ciAgentRuns: Map<string, RunRecord> | undefined;
}

function runsDir(): string {
  return process.env.RUNS_DIR ?? path.join(process.cwd(), "data", "runs");
}

function loadFromDisk(map: Map<string, RunRecord>): void {
  try {
    const d = runsDir();
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith(".json")) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(d, f), "utf8")) as RunRecord;
        if (rec?.id) map.set(rec.id, rec);
      } catch {
        /* skip corrupt file */
      }
    }
  } catch {
    /* unreadable dir — serve from memory only */
  }
}

function store(): Map<string, RunRecord> {
  if (!globalThis.__ciAgentRuns) {
    globalThis.__ciAgentRuns = new Map();
    loadFromDisk(globalThis.__ciAgentRuns);
  }
  return globalThis.__ciAgentRuns;
}

export function saveRun(input: {
  command: string;
  role?: string;
  state: AgentState;
  createdBy: string;
  durationMs: number;
}): RunRecord {
  const id = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const rec: RunRecord = {
    id,
    command: input.command,
    role: input.role,
    title: input.state.briefing?.title || input.command,
    iso3: input.state.scope?.iso3 ?? "—",
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    classification: input.state.classification,
    durationMs: input.durationMs,
    state: input.state,
  };
  store().set(id, rec);
  try {
    fs.mkdirSync(runsDir(), { recursive: true });
    fs.writeFileSync(path.join(runsDir(), `${id}.json`), JSON.stringify(rec), "utf8");
  } catch {
    /* best-effort persistence; the in-memory copy still serves this process */
  }
  return rec;
}

export function getRun(id: string): RunRecord | undefined {
  return store().get(id);
}

export function listRuns(limit = 8): RunSummary[] {
  return [...store().values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(({ state: _state, command: _command, durationMs: _durationMs, ...summary }) => summary);
}

/** Test hook: drop the memory cache so a fresh RUNS_DIR is re-scanned. */
export function __resetRunsForTest(): void {
  globalThis.__ciAgentRuns = undefined;
}
```

- [ ] **Step 4: Add the gitignore entry**

In `.gitignore`, after the existing `data/rag-chunks.json` line, add:

```
# Persisted agent run records (runtime-mutated)
data/runs/
```

- [ ] **Step 5: Run the test — must pass**

Run: `pnpm vitest run tests/unit/agent-runs-repo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/services/repo/agent-runs.ts tests/unit/agent-runs-repo.test.ts .gitignore
git commit -m "feat(repo): file-backed agent run records (save/get/list)"
```

---

### Task 10: Persist runs in the SSE route + run-fetch endpoints

**Files:**
- Modify: `src/app/api/agent/run/route.ts`
- Create: `src/app/api/agent/runs/route.ts`
- Create: `src/app/api/agent/runs/[id]/route.ts`

- [ ] **Step 1: Extend the run route**

In `src/app/api/agent/run/route.ts`:

(a) Add imports at the top:

```ts
import type { AgentState } from "@/services/agent/state";
import { saveRun } from "@/services/repo/agent-runs";
```

(b) Replace the body schema:

```ts
const BodySchema = z.object({
  command: z.string().min(2).max(500),
  role: z.string().max(40).optional(),
});
```

(c) Replace the `try { for await … }` block inside `start(controller)` with:

```ts
      const t0 = Date.now();
      let lastFinal: AgentState | null = null;
      try {
        for await (const ev of runAgent(parsed.data.command, { classification })) {
          if (ev.event === "final" && ev.state) lastFinal = ev.state as AgentState;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
        if (lastFinal) {
          const rec = saveRun({
            command: parsed.data.command,
            role: parsed.data.role,
            state: lastFinal,
            createdBy: user.email ?? "system",
            durationMs: Date.now() - t0,
          });
          logAudit(user, "agent.run.saved", "briefing", {
            classification,
            meta: { runId: rec.id, iso3: rec.iso3 },
          });
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ event: "saved", runId: rec.id })}\n\n`),
          );
        }
      } catch (e) {
```

(keep the existing `catch`/`finally` exactly as they are). If TypeScript complains about `ev.event` / `ev.state`, check the yield type of `runAgent` in `src/services/agent/graph.ts` and annotate the loop variable accordingly (`as { event: string; state?: AgentState }` is acceptable). If `user.email` does not exist on the user type, use the user's id/sub field instead — check `getCurrentUser` in `src/lib/auth/server.ts`.

- [ ] **Step 2: Create the list endpoint** — `src/app/api/agent/runs/route.ts`

```ts
import { getCurrentUser } from "@/lib/auth/server";
import { listRuns } from "@/services/repo/agent-runs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, secret: 3 };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const max = RANK[user.clearance] ?? 1;
  const runs = listRuns(24)
    .filter((r) => (RANK[r.classification] ?? 1) <= max)
    .slice(0, 8);
  return NextResponse.json({ runs });
}
```

- [ ] **Step 3: Create the fetch endpoint** — `src/app/api/agent/runs/[id]/route.ts`

```ts
import { getCurrentUser } from "@/lib/auth/server";
import { getRun } from "@/services/repo/agent-runs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, secret: 3 };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  if ((RANK[run.classification] ?? 1) > (RANK[user.clearance] ?? 1)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ run });
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm vitest run tests/unit`
Expected: both exit 0 (existing suites unaffected). Route behavior is covered end-to-end in Task 20.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent/run/route.ts src/app/api/agent/runs
git commit -m "feat(api): persist agent runs + saved SSE event + run fetch/list endpoints"
```

---

### Task 11: i18n catalog strings (EN + AR)

**Files:**
- Modify: `src/lib/i18n/messages.ts`

- [ ] **Step 1: Add the `experience` block to the `en` object** (top level, after `shell`):

```ts
    experience: {
      lead: "Prepare me for a meeting with",
      connector: "’s",
      selectCountry: "Select country",
      roleLabel: "Counterpart",
      customRolePlaceholder: "Name or title…",
      begin: "Begin briefing",
      hint: "Autonomous research · live data · bilingual brief",
      recent: "Recent briefings",
      searchPlaceholder: "Search 195 countries…",
      featured: "Featured",
      all: "All",
      noMatches: "No countries match",
      closePicker: "Close",
      working: "Agents working…",
      ready: "Briefing ready",
      newBriefing: "New briefing",
      toolFeed: "Live tool calls",
      focusLabel: "Focus views",
      degraded:
        "Degraded composition mode — local model unreachable, deterministic template served",
      back: "Back",
      retry: "Retry",
      steps: {
        scope: "Scope the request",
        research: "Retrieve real data",
        analyse: "Analyse & forecast",
        opportunities: "Identify opportunities",
        briefing: "Compose briefing",
      },
      focus: {
        overview: "Overview",
        brief: "Brief",
        opportunities: "Opportunities",
        sources: "Sources",
      },
      tiles: {
        bluf: "Recommendation",
        trade: "Trade with UAE",
        topOpportunity: "Top opportunity",
        indicators: "Key indicators",
        forecast: "Forecast",
        developments: "Live developments",
      },
    },
```

- [ ] **Step 2: Add the mirrored block to the `ar` object** (same position):

```ts
    experience: {
      lead: "جهّزني لاجتماعٍ مع",
      connector: "—",
      selectCountry: "اختر الدولة",
      roleLabel: "الطرف المقابل",
      customRolePlaceholder: "الاسم أو الصفة…",
      begin: "ابدأ الإحاطة",
      hint: "بحث ذاتي · بيانات حية · إحاطة ثنائية اللغة",
      recent: "إحاطات حديثة",
      searchPlaceholder: "ابحث في 195 دولة…",
      featured: "مميّزة",
      all: "الكل",
      noMatches: "لا توجد نتائج",
      closePicker: "إغلاق",
      working: "الوكلاء يعملون…",
      ready: "الإحاطة جاهزة",
      newBriefing: "إحاطة جديدة",
      toolFeed: "نداءات الأدوات الحية",
      focusLabel: "طرق العرض",
      degraded: "وضع مخفّض — النموذج المحلي غير متاح، تم استخدام قالبٍ جاهز",
      back: "رجوع",
      retry: "إعادة المحاولة",
      steps: {
        scope: "تحديد نطاق الطلب",
        research: "جلب بيانات حقيقية",
        analyse: "التحليل والتنبؤ",
        opportunities: "تحديد الفرص",
        briefing: "صياغة الإحاطة",
      },
      focus: {
        overview: "نظرة عامة",
        brief: "الإحاطة",
        opportunities: "الفرص",
        sources: "المصادر",
      },
      tiles: {
        bluf: "التوصية",
        trade: "التجارة مع الإمارات",
        topOpportunity: "أبرز فرصة",
        indicators: "مؤشرات رئيسية",
        forecast: "التوقعات",
        developments: "تطورات حية",
      },
    },
```

- [ ] **Step 3: Verify the catalog stays structurally identical**

Run: `pnpm typecheck`
Expected: exits 0 — if the `Messages` type is derived from `en`, any key mismatch in `ar` fails here.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/messages.ts
git commit -m "feat(i18n): experience-shell strings (EN/AR)"
```

---

### Task 12: Backdrop + slim header

**Files:**
- Create: `src/components/experience/ExperienceBackdrop.tsx`
- Create: `src/components/experience/ExperienceHeader.tsx`

- [ ] **Step 1: Create the backdrop** (the aurora atmosphere lifted from the current `/` page so the look carries over):

```tsx
export function ExperienceBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -left-40 -top-48 h-[42rem] w-[42rem] animate-aurora rounded-full bg-tamm-teal/30 blur-[130px]" />
      <div className="absolute -right-48 top-10 h-[38rem] w-[38rem] animate-aurora-slow rounded-full bg-tamm-cyan/20 blur-[140px]" />
      <div className="absolute bottom-[-12rem] left-1/3 h-[34rem] w-[34rem] animate-aurora rounded-full bg-[#1b5e7e]/25 blur-[150px]" />
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(120% 80% at 50% 0%, #000 35%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(120% 80% at 50% 0%, #000 35%, transparent 80%)",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-tamm-cyan/60 to-transparent" />
    </div>
  );
}
```

- [ ] **Step 2: Create the header**

```tsx
"use client";

import { useAuthedUser } from "@/lib/auth/client";
import { useI18n } from "@/lib/i18n/context";
import Link from "next/link";
import { useState } from "react";

export function ExperienceHeader() {
  const { locale, setLocale, t } = useI18n();
  const { user } = useAuthedUser();
  const [menuOpen, setMenuOpen] = useState(false);

  const item =
    "block rounded px-3 py-1.5 text-sm text-ink-700 hover:bg-ink-150 hover:text-ink-900";

  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-tamm-teal to-tamm-cyan font-bold text-[#06121a]">
          ◈
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">{t.appName}</div>
          {user && <div className="text-2xs text-white/40">{user.name}</div>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <span className="rounded-full border border-tamm-olive/40 bg-tamm-olive/10 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-tamm-olive">
            {user.clearance}
          </span>
        )}
        <div className="inline-flex overflow-hidden rounded-full border border-white/15 text-xs">
          <button
            type="button"
            onClick={() => setLocale("en")}
            className={locale !== "ar" ? "bg-white/15 px-3 py-1 text-white" : "px-3 py-1 text-white/50"}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLocale("ar")}
            className={locale === "ar" ? "bg-white/15 px-3 py-1 text-white" : "px-3 py-1 text-white/50"}
          >
            عربي
          </button>
        </div>
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More pages"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 hover:text-white"
          >
            ☰
          </button>
          {menuOpen && (
            <nav
              aria-label="Legacy pages"
              className="absolute end-0 top-9 z-30 w-44 rounded-md border border-ink-200 bg-ink-100 p-1 shadow-pop"
            >
              <Link href="/dashboard" className={item}>
                {t.nav.dashboard}
              </Link>
              <Link href="/briefings" className={item}>
                {t.nav.briefings}
              </Link>
              <Link href="/sources" className={item}>
                {t.nav.sources}
              </Link>
              <Link href="/admin" className={item}>
                {t.nav.admin}
              </Link>
              <Link href="/settings" className={item}>
                {t.nav.settings}
              </Link>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: exits 0. (If `ClientUser` lacks `name`, check `src/lib/auth/client.ts` and use the field it does expose, e.g. `email`.)

- [ ] **Step 4: Commit**

```bash
git add src/components/experience/ExperienceBackdrop.tsx src/components/experience/ExperienceHeader.tsx
git commit -m "feat(experience): backdrop + slim header (locale, clearance, legacy menu)"
```

---

### Task 13: Featured-country helpers + sentence composer

**Files:**
- Create: `src/lib/experience/featured.ts`
- Create: `src/components/experience/SentenceComposer.tsx`
- Test: `tests/unit/sentence-composer.test.tsx`

- [ ] **Step 1: Create the featured helpers**

```ts
import { COUNTRIES } from "@/lib/data/countries";

/** The 12 curated seeds + Indonesia & Singapore (named in the challenge guide). */
export const FEATURED_ISO3: readonly string[] = [
  "ARE", "SAU", "USA", "GBR", "FRA", "DEU", "JPN",
  "KOR", "CHN", "IND", "BRA", "ZAF", "IDN", "SGP",
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
```

- [ ] **Step 2: Write the failing composer test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/context";
import { SentenceComposer } from "@/components/experience/SentenceComposer";

const BRA = { iso3: "BRA", name: "Brazil", flag: "🇧🇷" };

function setup(country: typeof BRA | null) {
  const onOpenPicker = vi.fn();
  const onRole = vi.fn();
  const onBegin = vi.fn();
  const utils = render(
    <I18nProvider>
      <SentenceComposer
        country={country}
        role={{ key: "energy" }}
        busy={false}
        onOpenPicker={onOpenPicker}
        onRole={onRole}
        onBegin={onBegin}
      />
    </I18nProvider>,
  );
  return { onOpenPicker, onRole, onBegin, ...utils };
}

describe("SentenceComposer", () => {
  it("opens the picker from the country slot and disables Begin without a country", () => {
    const { onOpenPicker, onBegin, getByRole } = setup(null);
    fireEvent.click(getByRole("button", { name: /select country/i }));
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
    const begin = getByRole("button", { name: /begin briefing/i }) as HTMLButtonElement;
    expect(begin.disabled).toBe(true);
    fireEvent.click(begin);
    expect(onBegin).not.toHaveBeenCalled();
  });

  it("shows the chosen country, changes role, and begins", () => {
    const { onRole, onBegin, getByRole, getByText } = setup(BRA);
    expect(getByText(/Brazil/)).toBeTruthy();
    fireEvent.change(getByRole("combobox"), { target: { value: "trade" } });
    expect(onRole).toHaveBeenCalledWith({ key: "trade", customName: undefined });
    const begin = getByRole("button", { name: /begin briefing/i }) as HTMLButtonElement;
    expect(begin.disabled).toBe(false);
    fireEvent.click(begin);
    expect(onBegin).toHaveBeenCalledTimes(1);
  });

  it("shows the custom-name input only for the custom role", () => {
    const { queryByPlaceholderText, rerender } = setup(BRA);
    expect(queryByPlaceholderText(/name or title/i)).toBeNull();
    rerender(
      <I18nProvider>
        <SentenceComposer
          country={BRA}
          role={{ key: "custom", customName: "" }}
          busy={false}
          onOpenPicker={() => {}}
          onRole={() => {}}
          onBegin={() => {}}
        />
      </I18nProvider>,
    );
    expect(queryByPlaceholderText(/name or title/i)).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run it — must fail**

Run: `pnpm vitest run tests/unit/sentence-composer.test.tsx`
Expected: FAIL — cannot resolve `@/components/experience/SentenceComposer`.

- [ ] **Step 4: Implement the composer**

```tsx
"use client";

import type { CountryChoice } from "@/lib/experience/machine";
import { arNameFor } from "@/lib/experience/featured";
import { ROLE_KEYS, ROLE_LABELS, type RoleSelection } from "@/lib/experience/roles";
import { useI18n } from "@/lib/i18n/context";
import { motion } from "motion/react";

export function SentenceComposer({
  country,
  role,
  busy,
  onOpenPicker,
  onRole,
  onBegin,
}: {
  country: CountryChoice | null;
  role: RoleSelection;
  busy: boolean;
  onOpenPicker: () => void;
  onRole: (r: RoleSelection) => void;
  onBegin: () => void;
}) {
  const { locale, t } = useI18n();
  const x = t.experience;
  const lang: "en" | "ar" = locale === "ar" ? "ar" : "en";
  const displayName = country
    ? (lang === "ar" ? (arNameFor(country.iso3) ?? country.name) : country.name)
    : null;

  const slot =
    "rounded-xl border border-dashed border-accent/70 bg-accent/10 px-4 py-2 text-tamm-cyan transition hover:border-tamm-cyan hover:bg-accent/15";

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
      <p className="font-display text-3xl font-semibold leading-relaxed tracking-tight text-white sm:text-4xl">
        <span>{x.lead} </span>
        <motion.button
          layoutId="country-slot"
          type="button"
          onClick={onOpenPicker}
          className={slot}
        >
          {country ? `${country.flag} ${displayName}` : x.selectCountry}
        </motion.button>
        <span>{x.connector} </span>
        <span className="inline-flex flex-col items-center gap-2 align-middle sm:flex-row">
          <select
            aria-label={x.roleLabel}
            value={role.key}
            onChange={(e) =>
              onRole({ key: e.target.value as RoleSelection["key"], customName: role.customName })
            }
            className="rounded-xl border border-dashed border-accent/70 bg-accent/10 px-3 py-2 text-2xl text-tamm-cyan outline-none sm:text-3xl"
          >
            {ROLE_KEYS.map((k) => (
              <option key={k} value={k} className="bg-ink-100 text-base text-ink-800">
                {ROLE_LABELS[k][lang]}
              </option>
            ))}
          </select>
          {role.key === "custom" && (
            <input
              value={role.customName ?? ""}
              onChange={(e) => onRole({ key: "custom", customName: e.target.value })}
              placeholder={x.customRolePlaceholder}
              className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-base text-white outline-none placeholder:text-white/35"
            />
          )}
        </span>
      </p>
      <button
        type="button"
        onClick={onBegin}
        disabled={!country || busy}
        className="rounded-xl bg-gradient-to-r from-tamm-teal to-tamm-cyan px-7 py-3 text-lg font-semibold text-[#06121a] shadow-[0_0_30px_-8px_rgba(14,236,218,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {x.begin} ▸
      </button>
      <p className="text-xs text-white/35">{x.hint}</p>
    </div>
  );
}
```

- [ ] **Step 5: Run the test — must pass**

Run: `pnpm vitest run tests/unit/sentence-composer.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/experience/featured.ts src/components/experience/SentenceComposer.tsx tests/unit/sentence-composer.test.tsx
git commit -m "feat(experience): mad-lib sentence composer + featured-country helpers"
```

---

### Task 14: Country picker overlay (map filter + card grid)

**Files:**
- Create: `src/components/experience/PickerMap.tsx`
- Create: `src/components/experience/CountryPicker.tsx`
- Test: `tests/unit/country-picker.test.tsx`

- [ ] **Step 1: Create the map band** — `src/components/experience/PickerMap.tsx`

```tsx
"use client";

import { type Region, regionOf } from "@/lib/data/regions";
import { WORLD_H, WORLD_LAND_PATH, WORLD_W } from "@/lib/data/world-map";

const COORDS: [iso3: string, lat: number, lon: number][] = [
  ["ARE", 24, 54],
  ["SAU", 24, 45],
  ["USA", 38, -97],
  ["GBR", 54, -2],
  ["FRA", 46, 2],
  ["DEU", 51, 10],
  ["JPN", 36, 138],
  ["KOR", 36, 128],
  ["CHN", 35, 105],
  ["IND", 21, 78],
  ["BRA", -14, -52],
  ["ZAF", -30, 23],
  ["IDN", -2, 118],
  ["SGP", 1.35, 103.8],
];

const px = (lon: number) => ((lon + 180) / 360) * WORLD_W;
const py = (lat: number) => ((90 - lat) / 180) * WORLD_H;

/** Decorative region-filter backdrop: featured dots light up for the active region. */
export function PickerMap({ activeRegion }: { activeRegion: Region | "all" }) {
  return (
    <svg
      viewBox={`0 14 ${WORLD_W} 402`}
      className="h-24 w-full sm:h-32"
      role="img"
      aria-label="World map"
    >
      <path d={WORLD_LAND_PATH} fill="#181824" />
      {COORDS.map(([iso3, lat, lon]) => {
        const active = activeRegion === "all" || regionOf(iso3) === activeRegion;
        return (
          <circle
            key={iso3}
            cx={px(lon)}
            cy={py(lat)}
            r={active ? 6 : 3.5}
            fill={active ? "#0eecda" : "#3b3b48"}
            opacity={active ? 1 : 0.6}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Write the failing picker test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/context";
import { CountryPicker } from "@/components/experience/CountryPicker";

function setup() {
  const onClose = vi.fn();
  const onSelect = vi.fn();
  const utils = render(
    <I18nProvider>
      <CountryPicker onClose={onClose} onSelect={onSelect} />
    </I18nProvider>,
  );
  return { onClose, onSelect, ...utils };
}

describe("CountryPicker", () => {
  it("search narrows the grid and selecting returns the choice", () => {
    const { onSelect, getByPlaceholderText, getByRole, queryByRole } = setup();
    fireEvent.change(getByPlaceholderText(/search/i), { target: { value: "braz" } });
    expect(queryByRole("button", { name: /Germany/ })).toBeNull();
    fireEvent.click(getByRole("button", { name: /Brazil/ }));
    expect(onSelect).toHaveBeenCalledWith({
      iso3: "BRA",
      name: "Brazil",
      flag: expect.any(String),
    });
  });

  it("region chips filter — Europe hides Brazil, shows Germany", () => {
    const { getByRole, queryByRole } = setup();
    fireEvent.click(getByRole("button", { name: /Europe/ }));
    expect(queryByRole("button", { name: /Brazil/ })).toBeNull();
    expect(getByRole("button", { name: /Germany/ })).toBeTruthy();
  });

  it("Escape closes via the focus trap", () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run it — must fail**

Run: `pnpm vitest run tests/unit/country-picker.test.tsx`
Expected: FAIL — cannot resolve `@/components/experience/CountryPicker`.

- [ ] **Step 4: Implement the picker** — `src/components/experience/CountryPicker.tsx`

```tsx
"use client";

import { type IsoCountry, ISO_COUNTRIES, flagForIso3 } from "@/lib/data/iso-countries";
import { REGION_LABELS, REGIONS, type Region, regionOf } from "@/lib/data/regions";
import { FEATURED_ISO3, FEATURED_STATS, arNameFor } from "@/lib/experience/featured";
import type { CountryChoice } from "@/lib/experience/machine";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useI18n } from "@/lib/i18n/context";
import { motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { PickerMap } from "./PickerMap";

export function CountryPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (c: CountryChoice) => void;
}) {
  const { locale, t } = useI18n();
  const x = t.experience;
  const lang: "en" | "ar" = locale === "ar" ? "ar" : "en";
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<Region | "all">("all");

  const { featured, rest } = useMemo(() => {
    const norm = q.trim().toLowerCase();
    const all = ISO_COUNTRIES.filter(
      (c) =>
        (region === "all" || regionOf(c.iso3) === region) &&
        (!norm || c.name.toLowerCase().includes(norm) || c.iso3.toLowerCase().includes(norm)),
    );
    return {
      featured: FEATURED_ISO3.map((i) => all.find((c) => c.iso3 === i)).filter(
        (c): c is IsoCountry => Boolean(c),
      ),
      rest: all
        .filter((c) => !FEATURED_ISO3.includes(c.iso3))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [q, region]);

  function pick(c: IsoCountry) {
    onSelect({ iso3: c.iso3, name: c.name, flag: flagForIso3(c.iso3) });
  }

  const chipCls = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active
        ? "bg-accent text-white"
        : "border border-white/15 text-white/60 hover:border-tamm-cyan/50 hover:text-white"
    }`;

  function Card({ c }: { c: IsoCountry }) {
    const name = lang === "ar" ? (arNameFor(c.iso3) ?? c.name) : c.name;
    const sub = FEATURED_STATS[c.iso3] ?? REGION_LABELS[regionOf(c.iso3) ?? "apac"]?.[lang];
    return (
      <button
        type="button"
        onClick={() => pick(c)}
        className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-start transition hover:border-tamm-cyan/60 hover:bg-white/[0.08]"
      >
        <span className="text-xl" aria-hidden>
          {flagForIso3(c.iso3)}
        </span>
        <div className="mt-1 truncate text-sm font-medium text-white">{name}</div>
        <div className="truncate text-2xs text-white/40">{sub}</div>
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 overflow-y-auto bg-[#080810]/95 backdrop-blur-sm"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={x.selectCountry}
        className="mx-auto w-full max-w-5xl px-6 py-8"
      >
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={x.searchPlaceholder}
            className="flex-1 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-white outline-none placeholder:text-white/35 focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 px-4 py-3 text-sm text-white/70 hover:text-white"
          >
            {x.closePicker} ✕
          </button>
        </div>

        <div className="relative mt-4 overflow-hidden rounded-xl border border-white/10 bg-[#0c0c15]">
          <PickerMap activeRegion={region} />
          <div className="flex flex-wrap justify-center gap-2 px-4 pb-4">
            <button type="button" onClick={() => setRegion("all")} className={chipCls(region === "all")}>
              {x.all}
            </button>
            {REGIONS.map((r) => (
              <button key={r} type="button" onClick={() => setRegion(r)} className={chipCls(region === r)}>
                {REGION_LABELS[r][lang]}
              </button>
            ))}
          </div>
        </div>

        {featured.length > 0 && (
          <>
            <h2 className="mt-6 text-2xs font-semibold uppercase tracking-wide text-white/40">
              {x.featured}
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
              {featured.map((c) => (
                <Card key={c.iso3} c={c} />
              ))}
            </div>
          </>
        )}

        {rest.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
            {rest.map((c) => (
              <Card key={c.iso3} c={c} />
            ))}
          </div>
        )}

        {featured.length === 0 && rest.length === 0 && (
          <p className="mt-10 text-center text-sm text-white/40">{x.noMatches}</p>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 5: Run the test — must pass**

Run: `pnpm vitest run tests/unit/country-picker.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/experience/PickerMap.tsx src/components/experience/CountryPicker.tsx tests/unit/country-picker.test.tsx
git commit -m "feat(experience): country picker overlay — map region filter + card grid"
```

---

### Task 15: Bento grid + tiles (assembling + ready modes)

**Files:**
- Create: `src/components/experience/Bento.tsx`

The same grid renders in BOTH the theater (`mode="assembling"`, shimmer placeholders) and the command center (`mode="ready"`) — that sameness IS the "theater settles into the command center" transition. Verified by typecheck here; behavior covered by the Task 20 e2e.

- [ ] **Step 1: Implement** — `src/components/experience/Bento.tsx`

```tsx
"use client";

import type { FocusView } from "@/lib/experience/machine";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";
import { motion } from "motion/react";

function fmtUsd(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

function Shimmer({ lines = 2 }: { lines?: number }) {
  return (
    <div className="mt-2 space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={`s-${i}`}
          className="shimmer h-3 rounded bg-ink-150"
          style={{ width: `${85 - i * 18}%` }}
        />
      ))}
    </div>
  );
}

function Tile({
  id,
  label,
  span,
  onClick,
  children,
}: {
  id?: FocusView;
  label: string;
  span: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls = `${span} rounded-xl border border-ink-200 bg-ink-100/90 p-4 text-start shadow-card ${
    onClick ? "cursor-pointer transition hover:border-accent/50" : ""
  }`;
  const inner = (
    <>
      <div className="text-2xs font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      {children}
    </>
  );
  return onClick ? (
    <motion.button layout layoutId={id ? `tile-${id}` : undefined} type="button" onClick={onClick} className={cls}>
      {inner}
    </motion.button>
  ) : (
    <motion.div layout layoutId={id ? `tile-${id}` : undefined} className={cls}>
      {inner}
    </motion.div>
  );
}

export function Bento({
  state,
  mode,
  onFocus,
}: {
  state: AgentState | null;
  mode: "assembling" | "ready";
  onFocus?: (v: FocusView) => void;
}) {
  const { t } = useI18n();
  const x = t.experience.tiles;
  const assembling = mode === "assembling";
  const b = state?.briefing;
  const trade = state?.trade;
  const opp = state?.opportunities?.[0];
  const indicators = state?.indicators?.slice(0, 3) ?? [];
  const forecast = state?.forecast;
  const dev = state?.developments;
  const series = state?.gdpSeries?.slice(-5) ?? [];
  const maxV = Math.max(...series.map((p) => p.value), 1);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
      {(b || assembling) && (
        <Tile id="brief" label={x.bluf} span="md:col-span-6" onClick={b && onFocus ? () => onFocus("brief") : undefined}>
          {b ? (
            <>
              <p className="mt-1.5 line-clamp-3 text-base font-semibold leading-snug text-ink-800">
                {b.bluf}
              </p>
              {b.heroMetric && (
                <p className="mt-2 text-sm text-tamm-cyan">
                  {b.heroMetric.label}: <span className="font-display font-bold">{b.heroMetric.value}</span>{" "}
                  <span className="text-ink-500">{b.heroMetric.delta}</span>
                </p>
              )}
            </>
          ) : (
            <Shimmer lines={3} />
          )}
        </Tile>
      )}

      {(trade || assembling) && (
        <Tile label={x.trade} span="md:col-span-3">
          {trade ? (
            <>
              <p className="mt-1.5 font-mono text-2xl font-bold text-ink-900">
                {fmtUsd(trade.totalUsd)}
              </p>
              <p className="mt-1 text-2xs text-ink-500">
                ↑ {fmtUsd(trade.exportsUsd)} · ↓ {fmtUsd(trade.importsUsd)}
              </p>
              <p className="mt-1 text-2xs text-ink-400">
                {trade.source} · {trade.year}
              </p>
            </>
          ) : (
            <Shimmer />
          )}
        </Tile>
      )}

      {(opp || assembling) && (
        <Tile
          id="opportunities"
          label={x.topOpportunity}
          span="md:col-span-3"
          onClick={opp && onFocus ? () => onFocus("opportunities") : undefined}
        >
          {opp ? (
            <>
              <p className="mt-1.5 line-clamp-2 text-sm font-semibold text-ink-800">{opp.title}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-150">
                <div className="h-full rounded-full bg-accent" style={{ width: `${opp.score}%` }} />
              </div>
              <p className="mt-1 text-2xs text-ink-400">{Math.round(opp.score)}/100</p>
            </>
          ) : (
            <Shimmer />
          )}
        </Tile>
      )}

      {(indicators.length > 0 || assembling) && (
        <Tile label={x.indicators} span="md:col-span-4">
          {indicators.length > 0 ? (
            <ul className="mt-1.5 space-y-1.5">
              {indicators.map((i) => (
                <li key={i.code} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-ink-600">{i.label}</span>
                  <span className="shrink-0 font-mono text-ink-800">
                    {i.value >= 1e9 ? fmtUsd(i.value) : `${i.value}${i.unit === "%" ? "%" : ""}`}
                    <span className="ms-1.5 text-2xs text-ink-400">
                      {i.source} · {i.year}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Shimmer lines={3} />
          )}
        </Tile>
      )}

      {(forecast || assembling) && (
        <Tile label={x.forecast} span="md:col-span-4">
          {forecast ? (
            <>
              <p className="mt-1.5 text-sm text-ink-600">{forecast.label}</p>
              <div className="mt-2 flex h-10 items-end gap-1">
                {series.map((p) => (
                  <div
                    key={p.year}
                    title={`${p.year}`}
                    className="w-3 rounded-sm bg-accent/70"
                    style={{ height: `${Math.max(12, (p.value / maxV) * 100)}%` }}
                  />
                ))}
                <span className="ms-2 self-center font-mono text-lg font-bold text-tamm-cyan">
                  {forecast.next}
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-2xs text-ink-400">{forecast.read}</p>
            </>
          ) : (
            <Shimmer />
          )}
        </Tile>
      )}

      {(dev || assembling) && (
        <Tile
          id="sources"
          label={x.developments}
          span="md:col-span-4"
          onClick={dev && onFocus ? () => onFocus("sources") : undefined}
        >
          {dev ? (
            <>
              {dev.answer && <p className="mt-1.5 line-clamp-2 text-sm text-ink-600">{dev.answer}</p>}
              <p className="mt-1.5 line-clamp-1 text-sm font-medium text-accent-strong">
                {dev.results[0]?.title}
              </p>
              <p className="mt-1 text-2xs text-ink-400">
                {dev.results.length} live result{dev.results.length === 1 ? "" : "s"} · via Tavily
              </p>
            </>
          ) : (
            <Shimmer />
          )}
        </Tile>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0 (run `pnpm lint:fix` first if formatting complains).

- [ ] **Step 3: Commit**

```bash
git add src/components/experience/Bento.tsx
git commit -m "feat(experience): bento grid with assembling/ready modes + data tiles"
```

---

### Task 16: Agents theater (rail + tool feed + assembling bento)

**Files:**
- Create: `src/components/experience/Theater.tsx`

- [ ] **Step 1: Implement** — `src/components/experience/Theater.tsx`

```tsx
"use client";

import { Bento } from "@/components/experience/Bento";
import { lastDetail, looksDegraded, notesFor, statusFor } from "@/lib/experience/trace";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";
import { useEffect, useState } from "react";

const STEP_KEYS = ["scope", "research", "analyse", "opportunities", "briefing"] as const;

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function Theater({
  state,
  error,
  running,
  countryLabel,
  onRetry,
  onBack,
}: {
  state: AgentState | null;
  error: string | null;
  running: boolean;
  countryLabel: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const x = t.experience;
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const activeKey = STEP_KEYS.find((k) => statusFor(state, k) === "start");
  const activeNote = activeKey
    ? (notesFor(state, activeKey).at(-1) ?? lastDetail(state, activeKey))
    : undefined;
  const toolSteps = state?.researchSteps ?? [];

  const chipCls = (status: string) =>
    `flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-2xs font-semibold transition ${
      status === "done"
        ? "border-accent/60 text-tamm-cyan"
        : status === "start"
          ? "animate-pulse border-tamm-cyan bg-tamm-cyan/10 text-tamm-cyan"
          : status === "error"
            ? "border-signal-risk/60 text-signal-risk"
            : "border-ink-200 text-ink-400"
    }`;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          {running && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tamm-cyan opacity-75" />
          )}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
        <span className="text-sm font-semibold text-white">
          {running ? x.working : x.ready}
        </span>
        <span className="text-sm text-white/50">{countryLabel}</span>
        <span className="ms-auto font-mono text-xs text-white/50">{mmss(now - startedAt)}</span>
      </div>

      <div className="mb-2 flex flex-wrap gap-2" aria-label={x.working}>
        {STEP_KEYS.map((k) => {
          const st = statusFor(state, k);
          return (
            <span key={k} className={chipCls(st)}>
              {st === "done" ? "✓" : st === "error" ? "✕" : st === "start" ? "●" : "○"}{" "}
              {x.steps[k]}
            </span>
          );
        })}
      </div>

      <p aria-live="polite" className="mb-4 min-h-5 truncate font-mono text-2xs text-white/45">
        {activeNote ?? ""}
      </p>

      {looksDegraded(state) && (
        <p
          role="status"
          className="mb-4 rounded-md border border-signal-warn/50 bg-signal-warn/10 px-3 py-2 text-xs text-tamm-olive"
        >
          ⚠ {x.degraded}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-signal-risk/40 bg-signal-risk/5 p-4 text-sm text-signal-risk"
        >
          <p>{error}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md bg-accent-strong px-3 py-1.5 text-xs font-semibold text-white"
            >
              {x.retry}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded-md border border-ink-200 px-3 py-1.5 text-xs text-ink-600"
            >
              {x.back}
            </button>
          </div>
        </div>
      )}

      <Bento state={state} mode="assembling" />

      <details className="mt-4 rounded-md border border-white/10 bg-white/[0.03] px-4 py-2.5">
        <summary className="cursor-pointer font-mono text-2xs text-white/50">
          {x.toolFeed} ({toolSteps.length})
          {toolSteps.length > 0 && (
            <span className="ms-2 text-tamm-cyan">
              tool · {toolSteps[toolSteps.length - 1]?.tool}
            </span>
          )}
        </summary>
        <ul className="mt-2 space-y-1">
          {toolSteps.map((s, i) => (
            <li key={`${s.tool}-${i}`} className="font-mono text-2xs text-white/45">
              <span className="text-tamm-cyan">tool</span> · {s.tool}{" "}
              <span className="text-white/30">{s.input}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/experience/Theater.tsx
git commit -m "feat(experience): agents theater — rail, live note, degraded banner, tool feed"
```

---

### Task 17: Focus views + command center

**Files:**
- Create: `src/components/experience/exporters.ts`
- Create: `src/components/experience/BriefView.tsx`
- Create: `src/components/experience/OpportunitiesView.tsx`
- Create: `src/components/experience/SourcesView.tsx`
- Create: `src/components/experience/CommandCenter.tsx`

- [ ] **Step 1: Export helpers** — `src/components/experience/exporters.ts` (copied from `AgentRunner.tsx` so the legacy page stays untouched; dedupe is a Plan E item):

```ts
export function triggerDownload(url: string, name: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSvg(svg: string, name = "country-one-pager.svg"): void {
  triggerDownload(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), name);
}

export async function exportOnePager(
  payload: Record<string, unknown>,
  filename: string,
): Promise<void> {
  const res = await fetch("/api/export/onepager", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return;
  triggerDownload(URL.createObjectURL(await res.blob()), filename);
}
```

- [ ] **Step 2: Brief focus view** — `src/components/experience/BriefView.tsx`. Brief-internal labels use a local COPY const (AgentRunner precedent); the per-brief EN/AR toggle is independent of the app locale, and Arabic enables only when `briefingAr` exists:

```tsx
"use client";

import { MarkdownView } from "@/components/chat/MarkdownView";
import { downloadSvg, exportOnePager } from "@/components/experience/exporters";
import type { AgentState } from "@/services/agent/state";
import { countryOnePagerSvg } from "@/services/export/infographic";
import { useState } from "react";

const COPY = {
  en: {
    recommendation: "Recommendation",
    confidence: "Confidence",
    talkingPoints: "Talking points — the ask",
    fullAnalysis: "Full analysis",
    pptx: "Download slides (PPTX)",
    png: "Download one-pager (PNG)",
    svg: "SVG",
    preparing: "Preparing…",
    developments: "Recent developments (live web)",
  },
  ar: {
    recommendation: "التوصية",
    confidence: "الثقة",
    talkingPoints: "نقاط الحديث — المطلب",
    fullAnalysis: "التحليل الكامل",
    pptx: "تنزيل العرض (PPTX)",
    png: "تنزيل الملخص (PNG)",
    svg: "SVG",
    preparing: "جارٍ التحضير…",
    developments: "تطورات حديثة (بحث ويب حي)",
  },
};

export function BriefView({ state }: { state: AgentState }) {
  const [briefLang, setBriefLang] = useState<"en" | "ar">("en");
  const [exporting, setExporting] = useState<string | null>(null);
  const arReady = Boolean(state.briefingAr);
  const b = briefLang === "ar" ? (state.briefingAr ?? state.briefing) : state.briefing;
  const c = COPY[briefLang];
  if (!b) return null;
  const onePager = state.scope ? countryOnePagerSvg(state, { locale: briefLang }) : null;

  async function doExport(payload: Record<string, unknown>, filename: string, key: string) {
    setExporting(key);
    try {
      await exportOnePager(payload, filename);
    } finally {
      setExporting(null);
    }
  }

  const confColor =
    b.confidence === "high"
      ? "text-signal-ok border-signal-ok/40"
      : b.confidence === "low"
        ? "text-signal-risk border-signal-risk/40"
        : "text-tamm-olive border-tamm-olive/40";

  return (
    <div className="space-y-5" dir={briefLang === "ar" ? "rtl" : "ltr"}>
      <div className="flex items-center gap-2" dir="ltr">
        <button
          type="button"
          onClick={() => setBriefLang("en")}
          className={`rounded-full px-3 py-1 text-2xs font-semibold ${briefLang === "en" ? "bg-accent text-white" : "border border-ink-200 text-ink-500 hover:bg-ink-200"}`}
        >
          English
        </button>
        <button
          type="button"
          onClick={() => arReady && setBriefLang("ar")}
          disabled={!arReady}
          title={arReady ? "" : "Arabic version is still generating…"}
          className={`rounded-full px-3 py-1 text-2xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${briefLang === "ar" ? "bg-accent text-white" : "border border-ink-200 text-ink-500 hover:bg-ink-200"}`}
        >
          العربية
        </button>
      </div>

      <div className="rounded-lg border border-accent/30 border-l-4 border-l-accent bg-ink-100 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-2xs font-semibold uppercase tracking-wide text-accent-strong">
            {c.recommendation}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-2xs font-semibold ${confColor}`}>
            {c.confidence}: {b.confidence.toUpperCase()}
          </span>
        </div>
        <p className="mt-2 text-lg font-semibold leading-snug text-ink-800">{b.bluf}</p>
        {b.whyNow && <p className="mt-1 text-sm text-ink-500">{b.whyNow}</p>}
      </div>

      {onePager && (
        <>
          <div className="overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(onePager)}`}
              alt={`Executive country one-pager for ${state.scope?.iso3 ?? ""}`}
              className="h-auto w-full"
            />
          </div>
          <div className="flex flex-wrap gap-2" dir="ltr">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() =>
                doExport(
                  { svg: onePager, format: "pptx", title: b.title, talkingPoints: b.talkingPoints },
                  "country-brief.pptx",
                  "pptx",
                )
              }
              className="rounded-md bg-accent-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {exporting === "pptx" ? c.preparing : c.pptx}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => doExport({ svg: onePager, format: "png" }, "country-one-pager.png", "png")}
              className="rounded-md border border-ink-200 px-4 py-2 text-sm text-ink-700 hover:bg-ink-200 disabled:opacity-50"
            >
              {exporting === "png" ? c.preparing : c.png}
            </button>
            <button
              type="button"
              onClick={() => downloadSvg(onePager)}
              className="rounded-md border border-ink-200 px-4 py-2 text-sm text-ink-700 hover:bg-ink-200"
            >
              {c.svg}
            </button>
          </div>
        </>
      )}

      {b.talkingPoints.length > 0 && (
        <div className="rounded-lg border border-ink-200 bg-ink-100 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {c.talkingPoints}
          </h3>
          <ol className="mt-2 list-decimal space-y-1 ps-5 text-ink-700">
            {b.talkingPoints.map((tp) => (
              <li key={tp}>{tp}</li>
            ))}
          </ol>
        </div>
      )}

      {state.developments && state.developments.results.length > 0 && (
        <div className="rounded-lg border border-ink-200 bg-ink-100 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {c.developments}
          </h3>
          {state.developments.answer && (
            <p className="mt-2 text-sm text-ink-600">{state.developments.answer}</p>
          )}
          <ul className="mt-2 space-y-1 text-sm">
            {state.developments.results.slice(0, 4).map((d) => (
              <li key={d.url}>
                <a href={d.url} target="_blank" rel="noreferrer" className="text-accent-strong hover:underline">
                  {d.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.analysis && (
        <details className="rounded-lg border border-ink-200 bg-ink-100 p-4">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-tight text-ink-400">
            {c.fullAnalysis}
          </summary>
          <div className="mt-2 text-ink-700">
            <MarkdownView text={state.analysis} />
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Opportunities focus view** — `src/components/experience/OpportunitiesView.tsx`:

```tsx
"use client";

import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";

const COPY = {
  en: {
    deals: "Deal pipeline",
    risks: "Risks",
    position: "UAE position",
    offers: "Offers",
    asks: "Asks",
    redLines: "Red lines",
    horizon: { near: "Near", mid: "Mid", long: "Long" } as Record<string, string>,
  },
  ar: {
    deals: "خط الصفقات",
    risks: "المخاطر",
    position: "موقف الإمارات",
    offers: "العروض",
    asks: "المطالب",
    redLines: "الخطوط الحمراء",
    horizon: { near: "قريب", mid: "متوسط", long: "بعيد" } as Record<string, string>,
  },
};

export function OpportunitiesView({ state }: { state: AgentState }) {
  const { locale } = useI18n();
  const c = COPY[locale === "ar" ? "ar" : "en"];
  const b = state.briefing;

  return (
    <div className="space-y-5">
      {b && b.deals.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">{c.deals}</h3>
          <ul className="mt-2 space-y-2.5">
            {b.deals.map((d) => (
              <li key={d.title} className="rounded-lg border border-ink-200 bg-ink-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink-800">{d.title}</span>
                  <span className="flex items-center gap-2 text-2xs text-ink-500">
                    <span className="rounded-full border border-ink-200 px-2 py-0.5">
                      {c.horizon[d.horizon] ?? d.horizon}
                    </span>
                    <span className="rounded-full border border-ink-200 px-2 py-0.5">{d.confidence}</span>
                    <span className="font-mono text-tamm-cyan">{Math.round(d.score)}/100</span>
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink-600">{d.rationale}</p>
                {d.evidence && <p className="mt-1 font-mono text-2xs text-ink-400">{d.evidence}</p>}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-150">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${d.score}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {b && (
        <section className="grid gap-3 sm:grid-cols-3">
          {(
            [
              [c.offers, b.position.offers],
              [c.asks, b.position.asks],
              [c.redLines, b.position.redLines],
            ] as const
          ).map(([label, items]) => (
            <div key={label} className="rounded-lg border border-ink-200 bg-ink-50 p-4">
              <h4 className="text-2xs font-semibold uppercase tracking-wide text-ink-400">{label}</h4>
              <ul className="mt-1.5 list-disc space-y-1 ps-4 text-sm text-ink-700">
                {items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {b && b.risks.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">{c.risks}</h3>
          <ul className="mt-2 space-y-1.5">
            {b.risks.map((r) => (
              <li key={r.text} className="flex items-center justify-between gap-3 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm">
                <span className="text-ink-700">{r.text}</span>
                <span className="shrink-0 font-mono text-2xs text-ink-400">
                  {r.likelihood} · impact {r.impact}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Sources focus view** — `src/components/experience/SourcesView.tsx`:

```tsx
"use client";

import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";

const COPY = {
  en: { citations: "Citations", web: "Live web sources", data: "Datapoints", classification: "Classification" },
  ar: { citations: "الاستشهادات", web: "مصادر الويب الحية", data: "نقاط البيانات", classification: "التصنيف" },
};

export function SourcesView({ state }: { state: AgentState }) {
  const { locale } = useI18n();
  const c = COPY[locale === "ar" ? "ar" : "en"];
  const citations = state.briefing?.citations ?? [];

  return (
    <div className="space-y-5">
      <p className="inline-flex items-center gap-2 rounded-full border border-tamm-olive/40 bg-tamm-olive/10 px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-tamm-olive">
        {c.classification}: {state.classification}
      </p>

      {citations.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">{c.citations}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {citations.map((ci) => (
              <li key={ci} className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs text-ink-600">
                {ci}
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.developments && state.developments.results.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">{c.web}</h3>
          <ul className="mt-2 space-y-1">
            {state.developments.results.map((d) => (
              <li key={d.url} className="truncate text-sm">
                <a href={d.url} target="_blank" rel="noreferrer" className="text-accent-strong hover:underline">
                  {d.title}
                </a>
                <span className="ms-2 text-2xs text-ink-400">
                  {d.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.indicators.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">{c.data}</h3>
          <ul className="mt-2 space-y-1">
            {state.indicators.map((i) => (
              <li key={i.code} className="flex items-baseline justify-between gap-3 border-b border-ink-150 py-1.5 text-sm last:border-0">
                <span className="text-ink-600">{i.label}</span>
                <span className="shrink-0 font-mono text-2xs text-ink-400">
                  {i.source} · {i.year}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Command center** — `src/components/experience/CommandCenter.tsx`:

```tsx
"use client";

import { Bento } from "@/components/experience/Bento";
import { BriefView } from "@/components/experience/BriefView";
import { OpportunitiesView } from "@/components/experience/OpportunitiesView";
import { SourcesView } from "@/components/experience/SourcesView";
import { FOCUS_VIEWS, type CountryChoice, type FocusView } from "@/lib/experience/machine";
import { useTablistKeys } from "@/lib/hooks/useTablistKeys";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";
import { AnimatePresence, motion } from "motion/react";

export function CommandCenter({
  state,
  focus,
  country,
  onFocus,
  onNew,
}: {
  state: AgentState;
  focus: FocusView;
  country: CountryChoice | null;
  onFocus: (v: FocusView) => void;
  onNew: () => void;
}) {
  const { t } = useI18n();
  const x = t.experience;
  const onTabKeys = useTablistKeys(FOCUS_VIEWS, focus, onFocus);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {country && (
          <span className="text-xl" aria-hidden>
            {country.flag}
          </span>
        )}
        <h1 className="truncate font-display text-xl font-semibold tracking-tight text-white">
          {state.briefing?.title ?? country?.name ?? ""}
        </h1>
        <span className="rounded-full border border-signal-ok/40 bg-signal-ok/10 px-2.5 py-0.5 text-2xs font-semibold text-signal-ok">
          ✓ {x.ready}
        </span>
        <button
          type="button"
          onClick={onNew}
          className="ms-auto rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:border-tamm-cyan/50 hover:text-white"
        >
          + {x.newBriefing}
        </button>
      </div>

      <div
        role="tablist"
        aria-label={x.focusLabel}
        onKeyDown={onTabKeys}
        className="mb-4 flex flex-wrap gap-2"
      >
        {FOCUS_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            data-tab={v}
            id={`tab-${v}`}
            aria-selected={focus === v}
            aria-controls={`panel-${v}`}
            tabIndex={focus === v ? 0 : -1}
            onClick={() => onFocus(v)}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              focus === v
                ? "bg-accent text-white"
                : "border border-white/15 text-white/60 hover:border-tamm-cyan/50 hover:text-white"
            }`}
          >
            {x.focus[v]}
          </button>
        ))}
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {focus === "overview" ? (
          <motion.div
            key="overview"
            role="tabpanel"
            id="panel-overview"
            aria-labelledby="tab-overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Bento state={state} mode="ready" onFocus={onFocus} />
          </motion.div>
        ) : (
          <motion.section
            key={focus}
            role="tabpanel"
            id={`panel-${focus}`}
            aria-labelledby={`tab-${focus}`}
            layoutId={`tile-${focus}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-ink-200 bg-ink-100 p-5 shadow-card"
          >
            {focus === "brief" && <BriefView state={state} />}
            {focus === "opportunities" && <OpportunitiesView state={state} />}
            {focus === "sources" && <SourcesView state={state} />}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/experience/exporters.ts src/components/experience/BriefView.tsx src/components/experience/OpportunitiesView.tsx src/components/experience/SourcesView.tsx src/components/experience/CommandCenter.tsx
git commit -m "feat(experience): focus views (brief/opportunities/sources) + command center tablist"
```

---

### Task 18: Landing + Experience assembly (machine ⇄ stream ⇄ hash)

**Files:**
- Create: `src/components/experience/Landing.tsx`
- Create: `src/components/experience/Experience.tsx`

- [ ] **Step 1: Landing view** — `src/components/experience/Landing.tsx`:

```tsx
"use client";

import { SentenceComposer } from "@/components/experience/SentenceComposer";
import { flagForIso3, iso3Name } from "@/lib/data/iso-countries";
import type { CountryChoice } from "@/lib/experience/machine";
import type { RoleSelection } from "@/lib/experience/roles";
import { useI18n } from "@/lib/i18n/context";

export interface RunChip {
  id: string;
  title: string;
  iso3: string;
}

export function Landing({
  country,
  role,
  busy,
  recent,
  onOpenPicker,
  onRole,
  onBegin,
  onOpenRun,
}: {
  country: CountryChoice | null;
  role: RoleSelection;
  busy: boolean;
  recent: RunChip[];
  onOpenPicker: () => void;
  onRole: (r: RoleSelection) => void;
  onBegin: () => void;
  onOpenRun: (id: string) => void;
}) {
  const { t } = useI18n();
  const x = t.experience;

  return (
    <section className="mx-auto flex min-h-[70dvh] w-full max-w-4xl flex-col items-center justify-center gap-10 px-6 pb-20">
      <div className="inline-flex items-center gap-2 rounded-full border border-tamm-cyan/30 bg-tamm-cyan/10 px-3.5 py-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-tamm-cyan">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tamm-cyan" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-tamm-cyan" />
        </span>
        {t.appName}
      </div>

      <SentenceComposer
        country={country}
        role={role}
        busy={busy}
        onOpenPicker={onOpenPicker}
        onRole={onRole}
        onBegin={onBegin}
      />

      {recent.length > 0 && (
        <div className="flex flex-col items-center gap-2.5">
          <h2 className="text-2xs font-semibold uppercase tracking-wide text-white/35">
            {x.recent}
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenRun(r.id)}
                className="max-w-72 truncate rounded-full border border-white/12 bg-white/[0.04] px-4 py-1.5 text-sm text-white/70 transition hover:border-tamm-cyan/50 hover:text-white"
              >
                {flagForIso3(r.iso3)} {iso3Name(r.iso3) ?? r.iso3} — {r.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: The assembly root** — `src/components/experience/Experience.tsx`:

```tsx
"use client";

import { CommandCenter } from "@/components/experience/CommandCenter";
import { CountryPicker } from "@/components/experience/CountryPicker";
import { ExperienceBackdrop } from "@/components/experience/ExperienceBackdrop";
import { ExperienceHeader } from "@/components/experience/ExperienceHeader";
import { Landing, type RunChip } from "@/components/experience/Landing";
import { Theater } from "@/components/experience/Theater";
import { flagForIso3, iso3Name } from "@/lib/data/iso-countries";
import {
  hashFor,
  initialState,
  parseHash,
  reduce,
} from "@/lib/experience/machine";
import { ROLE_LABELS, commandFor, roleSelectionFrom } from "@/lib/experience/roles";
import { useAgentRun } from "@/lib/hooks/useAgentRun";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useReducer, useState } from "react";

interface RunRecordDto {
  id: string;
  title: string;
  iso3: string;
  role?: string;
  state: AgentState;
}

export function Experience() {
  const { locale } = useI18n();
  const lang: "en" | "ar" = locale === "ar" ? "ar" : "en";
  const [s, dispatch] = useReducer(reduce, initialState);
  const run = useAgentRun();
  const [recordState, setRecordState] = useState<AgentState | null>(null);
  const [recent, setRecent] = useState<RunChip[]>([]);
  const reduceMotion = useReducedMotion();
  const data = run.state ?? recordState;

  useEffect(() => {
    if (run.runId) dispatch({ type: "RUN_SAVED", runId: run.runId });
  }, [run.runId]);

  useEffect(() => {
    if (run.final && s.view.kind === "running") dispatch({ type: "RUN_DONE" });
  }, [run.final, s.view.kind]);

  useEffect(() => {
    const h = hashFor(s);
    if (h && window.location.hash !== h) window.history.replaceState(null, "", h);
    else if (!h && window.location.hash)
      window.history.replaceState(null, "", window.location.pathname);
  }, [s]);

  const hydrate = useCallback(async (hash: string) => {
    const parsed = parseHash(hash);
    if (!parsed) return;
    try {
      const res = await fetch(`/api/agent/runs/${parsed.runId}`);
      if (!res.ok) return;
      const { run: rec } = (await res.json()) as { run: RunRecordDto };
      setRecordState(rec.state);
      dispatch({
        type: "HYDRATE_READY",
        runId: rec.id,
        focus: parsed.focus,
        country: {
          iso3: rec.iso3,
          name: iso3Name(rec.iso3) ?? rec.iso3,
          flag: flagForIso3(rec.iso3),
        },
        role: roleSelectionFrom(rec.role),
      });
    } catch {
      /* stay on landing */
    }
  }, []);

  useEffect(() => {
    if (window.location.hash) void hydrate(window.location.hash);
  }, [hydrate]);

  useEffect(() => {
    function onPop() {
      if (window.location.hash) void hydrate(window.location.hash);
      else {
        run.reset();
        setRecordState(null);
        dispatch({ type: "RESET" });
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [hydrate, run]);

  useEffect(() => {
    if (s.view.kind !== "landing") return;
    fetch("/api/agent/runs")
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((j: { runs: RunChip[] }) => setRecent(j.runs ?? []))
      .catch(() => setRecent([]));
  }, [s.view.kind]);

  const begin = useCallback(() => {
    if (!s.country) return;
    dispatch({ type: "BEGIN" });
    void run.start(commandFor(s.country.name, s.role), s.role.key);
  }, [s.country, s.role, run]);

  const onNew = useCallback(() => {
    window.history.pushState(null, "", window.location.pathname);
    run.reset();
    setRecordState(null);
    dispatch({ type: "RESET" });
  }, [run]);

  const onOpenRun = useCallback(
    (id: string) => {
      window.history.pushState(null, "", `#run=${id}`);
      void hydrate(`#run=${id}`);
    },
    [hydrate],
  );

  const fade = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
      };

  const countryLabel = s.country
    ? `${s.country.flag} ${s.country.name} — ${ROLE_LABELS[s.role.key][lang]}`
    : "";

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#080810] text-white">
      <ExperienceBackdrop />
      <ExperienceHeader />

      <AnimatePresence mode="wait" initial={false}>
        {s.view.kind === "landing" && (
          <motion.div key="landing" {...fade}>
            <Landing
              country={s.country}
              role={s.role}
              busy={run.running}
              recent={recent}
              onOpenPicker={() => dispatch({ type: "OPEN_PICKER" })}
              onRole={(role) => dispatch({ type: "SET_ROLE", role })}
              onBegin={begin}
              onOpenRun={onOpenRun}
            />
          </motion.div>
        )}

        {s.view.kind === "running" && (
          <motion.div key="running" {...fade}>
            <Theater
              state={run.state}
              error={run.error}
              running={run.running}
              countryLabel={countryLabel}
              onRetry={begin}
              onBack={onNew}
            />
          </motion.div>
        )}

        {s.view.kind === "ready" && data && (
          <motion.div key="ready" {...fade}>
            <CommandCenter
              state={data}
              focus={s.view.focus}
              country={s.country}
              onFocus={(focus) => dispatch({ type: "SET_FOCUS", focus })}
              onNew={onNew}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {s.pickerOpen && (
          <CountryPicker
            onClose={() => dispatch({ type: "CLOSE_PICKER" })}
            onSelect={(country) => dispatch({ type: "SELECT_COUNTRY", country })}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run tests/unit`
Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/experience/Landing.tsx src/components/experience/Experience.tsx
git commit -m "feat(experience): assembly root — machine, SSE stream, hash sync, rehydrate"
```

---

### Task 19: Make `/` the experience (auth-gated)

**Files:**
- Modify: `src/app/page.tsx` (replace entirely)
- Modify: `src/middleware.ts` (one line)
- Modify: `src/app/login/page.tsx` (two defaults)

- [ ] **Step 1: Replace the marketing page** — new full content of `src/app/page.tsx`:

```tsx
import { Experience } from "@/components/experience/Experience";

export default function Home() {
  return <Experience />;
}
```

- [ ] **Step 2: Gate `/` behind login** — in `src/middleware.ts`, delete the line:

```ts
  "/", // public landing page (exact match only — see isPublic)
```

from `PUBLIC_PATHS` (the array then starts with `"/login"`).

- [ ] **Step 3: Land on `/` after login** — in `src/app/login/page.tsx`, replace BOTH occurrences of the default `"/dashboard"`:

```ts
const rawNext = typeof sp.next === "string" ? sp.next : "/";
```
```ts
const next = typeof sp.next === "string" ? sp.next : "/";
```

(the admin-redirect default in `src/middleware.ts` that points non-admins to `/dashboard` stays as is).

- [ ] **Step 4: Manual verification**

Run: `pnpm dev`, then:
1. `curl -sI http://localhost:3000/ | head -3` → `307` redirect with `location: /login?next=%2F`.
2. In a browser: log in as `exec@example.ae` / `demo` → lands on `/` showing "Prepare me for a meeting with [Select country]…".
3. Open the picker, search "Brazil", select it, choose a role, Begin → theater appears (with Ollama running, tiles fill; without it, the degraded banner appears — both are correct behavior).
4. `/dashboard` and `/agent` still render (legacy untouched).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/middleware.ts src/app/login/page.tsx
git commit -m "feat(experience): / becomes the auth-gated single-page experience"
```

---

### Task 20: E2E golden path (mocked agent stream)

**Files:**
- Create: `tests/e2e/experience.spec.ts`

Playwright runs against a dev server — start `pnpm dev` in another terminal first (the repo's config only auto-starts a server in CI). The agent API is route-mocked, so Ollama is NOT required.

- [ ] **Step 1: Write the spec**

```ts
import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_STATE, sseBody } from "../fixtures/agent-state";

const RUN_ID = "run-e2e-1";

const RUN_RECORD = {
  id: RUN_ID,
  title: FIXTURE_STATE.briefing?.title ?? "",
  iso3: "BRA",
  role: "energy",
  createdAt: "2026-06-10T10:00:00.000Z",
  createdBy: "exec@example.ae",
  classification: "internal",
  command: FIXTURE_STATE.command,
  durationMs: 9800,
  state: FIXTURE_STATE,
};

async function mockRunApis(page: Page) {
  await page.route("**/api/agent/runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ runs: [] }),
    }),
  );
  await page.route(`**/api/agent/runs/${RUN_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run: RUN_RECORD }),
    }),
  );
  await page.route("**/api/agent/run", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        ": connected\n\n" +
        sseBody([
          {
            event: "trace",
            state: {
              ...FIXTURE_STATE,
              briefing: undefined,
              trace: FIXTURE_STATE.trace.slice(0, 2),
            },
          },
          { event: "final", state: FIXTURE_STATE },
          { event: "saved", runId: RUN_ID },
        ]),
    }),
  );
}

async function login(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/login/);
  await page.getByLabel("Email").fill("exec@example.ae");
  await page.getByLabel("Password").fill("demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

test.describe("single-page experience", () => {
  test("golden path: pick country → run → bento → focus views", async ({ page }) => {
    await mockRunApis(page);
    await login(page);

    await page.getByRole("button", { name: /select country/i }).click();
    await page.getByPlaceholder(/search/i).fill("braz");
    await page.getByRole("button", { name: /Brazil/ }).click();

    const begin = page.getByRole("button", { name: /begin briefing/i });
    await expect(begin).toBeEnabled();
    await begin.click();

    await expect(page.getByText(/biofuels & SAF co-investment/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(new RegExp(`#run=${RUN_ID}`));

    await page.getByRole("tab", { name: /^Brief$/ }).click();
    await expect(page.getByRole("img", { name: /one-pager/i })).toBeVisible();

    await page.getByRole("tab", { name: /Opportunities/ }).click();
    await expect(page.getByText("SAF joint venture")).toBeVisible();

    await page.getByRole("tab", { name: /Sources/ }).click();
    await expect(page.getByText("World Bank WDI 2024").first()).toBeVisible();
  });

  test("#run=<id> rehydrates a saved run after reload", async ({ page }) => {
    await mockRunApis(page);
    await login(page);
    await page.goto(`/#run=${RUN_ID}`);
    await expect(page.getByText(/biofuels & SAF co-investment/i).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: /Overview/ })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run it**

Run (dev server up in another terminal): `pnpm test:e2e --project=chromium -g "single-page experience"`
Expected: 2 passed. If the theater never advances, check the browser console for a JSON parse error in `useAgentRun` (a malformed mocked frame is the usual cause).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/experience.spec.ts
git commit -m "test(e2e): experience golden path + hash rehydration (mocked agent stream)"
```

---

### Task 21: Full verification sweep

**Files:** none (verification only — fix anything that fails, then re-run).

- [ ] **Step 1: Format + lint**

Run: `pnpm lint:fix && pnpm lint`
Expected: exit 0.

- [ ] **Step 2: Types**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Unit + integration suites (entire repo — catches regressions in untouched suites)**

Run: `pnpm vitest run`
Expected: all suites pass.

- [ ] **Step 4: E2E (chromium)**

Run (dev server up): `pnpm test:e2e --project=chromium`
Expected: existing specs (auth-flow, dashboard, country-profile) AND the new experience spec pass. The auth-flow spec's "unauthed root redirects" test goes to `/dashboard`, not `/`, so the middleware change does not break it — but verify.

- [ ] **Step 5: Legacy smoke (manual)**

With `pnpm dev` running and logged in: `/agent` runs a brief, `/dashboard`, `/briefings`, `/compare` render. The `/agent?q=…` deep-link auto-run still works (it is used by nothing now but must not crash).

- [ ] **Step 6: Wrap-up commit (if any fixes were made)**

```bash
git add -A
git commit -m "fix(experience): verification sweep fixes"
```

---

## Execution handoff

Execute with **superpowers:subagent-driven-development** (fresh subagent per task, review between tasks) or **superpowers:executing-plans** (inline batches). Tasks 2–9 are independent of each other except: roles (T2) before machine (T3); fixture (T7) before hook/repo tests (T8, T9). Tasks 12–18 build bottom-up and assume 2–11 are done. T19 (page swap) goes last before E2E.

**After Plan A ships:** write Plan B (counterpart agent) → C (focus content + viz pack) → D (chat responder) → E (polish) from the spec, absorbing anything learned here.
