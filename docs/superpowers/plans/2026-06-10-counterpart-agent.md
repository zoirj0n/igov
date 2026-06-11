# Counterpart Agent Implementation Plan (Plan B of the single-page redesign)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The agent researches the PERSON the meeting is with — identify the current officeholder (Tavily), enrich from Wikipedia (bio + photo), synthesize a cited dossier (local qwen) — surfaced as a theater step, a bento tile, and a Counterpart focus view, with a never-fabricate "unconfirmed" fallback and curated seeds for the offline demo.

**Architecture:** A new `counterpartNode` (`async (state) => Partial<AgentState>`, data-only — the runner owns the trace) kicks off right after scope in `runAgent` and is awaited after the research phase, so it adds no critical-path latency. New live client `wikipedia.ts` follows the tavily pattern (`withCache` + `withTimeout` + `isAirgapped`). The role/custom-name chosen on the landing flows: Experience → `useAgentRun.start` → POST body → `RunOptions` → `AgentState.counterpartRole/counterpartName`. Photos are proxied + disk-cached via a host-validated route (offline after first fetch). UI extends `FOCUS_VIEWS` with "counterpart".

**Tech Stack:** same as Plan A. LLM steps use `completeText` with `modelForRole("analyst")` (heavy, qwen2.5:7b) — sovereignty gates untouched; Tavily/Wikipedia are data APIs.

**Spec:** `docs/superpowers/specs/2026-06-10-single-page-experience-design.md` §4.

---

## Context primer (read first)

- Commands: `pnpm vitest run <file>` (single pass), `pnpm typecheck`, format ONLY your files via `pnpm biome check --write <paths>` (NEVER `pnpm lint:fix` — repo-wide lint has a pre-existing failing baseline unrelated to this work).
- **Node conventions** (`src/services/agent/nodes.ts`): nodes are `async (s: AgentState) => Partial<AgentState>`; LLM via `completeText({system, messages, model: modelForRole(role), step, maxTokens, json?, actor: "agent", classification: s.classification})`; JSON parsed leniently with `extractJson` (module-private today — Task 5 exports it); Zod-validate with safeParse.
- **Runner owns the trace** (`src/services/agent/graph.ts`): nodes return data only; `runAgent` yields `mark(step, status, detail?)` and `note(step, msg)` events. The supervisor is a hand-rolled generator: scope → research → (analyse ‖ forecast) → opportunities → briefing.
- **Live client pattern** (`src/services/live/tavily.ts` + `runtime.ts`): `withCache(key, ttl, fetcher, fallback)`; `isAirgapped()` is ALWAYS true under Vitest, so unit tests can only exercise pure parsers and the fallback path — design modules with exported pure parsers.
- **Tavily**: `webResearch(query, {news?, maxResults?}) → {query, answer?, results: [{title,url,content,score}], source, live}` — returns empty results when no key/air-gapped (never throws).
- **Plan A shipped** (don't rebuild): `FOCUS_VIEWS`/machine, Bento with `Tile` wrapper + layoutIds, Theater `STEP_KEYS`, CommandCenter tablist that renders panels per focus view, run records (`saveRun` already persists whatever lands in `AgentState`), `useAgentRun(start(command, role))`, fixture `tests/fixtures/agent-state.ts`, e2e `tests/e2e/experience.spec.ts`.
- jsdom test env: automatic JSX runtime; `afterEach(cleanup)` needed for component tests; wrap i18n consumers in `<I18nProvider>`; explicit vitest imports.
- E2E needs `pnpm dev` running (start background, kill after); agent API gets route-mocked, Ollama NOT needed.

### Scope notes / accepted deviations from spec §4
- **Photos are runtime-cached, not vendored**: the proxy route caches to `data/cache/counterparts/` on first fetch (offline afterwards). For a fully air-gapped demo, pre-warm with one curl per seed (documented in Task 7). Seeds therefore ship without local image files; missing photo → initials avatar.
- **Arabic dossier**: seeds carry `nameAr`/`roleAr`; live dossiers stay English in Plan B (the AR brief still references the name). Full dossier translation rides the existing AR pass in Plan E if wanted.
- **Wikidata claims**: skipped — Wikipedia summary + Tavily statements cover the dossier; Wikidata adds a third API for marginal fields.
- Seeds cover only officeholders stable enough to assert (ARE, SAU, BRA, IDN energy portfolio); all other country/role pairs take the live path or render **unconfirmed** — that is the never-fabricate rule working as designed, not a gap.

---

### Task 1: CounterpartProfile type + state plumbing + fixture

**Files:**
- Modify: `src/services/agent/state.ts`
- Modify: `tests/fixtures/agent-state.ts`

- [ ] **Step 1: Add the type + fields to `state.ts`.** After the `HeroMetric` interface, add:

```ts
/** Who the meeting is with — researched by the counterpart agent. */
export interface CounterpartProfile {
  name: string;
  nameAr?: string;
  role: string;
  roleAr?: string;
  /** Proxied photo path (or upstream URL) — absent ⇒ initials avatar. */
  photoUrl?: string;
  photoAttribution?: string;
  summary: string;
  career: { period: string; position: string; org: string }[];
  likelyToRaise: string[];
  statements: { text: string; url: string }[];
  citations: string[];
  /** ISO date the identification was made — officeholders change. */
  identifiedAsOf: string;
  confidence: "high" | "medium" | "unconfirmed";
}
```

In `AgentState`, after the `researchSteps?` field, add:

```ts
  /** Inputs from the landing composer (role key or custom counterpart name). */
  counterpartRole?: string;
  counterpartName?: string;
  /** The person dossier researched by the counterpart agent. */
  counterpart?: CounterpartProfile;
```

(`emptyState` needs no change — all three are optional.)

- [ ] **Step 2: Extend the fixture.** In `tests/fixtures/agent-state.ts`, inside `FIXTURE_STATE` after `researchSteps`, add:

```ts
  counterpartRole: "energy",
  counterpart: {
    name: "Alexandre Silveira",
    nameAr: "ألكسندري سيلفيرا",
    role: "Minister of Mines and Energy",
    roleAr: "وزير المناجم والطاقة",
    summary:
      "Brazilian senator turned Minister of Mines and Energy; drives the SAF mandate and grid-renewables agenda.",
    career: [
      { period: "2023–", position: "Minister of Mines and Energy", org: "Government of Brazil" },
      { period: "2022", position: "Senator (Minas Gerais)", org: "Federal Senate" },
    ],
    likelyToRaise: ["Biofuels & SAF partnerships", "Green hydrogen investment"],
    statements: [{ text: "Brazil SAF mandate grows", url: "https://example.org/saf" }],
    citations: ["https://en.wikipedia.org/wiki/Alexandre_Silveira"],
    identifiedAsOf: "2026-06-01",
    confidence: "high",
  },
```

Also append a trace entry after the `research` one:

```ts
    { step: "counterpart", status: "done", detail: "Alexandre Silveira", atMs: 2600 },
```

- [ ] **Step 3: Verify** — `pnpm typecheck` → 0; `pnpm vitest run tests/unit` → all pass (the trace-helpers and repo tests consume the fixture; they must stay green).

- [ ] **Step 4: Commit**

```bash
git add src/services/agent/state.ts tests/fixtures/agent-state.ts
git commit -m "feat(agent): CounterpartProfile type + state fields + fixture dossier"
```

---

### Task 2: Role → search-query mapping

**Files:**
- Modify: `src/lib/experience/roles.ts`
- Modify: `tests/unit/experience-roles.test.ts`

- [ ] **Step 1: Add failing tests** (append a new describe block to the existing test file):

```ts
import { searchQueryFor } from "@/lib/experience/roles";

describe("searchQueryFor", () => {
  it("maps preset roles to officeholder queries", () => {
    expect(searchQueryFor("Brazil", { key: "energy" })).toBe(
      "current Brazil minister of energy 2026",
    );
    expect(searchQueryFor("Japan", { key: "foreign" })).toBe(
      "current Japan minister of foreign affairs 2026",
    );
    expect(searchQueryFor("Brazil", { key: "headOfState" })).toBe(
      "current Brazil head of state president 2026",
    );
    expect(searchQueryFor("India", { key: "infrastructure" })).toBe(
      "current India minister of infrastructure 2026",
    );
    expect(searchQueryFor("India", { key: "trade" })).toBe(
      "current India minister of trade commerce 2026",
    );
  });
  it("uses the custom name directly", () => {
    expect(searchQueryFor("Brazil", { key: "custom", customName: "Alexandre Silveira" })).toBe(
      "Alexandre Silveira Brazil",
    );
  });
});
```

(Merge the import into the existing `@/lib/experience/roles` import line; run → the new tests FAIL.)

- [ ] **Step 2: Implement.** Append to `src/lib/experience/roles.ts`:

```ts
/** Web-search query used by the counterpart agent to find the current officeholder. */
export function searchQueryFor(countryName: string, role: RoleSelection): string {
  switch (role.key) {
    case "energy":
      return `current ${countryName} minister of energy 2026`;
    case "infrastructure":
      return `current ${countryName} minister of infrastructure 2026`;
    case "foreign":
      return `current ${countryName} minister of foreign affairs 2026`;
    case "headOfState":
      return `current ${countryName} head of state president 2026`;
    case "trade":
      return `current ${countryName} minister of trade commerce 2026`;
    case "custom":
      return `${role.customName?.trim() || "the counterpart"} ${countryName}`;
  }
}
```

- [ ] **Step 3: Verify** — `pnpm vitest run tests/unit/experience-roles.test.ts` → all pass (7 tests now). Format the two files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/experience/roles.ts tests/unit/experience-roles.test.ts
git commit -m "feat(experience): officeholder search queries per role"
```

---

### Task 3: Wikipedia live client

**Files:**
- Create: `src/services/live/wikipedia.ts`
- Test: `tests/unit/wikipedia.test.ts`

Under Vitest everything is air-gapped, so the tests cover the EXPORTED PURE PARSERS plus the air-gap fallback of the fetch wrapper. The live fetch bodies follow the tavily pattern exactly and are exercised at runtime.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from "vitest";
import {
  parseWikiSearch,
  parseWikiSummary,
  wikiPersonSummary,
} from "@/services/live/wikipedia";

describe("wikipedia parsers", () => {
  it("parseWikiSearch picks the top title", () => {
    const j = { query: { search: [{ title: "Alexandre Silveira" }, { title: "Other" }] } };
    expect(parseWikiSearch(j)).toBe("Alexandre Silveira");
    expect(parseWikiSearch({})).toBeNull();
    expect(parseWikiSearch({ query: { search: [] } })).toBeNull();
  });

  it("parseWikiSummary maps extract, thumbnail and page url", () => {
    const j = {
      title: "Alexandre Silveira",
      extract: "Brazilian politician.",
      thumbnail: { source: "https://upload.wikimedia.org/x.jpg" },
      content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Alexandre_Silveira" } },
    };
    expect(parseWikiSummary(j)).toEqual({
      title: "Alexandre Silveira",
      extract: "Brazilian politician.",
      thumbnailUrl: "https://upload.wikimedia.org/x.jpg",
      pageUrl: "https://en.wikipedia.org/wiki/Alexandre_Silveira",
      live: true,
    });
    expect(parseWikiSummary({ title: "X" })?.extract).toBe("");
    expect(parseWikiSummary(null)).toBeNull();
  });

  it("wikiPersonSummary returns null when air-gapped (always true under vitest)", async () => {
    expect(await wikiPersonSummary("Alexandre Silveira")).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement:**

```ts
/**
 * Wikipedia — public bio + photo for the counterpart agent. MediaWiki search
 * resolves the page title; the REST summary endpoint returns extract +
 * thumbnail. Public data API (no key); sovereignty gates don't apply, but the
 * air-gap toggle does: offline ⇒ null, callers fall back to seeds/initials.
 */
import { isAirgapped, withCache, withTimeout } from "@/services/live/runtime";

export interface WikiPerson {
  title: string;
  extract: string;
  thumbnailUrl?: string;
  pageUrl: string;
  live: boolean;
}

export function parseWikiSearch(j: unknown): string | null {
  const title = (j as { query?: { search?: { title?: string }[] } })?.query?.search?.[0]?.title;
  return typeof title === "string" && title.length > 0 ? title : null;
}

export function parseWikiSummary(j: unknown): WikiPerson | null {
  const o = j as {
    title?: string;
    extract?: string;
    thumbnail?: { source?: string };
    content_urls?: { desktop?: { page?: string } };
  } | null;
  if (!o?.title) return null;
  return {
    title: o.title,
    extract: o.extract ?? "",
    thumbnailUrl: o.thumbnail?.source,
    pageUrl: o.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(o.title)}`,
    live: true,
  };
}

const UA = { "user-agent": "country-intel-platform/1.0 (gov demo)" };

export async function wikiPersonSummary(name: string): Promise<WikiPerson | null> {
  if (isAirgapped()) return null;
  return withCache<WikiPerson | null>(
    `wiki:person:${name.toLowerCase()}`,
    24 * 60 * 60 * 1000,
    async () => {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(name)}`;
      const sRes = await withTimeout(fetch(searchUrl, { headers: UA }), 10_000, "wikipedia-search");
      if (!sRes.ok) throw new Error(`wikipedia search ${sRes.status}`);
      const title = parseWikiSearch(await sRes.json());
      if (!title) return null;
      const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const res = await withTimeout(fetch(sumUrl, { headers: UA }), 10_000, "wikipedia-summary");
      if (!res.ok) throw new Error(`wikipedia summary ${res.status}`);
      return parseWikiSummary(await res.json());
    },
    () => null,
  );
}
```

- [ ] **Step 4: Run → PASS (3 tests). `pnpm typecheck` → 0. Format both files. Step 5: Commit:**

```bash
git add src/services/live/wikipedia.ts tests/unit/wikipedia.test.ts
git commit -m "feat(live): wikipedia person summary client (search + REST summary)"
```

---

### Task 4: Counterpart seeds + loader

**Files:**
- Create: `data/seed/counterparts.json`
- Create: `src/lib/data/counterparts.ts`
- Test: `tests/unit/counterpart-seeds.test.ts`

- [ ] **Step 1: Create `data/seed/counterparts.json`** — keys are `"<ISO3>:<roleKey>"`. Only officeholders stable enough to assert; every entry carries `identifiedAsOf` + Wikipedia citation. (These are demo seeds: the LIVE path overrides them whenever online.)

```json
{
  "ARE:energy": {
    "name": "Suhail Al Mazrouei",
    "nameAr": "سهيل المزروعي",
    "role": "Minister of Energy and Infrastructure",
    "roleAr": "وزير الطاقة والبنية التحتية",
    "summary": "UAE Minister of Energy and Infrastructure since 2013 (energy portfolio); leads OPEC+ coordination and the national hydrogen and grid-investment agenda.",
    "career": [
      { "period": "2013–", "position": "Minister of Energy (later Energy & Infrastructure)", "org": "UAE Government" }
    ],
    "likelyToRaise": ["OPEC+ alignment", "Hydrogen partnerships", "Grid interconnection"],
    "statements": [],
    "citations": ["https://en.wikipedia.org/wiki/Suhail_Al_Mazrouei"],
    "identifiedAsOf": "2026-01-01",
    "confidence": "medium"
  },
  "SAU:energy": {
    "name": "Abdulaziz bin Salman Al Saud",
    "nameAr": "عبد العزيز بن سلمان آل سعود",
    "role": "Minister of Energy",
    "roleAr": "وزير الطاقة",
    "summary": "Saudi Arabia's Minister of Energy since 2019; chairs OPEC+ strategy and the Kingdom's renewables and hydrogen build-out under Vision 2030.",
    "career": [
      { "period": "2019–", "position": "Minister of Energy", "org": "Government of Saudi Arabia" }
    ],
    "likelyToRaise": ["OPEC+ production policy", "NEOM green hydrogen", "Power-grid interconnection"],
    "statements": [],
    "citations": ["https://en.wikipedia.org/wiki/Abdulaziz_bin_Salman_Al_Saud"],
    "identifiedAsOf": "2026-01-01",
    "confidence": "medium"
  },
  "BRA:energy": {
    "name": "Alexandre Silveira",
    "nameAr": "ألكسندري سيلفيرا",
    "role": "Minister of Mines and Energy",
    "roleAr": "وزير المناجم والطاقة",
    "summary": "Brazil's Minister of Mines and Energy since January 2023; former senator for Minas Gerais. Drives the fuel-of-the-future (SAF/biofuels) programme and grid-renewables expansion.",
    "career": [
      { "period": "2023–", "position": "Minister of Mines and Energy", "org": "Government of Brazil" },
      { "period": "2022", "position": "Senator (Minas Gerais)", "org": "Federal Senate of Brazil" }
    ],
    "likelyToRaise": ["Biofuels & SAF partnerships", "Green hydrogen investment", "Critical minerals"],
    "statements": [],
    "citations": ["https://en.wikipedia.org/wiki/Alexandre_Silveira"],
    "identifiedAsOf": "2026-01-01",
    "confidence": "medium"
  },
  "IDN:energy": {
    "name": "Bahlil Lahadalia",
    "nameAr": "بهليل لاهادليا",
    "role": "Minister of Energy and Mineral Resources",
    "roleAr": "وزير الطاقة والموارد المعدنية",
    "summary": "Indonesia's Minister of Energy and Mineral Resources since August 2024; previously Investment Minister. Focused on downstreaming, nickel-chain investment and refinery expansion.",
    "career": [
      { "period": "2024–", "position": "Minister of Energy and Mineral Resources", "org": "Government of Indonesia" },
      { "period": "2021–2024", "position": "Minister of Investment", "org": "Government of Indonesia" }
    ],
    "likelyToRaise": ["Downstream nickel investment", "Refinery & storage capacity", "Energy-transition funding"],
    "statements": [],
    "citations": ["https://en.wikipedia.org/wiki/Bahlil_Lahadalia"],
    "identifiedAsOf": "2026-01-01",
    "confidence": "medium"
  }
}
```

- [ ] **Step 2: Write the failing loader test:**

```ts
import { describe, expect, it } from "vitest";
import { getSeedCounterpart } from "@/lib/data/counterparts";

describe("counterpart seeds", () => {
  it("returns the seeded dossier for a known country/role", () => {
    const p = getSeedCounterpart("BRA", "energy");
    expect(p?.name).toBe("Alexandre Silveira");
    expect(p?.confidence).toBe("medium");
    expect(p?.citations[0]).toContain("wikipedia.org");
  });
  it("returns null for unseeded pairs", () => {
    expect(getSeedCounterpart("JPN", "energy")).toBeNull();
    expect(getSeedCounterpart("BRA", "foreign")).toBeNull();
  });
});
```

- [ ] **Step 3: Run → FAIL. Step 4: Implement `src/lib/data/counterparts.ts`:**

```ts
import seeds from "../../../data/seed/counterparts.json";
import type { CounterpartProfile } from "@/services/agent/state";

const SEEDS = seeds as Record<string, Omit<CounterpartProfile, "photoUrl">>;

/** Curated offline dossiers — only officeholders stable enough to assert. */
export function getSeedCounterpart(iso3: string, roleKey: string): CounterpartProfile | null {
  const hit = SEEDS[`${iso3}:${roleKey}`];
  return hit ? { ...hit } : null;
}
```

If the JSON import needs config, check `tsconfig.json` for `resolveJsonModule` (the repo already imports JSON elsewhere — mirror that pattern; report what you found).

- [ ] **Step 5: Run → PASS. `pnpm typecheck` → 0. Format. Step 6: Commit:**

```bash
git add data/seed/counterparts.json src/lib/data/counterparts.ts tests/unit/counterpart-seeds.test.ts
git commit -m "feat(data): curated counterpart seeds (ARE/SAU/BRA/IDN energy) + loader"
```

---

### Task 5: The counterpart node (identify → enrich → synthesize)

**Files:**
- Modify: `src/services/agent/nodes.ts` (ONLY: add `export` to the `extractJson` function declaration — one word)
- Create: `src/services/agent/counterpart.ts`
- Test: `tests/unit/counterpart-node.test.ts`

Design notes: the node is DATA-ONLY (runner owns the trace) and dependency-injected so tests bypass the always-on Vitest air gap. The never-fabricate rule is structural: every failure path returns an explicit `confidence: "unconfirmed"` profile (or a seed), never a guessed person.

- [ ] **Step 1: Export `extractJson`** in `src/services/agent/nodes.ts` — change `function extractJson(` to `export function extractJson(`. Nothing else.

- [ ] **Step 2: Write the failing test** (`tests/unit/counterpart-node.test.ts`):

```ts
import { describe, expect, it, vi } from "vitest";
import {
  type CounterpartDeps,
  counterpartNode,
  parseDossier,
  parseIdentity,
} from "@/services/agent/counterpart";
import { FIXTURE_STATE } from "../fixtures/agent-state";
import type { AgentState } from "@/services/agent/state";

function baseState(extra?: Partial<AgentState>): AgentState {
  return { ...FIXTURE_STATE, counterpart: undefined, counterpartName: undefined, ...extra };
}

const IDENTIFY_JSON = '{"name":"Alexandre Silveira","confidence":"high"}';
const DOSSIER_JSON =
  '{"summary":"Brazilian minister driving SAF.","career":[{"period":"2023–","position":"Minister of Mines and Energy","org":"Government of Brazil"}],"likelyToRaise":["SAF partnerships"]}';

function liveDeps(overrides?: Partial<CounterpartDeps>): CounterpartDeps {
  return {
    airgapped: () => false,
    search: vi.fn(async () => ({
      query: "q",
      answer: "Alexandre Silveira is Brazil's Minister of Mines and Energy.",
      results: [
        { title: "Silveira announces SAF push", url: "https://news.example/saf", content: "the minister said…", score: 0.9 },
      ],
      source: "Tavily",
      live: true,
    })) as CounterpartDeps["search"],
    wiki: vi.fn(async () => ({
      title: "Alexandre Silveira",
      extract: "Alexandre Silveira is a Brazilian politician serving as Minister of Mines and Energy.",
      thumbnailUrl: "https://upload.wikimedia.org/silveira.jpg",
      pageUrl: "https://en.wikipedia.org/wiki/Alexandre_Silveira",
      live: true,
    })) as CounterpartDeps["wiki"],
    llm: vi
      .fn()
      .mockResolvedValueOnce({ text: IDENTIFY_JSON })
      .mockResolvedValueOnce({ text: DOSSIER_JSON }) as unknown as CounterpartDeps["llm"],
    today: () => "2026-06-10",
    ...overrides,
  };
}

describe("parseIdentity", () => {
  it("accepts a clean identification", () => {
    expect(parseIdentity(IDENTIFY_JSON)).toEqual({ name: "Alexandre Silveira", confidence: "high" });
  });
  it("rejects null names, role echoes and junk", () => {
    expect(parseIdentity('{"name":null,"confidence":"high"}')).toBeNull();
    expect(parseIdentity('{"name":"The Minister of Energy","confidence":"high"}')).toBeNull();
    expect(parseIdentity("not json")).toBeNull();
  });
});

describe("parseDossier", () => {
  it("parses with lenient defaults", () => {
    expect(parseDossier(DOSSIER_JSON)?.career[0]?.org).toBe("Government of Brazil");
    expect(parseDossier('{"summary":"x"}')?.likelyToRaise).toEqual([]);
    expect(parseDossier("junk")).toBeNull();
  });
});

describe("counterpartNode", () => {
  it("air-gapped: returns the seed when one exists (BRA energy)", async () => {
    const out = await counterpartNode(baseState({ counterpartRole: "energy" }));
    expect(out.counterpart?.name).toBe("Alexandre Silveira");
    expect(out.counterpart?.confidence).toBe("medium");
  });

  it("air-gapped: unseeded pair returns an honest unconfirmed profile", async () => {
    const s = baseState({ counterpartRole: "foreign" });
    const out = await counterpartNode(s);
    expect(out.counterpart?.confidence).toBe("unconfirmed");
    expect(out.counterpart?.name).toBe("");
    expect(out.counterpart?.role).toBe("Foreign Minister");
  });

  it("live happy path: identify → enrich → synthesize, cited", async () => {
    const deps = liveDeps();
    const out = await counterpartNode(baseState({ counterpartRole: "energy" }), deps);
    const p = out.counterpart;
    expect(p?.name).toBe("Alexandre Silveira");
    expect(p?.photoUrl).toContain("upload.wikimedia.org");
    expect(p?.summary.length).toBeGreaterThan(0);
    expect(p?.career[0]?.org).toBe("Government of Brazil");
    expect(p?.citations).toContain("https://en.wikipedia.org/wiki/Alexandre_Silveira");
    expect(p?.statements[0]?.url).toBe("https://news.example/saf");
    expect(p?.identifiedAsOf).toBe("2026-06-10");
    expect(p?.confidence).toBe("high");
  });

  it("live custom name skips identification (one LLM call only)", async () => {
    const llm = vi.fn().mockResolvedValueOnce({ text: DOSSIER_JSON });
    const deps = liveDeps({ llm: llm as unknown as CounterpartDeps["llm"] });
    const out = await counterpartNode(
      baseState({ counterpartRole: "custom", counterpartName: "Jane Doe" }),
      deps,
    );
    expect(out.counterpart?.name).toBe("Jane Doe");
    expect(out.counterpart?.confidence).toBe("high");
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it("live identification failure falls back to seed, else unconfirmed", async () => {
    const badLlm = vi.fn(async () => ({ text: "no json" }));
    const noWiki = vi.fn(async () => null);
    const out = await counterpartNode(
      baseState({
        counterpartRole: "energy",
        scope: { ...(FIXTURE_STATE.scope ?? ({} as never)), iso3: "JPN" },
      }),
      liveDeps({ llm: badLlm as unknown as CounterpartDeps["llm"], wiki: noWiki as CounterpartDeps["wiki"] }),
    );
    expect(out.counterpart?.confidence).toBe("unconfirmed");
  });

  it("returns {} without a scope", async () => {
    expect(await counterpartNode(baseState({ scope: undefined }))).toEqual({});
  });
});
```

- [ ] **Step 3: Run → FAIL. Step 4: Implement `src/services/agent/counterpart.ts`:**

```ts
/**
 * Counterpart agent — researches the PERSON the meeting is with.
 * identify (Tavily) → enrich (Wikipedia) → synthesize (local qwen, cited).
 * Data-only node (the runner owns the trace). Never fabricates a person:
 * every failure path returns a seed or an explicit "unconfirmed" profile.
 */
import { getSeedCounterpart } from "@/lib/data/counterparts";
import { iso3Name } from "@/lib/data/iso-countries";
import {
  ROLE_LABELS,
  type RoleSelection,
  roleSelectionFrom,
  searchQueryFor,
} from "@/lib/experience/roles";
import { extractJson } from "@/services/agent/nodes";
import {
  type AgentState,
  type CounterpartProfile,
} from "@/services/agent/state";
import { isAirgapped } from "@/services/live/runtime";
import { webResearch } from "@/services/live/tavily";
import { wikiPersonSummary } from "@/services/live/wikipedia";
import { completeText } from "@/services/llm";
import { modelForRole } from "@/services/llm/roles";
import { z } from "zod";

const ACTOR = "agent";

const IdentitySchema = z.object({
  name: z.string().nullable(),
  confidence: z.enum(["high", "medium"]).default("medium"),
});

/** Pure: parse the identify-LLM response; rejects role echoes and junk. */
export function parseIdentity(
  raw: string,
): { name: string; confidence: "high" | "medium" } | null {
  const r = IdentitySchema.safeParse(extractJson(raw));
  if (!r.success || !r.data.name || r.data.name.trim().length < 3) return null;
  if (/^(the |a )?(minister|president|secretary|head of|unknown|n\/?a)/i.test(r.data.name.trim()))
    return null;
  return { name: r.data.name.trim(), confidence: r.data.confidence };
}

const DossierSchema = z.object({
  summary: z.string().default(""),
  career: z
    .array(
      z.object({
        period: z.string().default(""),
        position: z.string().default(""),
        org: z.string().default(""),
      }),
    )
    .default([]),
  likelyToRaise: z.array(z.string()).default([]),
});

/** Pure: parse the dossier-LLM response with lenient defaults. */
export function parseDossier(raw: string): z.infer<typeof DossierSchema> | null {
  const j = extractJson(raw);
  if (!j) return null;
  const r = DossierSchema.safeParse(j);
  return r.success ? r.data : null;
}

export interface CounterpartDeps {
  airgapped: () => boolean;
  search: typeof webResearch;
  wiki: typeof wikiPersonSummary;
  llm: typeof completeText;
  today: () => string;
}

const DEFAULT_DEPS: CounterpartDeps = {
  airgapped: isAirgapped,
  search: webResearch,
  wiki: wikiPersonSummary,
  llm: completeText,
  today: () => new Date().toISOString().slice(0, 10),
};

function roleLabel(sel: RoleSelection): string {
  return sel.key === "custom" ? (sel.customName?.trim() || "Counterpart") : ROLE_LABELS[sel.key].en;
}

function unconfirmed(role: RoleSelection, today: string): CounterpartProfile {
  return {
    name: "",
    role: roleLabel(role),
    roleAr: role.key === "custom" ? undefined : ROLE_LABELS[role.key].ar,
    summary: "",
    career: [],
    likelyToRaise: [],
    statements: [],
    citations: [],
    identifiedAsOf: today,
    confidence: "unconfirmed",
  };
}

export async function counterpartNode(
  s: AgentState,
  deps: CounterpartDeps = DEFAULT_DEPS,
): Promise<Partial<AgentState>> {
  const scope = s.scope;
  if (!scope) return {};
  const role = roleSelectionFrom(s.counterpartRole, s.counterpartName);
  const country = iso3Name(scope.iso3) ?? scope.iso3;
  const today = deps.today();

  try {
    if (deps.airgapped()) {
      const seed = getSeedCounterpart(scope.iso3, role.key);
      return { counterpart: seed ?? unconfirmed(role, today) };
    }

    // 1 · Identify the current officeholder (skipped for user-supplied names).
    let name = role.key === "custom" ? (role.customName?.trim() ?? null) : null;
    let confidence: "high" | "medium" = "high";
    let search: Awaited<ReturnType<typeof webResearch>> | null = null;
    if (!name) {
      search = await deps.search(searchQueryFor(country, role), { maxResults: 5 });
      const evidence = [
        search.answer ? `ANSWER: ${search.answer}` : "",
        ...search.results.slice(0, 5).map((r) => `- ${r.title}: ${r.content.slice(0, 200)}`),
      ]
        .filter(Boolean)
        .join("\n");
      if (evidence) {
        const res = await deps.llm({
          system:
            'Extract the CURRENT named officeholder from the evidence. Return STRICT JSON {"name": string|null, "confidence": "high"|"medium"}. name must be a real person\'s full name taken from the evidence; null if the evidence does not clearly name the current holder.',
          messages: [
            {
              role: "user",
              content: `ROLE SOUGHT: ${roleLabel(role)} of ${country}\n\nEVIDENCE:\n${evidence}`,
            },
          ],
          model: modelForRole("analyst"),
          step: "complete",
          maxTokens: 120,
          json: true,
          actor: ACTOR,
          classification: s.classification,
        });
        const id = parseIdentity(res.text);
        if (id) ({ name, confidence } = id);
      }
    }
    if (!name) {
      const seed = getSeedCounterpart(scope.iso3, role.key);
      return { counterpart: seed ?? unconfirmed(role, today) };
    }

    // 2 · Enrich from Wikipedia (best-effort).
    const wiki = await deps.wiki(`${name} ${country}`).catch(() => null);

    // 3 · Synthesize the dossier from real grounding only.
    const grounding = [
      wiki?.extract ? `WIKIPEDIA: ${wiki.extract.slice(0, 1200)}` : "",
      (search?.results ?? [])
        .slice(0, 3)
        .map((r) => `NEWS: ${r.title} — ${r.content.slice(0, 200)}`)
        .join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n");
    let dossier: ReturnType<typeof parseDossier> = null;
    if (grounding) {
      try {
        const res = await deps.llm({
          system:
            'You profile a foreign official for a UAE ministerial meeting. Use ONLY the supplied grounding; never invent facts. Return STRICT JSON {"summary": string (<=50 words), "career": [{"period":str,"position":str,"org":str}] (max 4, most recent first), "likelyToRaise": [str] (2-4 items, what they will likely raise with the UAE, inferred from the grounding)}.',
          messages: [
            {
              role: "user",
              content: `PERSON: ${name} — ${roleLabel(role)} of ${country}\n\nGROUNDING:\n${grounding}`,
            },
          ],
          model: modelForRole("analyst"),
          step: "complete",
          maxTokens: 500,
          json: true,
          actor: ACTOR,
          classification: s.classification,
        });
        dossier = parseDossier(res.text);
      } catch {
        dossier = null;
      }
    }

    const statements = (search?.results ?? [])
      .slice(0, 3)
      .map((r) => ({ text: r.title, url: r.url }));
    const citations = [...(wiki ? [wiki.pageUrl] : []), ...statements.map((st) => st.url)];

    if (!wiki && !dossier && citations.length === 0) {
      // Named but entirely ungrounded — do not present an empty dossier as fact.
      return { counterpart: { ...unconfirmed(role, today), name, confidence: "medium" } };
    }

    const seed = getSeedCounterpart(scope.iso3, role.key);
    return {
      counterpart: {
        name,
        nameAr: seed?.name === name ? seed.nameAr : undefined,
        role: roleLabel(role),
        roleAr: role.key === "custom" ? undefined : ROLE_LABELS[role.key].ar,
        photoUrl: wiki?.thumbnailUrl,
        photoAttribution: wiki ? "Photo: Wikipedia (CC)" : undefined,
        summary: dossier?.summary || (wiki?.extract ?? "").slice(0, 280),
        career: dossier?.career ?? [],
        likelyToRaise: dossier?.likelyToRaise ?? [],
        statements,
        citations,
        identifiedAsOf: today,
        confidence,
      },
    };
  } catch {
    return { counterpart: unconfirmed(role, today) };
  }
}
```

- [ ] **Step 5: Run → PASS (9 tests).** Also `pnpm vitest run tests/unit` (no regressions) and `pnpm typecheck` → 0. Format your files.

- [ ] **Step 6: Commit**

```bash
git add src/services/agent/nodes.ts src/services/agent/counterpart.ts tests/unit/counterpart-node.test.ts
git commit -m "feat(agent): counterpart node — identify, enrich, synthesize with never-fabricate fallback"
```

---

### Task 6: Plumbing — role/name through route → graph → scribe; hook + Experience

**Files:**
- Modify: `src/app/api/agent/run/route.ts`
- Modify: `src/services/agent/graph.ts`
- Modify: `src/services/agent/nodes.ts` (composeProse — two surgical insertions)
- Modify: `src/lib/hooks/useAgentRun.ts`
- Modify: `tests/unit/use-agent-run.test.ts`
- Modify: `src/components/experience/Experience.tsx`

- [ ] **Step 1: Route.** In `src/app/api/agent/run/route.ts`: extend the schema —

```ts
const BodySchema = z.object({
  command: z.string().min(2).max(500),
  role: z.string().max(40).optional(),
  counterpartName: z.string().max(80).optional(),
});
```

and pass both into the runner: `runAgent(parsed.data.command, { classification, role: parsed.data.role, counterpartName: parsed.data.counterpartName })`.

- [ ] **Step 2: Graph.** In `src/services/agent/graph.ts`:

(a) `RunOptions` gains the inputs:

```ts
export interface RunOptions {
  classification?: Classification;
  role?: string;
  counterpartName?: string;
}
```

(b) At the top of `runAgent`, after the classification line, seed the state:

```ts
  if (opts.role) s = { ...s, counterpartRole: opts.role };
  if (opts.counterpartName) s = { ...s, counterpartName: opts.counterpartName };
```

(c) Import the node: `import { counterpartNode } from "@/services/agent/counterpart";`

(d) Kick off in parallel right AFTER the `yield mark("scope", "done", s.scope.iso3);` line:

```ts
    // ── Counterpart (parallel — researches the person while data streams) ──
    yield mark("counterpart", "start");
    yield note("counterpart", `Identifying ${name}'s counterpart · live search + Wikipedia`);
    const counterpartP = counterpartNode(s).catch(() => ({}) as Partial<AgentState>);
```

(e) Await + report right AFTER the `yield mark("research", "done", …)` line:

```ts
    s = { ...s, ...(await counterpartP) };
    if (s.counterpart && s.counterpart.confidence !== "unconfirmed") {
      yield note("counterpart", `↳ ${s.counterpart.name} — ${s.counterpart.role}`);
      if (s.counterpart.citations.length > 0) {
        await sleep(NOTE_GAP);
        yield note(
          "counterpart",
          `↳ ${plural(s.counterpart.citations.length, "source")} cited · Wikipedia + live web`,
        );
      }
      yield mark("counterpart", "done", s.counterpart.name);
    } else {
      yield mark("counterpart", "done", "unconfirmed — verify before meeting");
    }
```

("done" with an explicit unconfirmed detail — the card carries the warning; an error chip would read as a crash.)

- [ ] **Step 3: Scribe weave.** In `src/services/agent/nodes.ts` `composeProse`, insert a grounding line into the user content right after the `SUBJECT: …` line:

```ts
MEETING COUNTERPART: ${s.counterpart?.name ? `${s.counterpart.name} — ${s.counterpart.role}` : "(not identified)"}
```

and append one rule to the system RULES list:

```
- If MEETING COUNTERPART names a person, address counterpartObjectives/counterpartAsks to that person by name where natural.
```

(Use the template-literal style already in the file; do not restructure the prompt.)

- [ ] **Step 4: Hook.** `useAgentRun.start` gains a third arg:

```ts
start: (command: string, role: string, counterpartName?: string) => Promise<void>;
```

body becomes `JSON.stringify({ command, role, ...(counterpartName ? { counterpartName } : {}) })`. Update the interface AND the implementation. In `tests/unit/use-agent-run.test.ts`, the body-shape assertion in test 1 stays `{ command, role }` (no third arg passed there) — ADD one assertion to that same test: call signature with a custom name in a NEW minimal test:

```ts
  it("includes counterpartName in the body when provided", async () => {
    const fetchMock = vi.fn(async () => sseResponse(sseBody([{ event: "final", state: FIXTURE_STATE }])));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAgentRun());
    await act(async () => {
      await result.current.start("x y", "custom", "Jane Doe");
    });
    const callArgs = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(callArgs[1].body as string)).toEqual({
      command: "x y",
      role: "custom",
      counterpartName: "Jane Doe",
    });
  });
```

- [ ] **Step 5: Experience.** In `begin()` pass the custom name: `void run.start(commandFor(s.country.name, s.role), s.role.key, s.role.customName);`

- [ ] **Step 6: Verify** — `pnpm typecheck` → 0; `pnpm vitest run tests/unit` → ALL pass (now 5 hook tests). Format touched files.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/agent/run/route.ts src/services/agent/graph.ts src/services/agent/nodes.ts src/lib/hooks/useAgentRun.ts tests/unit/use-agent-run.test.ts src/components/experience/Experience.tsx
git commit -m "feat(agent): counterpart wired through route, graph (parallel), scribe and hook"
```

---

### Task 7: Photo proxy route (host-validated, disk-cached)

**Files:**
- Create: `src/app/api/agent/counterpart-photo/route.ts`
- Modify: `.gitignore` (add `data/cache/`)
- Test: `tests/unit/counterpart-photo.test.ts`

- [ ] **Step 1: Failing test (pure validator):**

```ts
import { describe, expect, it } from "vitest";
import { isAllowedPhotoSrc } from "@/app/api/agent/counterpart-photo/route";

describe("isAllowedPhotoSrc", () => {
  it("allows only https upload.wikimedia.org", () => {
    expect(isAllowedPhotoSrc("https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg")).toBe(true);
    expect(isAllowedPhotoSrc("http://upload.wikimedia.org/x.jpg")).toBe(false);
    expect(isAllowedPhotoSrc("https://upload.wikimedia.org.evil.com/x.jpg")).toBe(false);
    expect(isAllowedPhotoSrc("https://evil.com/upload.wikimedia.org/x.jpg")).toBe(false);
    expect(isAllowedPhotoSrc("not a url")).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement the route:**

```ts
import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SSRF guard: only Wikimedia's image CDN may be proxied. */
export function isAllowedPhotoSrc(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === "https:" && u.hostname === "upload.wikimedia.org";
  } catch {
    return false;
  }
}

function cacheDir(): string {
  return process.env.PHOTO_CACHE_DIR ?? path.join(process.cwd(), "data", "cache", "counterparts");
}

const MAX_BYTES = 3 * 1024 * 1024;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const src = new URL(req.url).searchParams.get("src") ?? "";
  if (!isAllowedPhotoSrc(src)) {
    return NextResponse.json({ error: "src not allowed" }, { status: 400 });
  }

  const key = Buffer.from(src).toString("base64url").slice(0, 40);
  const file = path.join(cacheDir(), key);
  try {
    if (fs.existsSync(file)) {
      return new Response(new Uint8Array(fs.readFileSync(file)), {
        headers: {
          "content-type": fs.existsSync(`${file}.ct`)
            ? fs.readFileSync(`${file}.ct`, "utf8")
            : "image/jpeg",
          "cache-control": "private, max-age=86400",
        },
      });
    }
    const res = await fetch(src, { signal: AbortSignal.timeout(10_000) });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.startsWith("image/")) {
      return NextResponse.json({ error: "upstream not an image" }, { status: 502 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "image too large" }, { status: 502 });
    }
    try {
      fs.mkdirSync(cacheDir(), { recursive: true });
      fs.writeFileSync(file, buf);
      fs.writeFileSync(`${file}.ct`, ct, "utf8");
    } catch {
      /* cache is best-effort */
    }
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": ct, "cache-control": "private, max-age=86400" },
    });
  } catch {
    return NextResponse.json({ error: "photo unavailable" }, { status: 502 });
  }
}
```

- [ ] **Step 4: gitignore** — add near the other data entries:

```
# Cached counterpart photos (runtime-fetched, offline after first hit)
data/cache/
```

- [ ] **Step 5: Run the test → PASS; `pnpm typecheck` → 0; full `pnpm vitest run tests/unit` green. Format. Step 6: Commit:**

```bash
git add src/app/api/agent/counterpart-photo/route.ts tests/unit/counterpart-photo.test.ts .gitignore
git commit -m "feat(api): counterpart photo proxy — wikimedia-only, disk-cached"
```

Air-gapped demo pre-warm (document only — no code): with the server running online once, `curl -b <session> "http://localhost:3000/api/agent/counterpart-photo?src=<thumbnailUrl>"` per seed person; the files persist under `data/cache/counterparts/`.

---

### Task 8: i18n strings (EN + AR)

**Files:**
- Modify: `src/lib/i18n/messages.ts`

- [ ] **Step 1: EN** — inside the `en.experience` block: add to `steps`: `counterpart: "Research counterpart",`; add to `focus`: `counterpart: "Counterpart",`; add to `tiles`: `counterpart: "Counterpart",`; and add a sibling sub-block after `tiles`:

```ts
      counterpartView: {
        unconfirmedTitle: "Counterpart unconfirmed",
        unconfirmedBody:
          "Identification was not possible from available sources — verify the counterpart before the meeting.",
        verifyShort: "verify before meeting",
        identifiedAsOf: "Identified as of",
        confidence: "Confidence",
        career: "Career",
        likelyToRaise: "Likely to raise",
        statements: "Recent statements",
        sources: "Sources",
      },
```

- [ ] **Step 2: AR** — mirrored in `ar.experience`: `steps.counterpart: "بحث الطرف المقابل",`; `focus.counterpart: "الطرف المقابل",`; `tiles.counterpart: "الطرف المقابل",`; and:

```ts
      counterpartView: {
        unconfirmedTitle: "لم يتأكد الطرف المقابل",
        unconfirmedBody: "تعذّر التحقق من الهوية من المصادر المتاحة — تحقّق من الطرف المقابل قبل الاجتماع.",
        verifyShort: "تحقّق قبل الاجتماع",
        identifiedAsOf: "تم التحديد بتاريخ",
        confidence: "الثقة",
        career: "المسيرة المهنية",
        likelyToRaise: "مرجّح أن يطرح",
        statements: "تصريحات حديثة",
        sources: "المصادر",
      },
```

- [ ] **Step 3: Verify** — `pnpm typecheck` → 0 (structural parity); `pnpm vitest run tests/unit` green. Commit:

```bash
git add src/lib/i18n/messages.ts
git commit -m "feat(i18n): counterpart strings (EN/AR)"
```

---

### Task 9: UI — focus view, tile, theater chip, command-center wiring

**Files:**
- Modify: `src/lib/experience/machine.ts` (FOCUS_VIEWS)
- Modify: `tests/unit/experience-machine.test.ts` (one assertion)
- Create: `src/components/experience/counterpart-utils.ts`
- Test: `tests/unit/counterpart-utils.test.ts`
- Create: `src/components/experience/CounterpartView.tsx`
- Test: `tests/unit/counterpart-view.test.tsx`
- Modify: `src/components/experience/Bento.tsx` (new tile + span rebalance)
- Modify: `src/components/experience/Theater.tsx` (STEP_KEYS)
- Modify: `src/components/experience/CommandCenter.tsx` (panel branch + header chip)

- [ ] **Step 1: machine.** `FOCUS_VIEWS` becomes:

```ts
export const FOCUS_VIEWS = ["overview", "brief", "counterpart", "opportunities", "sources"] as const;
```

In `tests/unit/experience-machine.test.ts`, in the hash-codec test add: `expect(FOCUS_VIEWS).toContain("counterpart");` and one round-trip: `expect(parseHash("#run=r1&focus=counterpart")).toEqual({ runId: "r1", focus: "counterpart" });`. Run → green.

- [ ] **Step 2: utils (TDD).** Failing test `tests/unit/counterpart-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialsOf, photoProxySrc } from "@/components/experience/counterpart-utils";
import { FIXTURE_STATE } from "../fixtures/agent-state";

describe("counterpart utils", () => {
  it("initialsOf", () => {
    expect(initialsOf("Alexandre Silveira")).toBe("AS");
    expect(initialsOf("Cher")).toBe("C");
    expect(initialsOf("  ")).toBe("?");
  });
  it("photoProxySrc proxies remote urls, passes local paths, undefined when absent", () => {
    const p = { ...FIXTURE_STATE.counterpart!, photoUrl: "https://upload.wikimedia.org/a b.jpg" };
    expect(photoProxySrc(p)).toBe(
      "/api/agent/counterpart-photo?src=https%3A%2F%2Fupload.wikimedia.org%2Fa%20b.jpg",
    );
    expect(photoProxySrc({ ...p, photoUrl: "/cached/x.jpg" })).toBe("/cached/x.jpg");
    expect(photoProxySrc({ ...p, photoUrl: undefined })).toBeUndefined();
  });
});
```

Implement `src/components/experience/counterpart-utils.ts`:

```ts
import type { CounterpartProfile } from "@/services/agent/state";

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .slice(0, 2)
      .join("") || "?"
  );
}

export function photoProxySrc(p: CounterpartProfile): string | undefined {
  if (!p.photoUrl) return undefined;
  if (p.photoUrl.startsWith("/")) return p.photoUrl;
  return `/api/agent/counterpart-photo?src=${encodeURIComponent(p.photoUrl)}`;
}
```

- [ ] **Step 3: CounterpartView (TDD).** Failing test `tests/unit/counterpart-view.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/context";
import { CounterpartView } from "@/components/experience/CounterpartView";
import { FIXTURE_STATE } from "../fixtures/agent-state";

afterEach(cleanup);

function show(profile: Parameters<typeof CounterpartView>[0]["profile"]) {
  return render(
    <I18nProvider>
      <CounterpartView profile={profile} />
    </I18nProvider>,
  );
}

describe("CounterpartView", () => {
  it("renders the confirmed dossier", () => {
    const { getByText } = show(FIXTURE_STATE.counterpart);
    expect(getByText("Alexandre Silveira")).toBeTruthy();
    expect(getByText(/Government of Brazil/)).toBeTruthy();
    expect(getByText(/Biofuels & SAF partnerships/)).toBeTruthy();
    expect(getByText(/wikipedia.org/)).toBeTruthy();
  });
  it("renders the unconfirmed state with the warning", () => {
    const { getByText } = show({
      ...FIXTURE_STATE.counterpart!,
      name: "",
      confidence: "unconfirmed",
    });
    expect(getByText(/Counterpart unconfirmed/)).toBeTruthy();
    expect(getByText(/verify the counterpart before the meeting/)).toBeTruthy();
  });
  it("treats a missing profile as unconfirmed", () => {
    const { getByText } = show(undefined);
    expect(getByText(/Counterpart unconfirmed/)).toBeTruthy();
  });
});
```

Implement `src/components/experience/CounterpartView.tsx`:

```tsx
"use client";

import { initialsOf, photoProxySrc } from "@/components/experience/counterpart-utils";
import { useI18n } from "@/lib/i18n/context";
import type { CounterpartProfile } from "@/services/agent/state";

export function CounterpartView({ profile }: { profile?: CounterpartProfile }) {
  const { locale, t } = useI18n();
  const x = t.experience.counterpartView;
  const lang: "en" | "ar" = locale === "ar" ? "ar" : "en";

  if (!profile || profile.confidence === "unconfirmed") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div
          className="grid h-20 w-20 place-items-center rounded-full border border-ink-300 bg-ink-150 text-2xl text-ink-400"
          aria-hidden
        >
          ?
        </div>
        <h3 className="text-lg font-semibold text-ink-800">{x.unconfirmedTitle}</h3>
        {profile?.role && (
          <p className="text-sm text-ink-500">
            {lang === "ar" ? (profile.roleAr ?? profile.role) : profile.role}
          </p>
        )}
        <p className="max-w-md rounded-md border border-signal-warn/50 bg-signal-warn/10 px-4 py-2 text-sm text-tamm-olive">
          ⚠ {x.unconfirmedBody}
        </p>
      </div>
    );
  }

  const src = photoProxySrc(profile);
  const name = lang === "ar" ? (profile.nameAr ?? profile.name) : profile.name;
  const role = lang === "ar" ? (profile.roleAr ?? profile.role) : profile.role;
  const confCls =
    profile.confidence === "high"
      ? "border-signal-ok/40 text-signal-ok"
      : "border-tamm-olive/40 text-tamm-olive";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        {src ? (
          <img
            src={src}
            alt={profile.name}
            className="h-20 w-20 rounded-full border border-accent/40 object-cover"
          />
        ) : (
          <div
            className="grid h-20 w-20 place-items-center rounded-full border border-accent/40 bg-ink-150 text-xl font-bold text-tamm-cyan"
            aria-hidden
          >
            {initialsOf(profile.name)}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-xl font-semibold text-ink-900">{name}</h3>
          <p className="text-sm text-ink-500">{role}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-ink-400">
            <span className={`rounded-full border px-2 py-0.5 font-semibold uppercase ${confCls}`}>
              {x.confidence}: {profile.confidence}
            </span>
            <span>
              {x.identifiedAsOf} {profile.identifiedAsOf}
            </span>
          </p>
        </div>
      </div>

      {profile.summary && (
        <p className="text-sm leading-relaxed text-ink-700">{profile.summary}</p>
      )}

      {profile.career.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {x.career}
          </h4>
          <ul className="mt-2 space-y-1.5">
            {profile.career.map((c) => (
              <li
                key={`${c.period}-${c.position}`}
                className="flex flex-wrap items-baseline gap-2 text-sm"
              >
                <span className="font-mono text-2xs text-tamm-cyan">{c.period}</span>
                <span className="text-ink-700">{c.position}</span>
                <span className="text-2xs text-ink-400">· {c.org}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.likelyToRaise.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {x.likelyToRaise}
          </h4>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-ink-700">
            {profile.likelyToRaise.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      {profile.statements.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {x.statements}
          </h4>
          <ul className="mt-2 space-y-1 text-sm">
            {profile.statements.map((st) => (
              <li key={st.url}>
                <a
                  href={st.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-strong hover:underline"
                >
                  {st.text}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.citations.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {x.sources}
          </h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {profile.citations.map((c) => (
              <li
                key={c}
                className="max-w-72 truncate rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs text-ink-600"
              >
                {c}
              </li>
            ))}
          </ul>
          {profile.photoAttribution && (
            <p className="mt-2 text-2xs text-ink-400">{profile.photoAttribution}</p>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Bento tile + span rebalance.** In `src/components/experience/Bento.tsx`:
  - Imports: `import { initialsOf, photoProxySrc } from "@/components/experience/counterpart-utils";`
  - Derive after `const b = state?.briefing;`: `const cp = state?.counterpart;`
  - Insert a new tile directly AFTER the BLUF tile block:

```tsx
      {(cp || assembling) && (
        <Tile
          id="counterpart"
          label={x.counterpart}
          span="md:col-span-3"
          onClick={cp && onFocus ? () => onFocus("counterpart") : undefined}
        >
          {cp ? (
            <div className="mt-1.5 flex items-center gap-3">
              {photoProxySrc(cp) ? (
                <img
                  src={photoProxySrc(cp)}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full border border-accent/40 object-cover"
                />
              ) : (
                <div
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-accent/40 bg-ink-150 text-sm font-bold text-tamm-cyan"
                  aria-hidden
                >
                  {cp.confidence === "unconfirmed" ? "?" : initialsOf(cp.name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-800">
                  {cp.confidence === "unconfirmed" ? t.experience.counterpartView.unconfirmedTitle : cp.name}
                </p>
                <p className="truncate text-2xs text-ink-500">{cp.role}</p>
                {cp.confidence === "unconfirmed" ? (
                  <p className="text-2xs text-tamm-olive">⚠ {t.experience.counterpartView.verifyShort}</p>
                ) : (
                  <p className="text-2xs text-ink-400">{cp.identifiedAsOf}</p>
                )}
              </div>
            </div>
          ) : (
            <Shimmer />
          )}
        </Tile>
      )}
```

  - Rebalance spans: Opportunity tile `md:col-span-3` → `md:col-span-4`; Developments tile `md:col-span-4` → `md:col-span-12`. (New grid: bluf 6 / counterpart 3 / trade 3 · opp 4 / indicators 4 / forecast 4 · developments 12.) Note `t` is already in scope via `useI18n`; `x` is `t.experience.tiles` so the unconfirmed strings go through `t.experience.counterpartView`.

- [ ] **Step 5: Theater.** `STEP_KEYS` becomes:

```ts
const STEP_KEYS = ["scope", "research", "counterpart", "analyse", "opportunities", "briefing"] as const;
```

- [ ] **Step 6: CommandCenter.** Imports: `CounterpartView`, and `initialsOf` from the utils. Add the panel branch alongside the others:

```tsx
            {focus === "counterpart" && <CounterpartView profile={state.counterpart} />}
```

And in the header row, after the ready badge, the counterpart chip:

```tsx
        {state.counterpart?.name && (
          <button
            type="button"
            onClick={() => onFocus("counterpart")}
            className="flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-0.5 text-2xs text-white/70 transition hover:border-tamm-cyan/50 hover:text-white"
          >
            <span
              className="grid h-4 w-4 place-items-center rounded-full bg-accent/30 text-[9px] font-bold text-tamm-cyan"
              aria-hidden
            >
              {initialsOf(state.counterpart.name)}
            </span>
            {state.counterpart.name}
          </button>
        )}
```

- [ ] **Step 7: Verify** — `pnpm vitest run tests/unit` ALL green (new: utils 2, view 3, machine updated); `pnpm typecheck` → 0; format all touched/created files.

- [ ] **Step 8: Commit**

```bash
git add src/lib/experience/machine.ts tests/unit/experience-machine.test.ts src/components/experience/counterpart-utils.ts tests/unit/counterpart-utils.test.ts src/components/experience/CounterpartView.tsx tests/unit/counterpart-view.test.tsx src/components/experience/Bento.tsx src/components/experience/Theater.tsx src/components/experience/CommandCenter.tsx
git commit -m "feat(experience): counterpart tile, focus view, theater step + header chip"
```

---

### Task 10: E2E extension + full verification sweep

**Files:**
- Modify: `tests/e2e/experience.spec.ts`

- [ ] **Step 1: Extend the golden path.** The fixture already carries the counterpart (Task 1). In the golden-path test, after the BLUF visibility assertion add:

```ts
    await expect(page.getByText("Alexandre Silveira").first()).toBeVisible();
```

and after the Sources-tab assertions add:

```ts
    await page.getByRole("tab", { name: /Counterpart/ }).click();
    await expect(page.getByText(/Government of Brazil/)).toBeVisible();
    await expect(page.getByText(/Identified as of/)).toBeVisible();
```

- [ ] **Step 2: Run e2e** — start `pnpm dev` in background, wait ready, `pnpm test:e2e --project=chromium` → ALL pass (13 tests; the golden path now also covers the counterpart surfaces). Kill the server. If the tab locator collides with the theater chip text, remember chips are NOT `role="tab"` — keep `getByRole("tab", …)`.

- [ ] **Step 3: Full sweep** — `pnpm typecheck` → 0; `pnpm vitest run` → all pass; `pnpm biome check` on every file this plan touched → clean; `git status --porcelain` → empty.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/experience.spec.ts
git commit -m "test(e2e): counterpart tile + focus view on the golden path"
```

---

## Execution handoff

Execute with **superpowers:subagent-driven-development**. Order is strict: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 (each builds on the previous; 7 can swap with 8 safely).

**After Plan B ships:** Plan C (focus-view content: Compare/Forecast/Trade/Profile + viz pack) → Plan D (chat responder) → Plan E (polish: voice, provenance badges, dedupe, AR dossier translation, SSE resume).
