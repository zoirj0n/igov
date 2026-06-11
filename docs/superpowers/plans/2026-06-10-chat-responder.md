# Chat Responder Implementation Plan (Plan D of the single-page redesign)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Free-text questions on the landing get real, cited, locally-generated answers — closing challenge capability ④ (AI search & conversation). "UAE vs Singapore smart cities" answers with a comparison card; "prepare me for Japan" routes straight into the prepare flow; weak grounding abstains honestly with a run-a-briefing CTA.

**Architecture:** REUSE, don't rebuild: the existing hardened RAG pipeline `runRag()` (`src/services/rag/orchestrator.ts` — intent, hybrid retrieval, citation validation, abstention, injection/PII safety, history threading) is the answer engine. New thin layer: (1) a deterministic intent triage (`prepare | compare | general`) with multi-country extraction — no LLM call needed for triage; (2) `POST /api/chat/ask` which routes prepare → client redirect payload, compare → deterministic comparison table + runRag answer, general → runRag; (3) a `ChatDock` under the sentence composer rendering answer cards (markdown + citation chips + comparison table + abstain CTA), threading the last turns.

**Accepted deviations from spec §5:** (a) plain JSON response instead of SSE token streaming — runRag is a single hardened call (validators run on the complete text); the dock shows a working shimmer instead. (b) No 3B intent-parse LLM call — deterministic triage is faster and more reliable, and all non-prepare/compare sub-intents (sector/policy/opportunity) flow through runRag identically anyway. (c) Chat-initiated prepare uses the standard composer flow (resolved country + current role slot) rather than passing the raw sentence as the agent command.

**Spec:** `docs/superpowers/specs/2026-06-10-single-page-experience-design.md` §5.

---

## Context primer

- Commands: `pnpm vitest run <file>`; `pnpm typecheck`; format ONLY your files (`pnpm biome check --write <paths>`); NEVER `pnpm lint:fix`.
- jsdom tests: `afterEach(cleanup)` + `vi.unstubAllGlobals()`; `<I18nProvider>` wrapper; explicit vitest imports.
- **Verified seams:**
  - `runRag(req: RagRequest): Promise<RagResult>` from `@/services/rag/orchestrator`. `RagRequest = { question, user: AuthUser, classification, sessionId?, reqId?, history?: {role:"user"|"assistant", content}[] }`. `RagResult = { answer: string|null, abstained, abstainReasons?, intent, citations: string[], passages, meta: {...}, ... }`. See `src/app/api/rag/route.ts` for a working call pattern (auth + classification resolution included).
  - `resolveCountryFromText(text): string | undefined` in `src/lib/data/iso-countries.ts` (single match: ISO3 token → alias → longest name). `ISO_COUNTRIES`, `iso3Name`, `flagForIso3` also exported. There is NO multi-country finder yet — Task 1 builds it.
  - `indicatorsByCountry(iso3): Indicator[]` (sync, live-overlay over seed) in `src/lib/data/indicators.ts`; `Indicator = { countryIso3, metric, value, unit, year, source, confidence, id? }`.
  - `MarkdownView({ text })` in `src/components/chat/MarkdownView.tsx`.
  - Landing structure: `src/components/experience/Landing.tsx` renders SentenceComposer then recent chips — the ChatDock mounts between them. Landing props end with `onOpenRun`; Experience assembles it.
  - Metric labels: `t.metrics[metricKey]`; the 6-metric compare set: `gdp_usd_nominal, gdp_growth_pct, renewables_share_pct, co2_per_capita_t, exports_usd, fdi_inflows_usd`.
  - `formatMetric(value, unit, locale)` from `@/utils/format` (used by CompareFocusView).
- The legacy `/chat` page and `/api/chat` + `/api/rag` routes stay untouched (additive endpoint `/api/chat/ask`).
- E2E: `pnpm dev` background; mock `/api/chat/ask`; kill server after.

---

### Task 1: Intent triage + multi-country extraction

**Files:**
- Create: `src/services/chat/intent.ts`
- Test: `tests/unit/chat-intent.test.ts`

- [ ] **Step 1: Failing test:**

```ts
import { describe, expect, it } from "vitest";
import { classifyAsk, resolveCountriesFromText } from "@/services/chat/intent";

describe("resolveCountriesFromText", () => {
  it("finds multiple countries in text order", () => {
    expect(resolveCountriesFromText("Compare UAE and Singapore on smart cities")).toEqual([
      "ARE",
      "SGP",
    ]);
    expect(resolveCountriesFromText("germany hydrogen cooperation with the uae")).toEqual([
      "DEU",
      "ARE",
    ]);
  });
  it("dedupes and caps at three", () => {
    expect(
      resolveCountriesFromText("UAE uae United Arab Emirates Brazil India Japan Korea"),
    ).toHaveLength(3);
  });
  it("returns empty when no country is named", () => {
    expect(resolveCountriesFromText("what is a smart city")).toEqual([]);
  });
});

describe("classifyAsk", () => {
  it("routes prepare phrasing to prepare with the country", () => {
    expect(classifyAsk("Prepare me for Japan")).toEqual({ kind: "prepare", countries: ["JPN"] });
    expect(classifyAsk("brief me on Indonesia's infrastructure")).toEqual({
      kind: "prepare",
      countries: ["IDN"],
    });
  });
  it("prepare phrasing WITHOUT a country falls back to general", () => {
    expect(classifyAsk("prepare me for the meeting").kind).toBe("general");
  });
  it("routes two-country questions to compare", () => {
    expect(classifyAsk("UAE vs Singapore smart cities")).toEqual({
      kind: "compare",
      countries: ["ARE", "SGP"],
    });
    expect(classifyAsk("Compare Germany and Japan on renewables")).toEqual({
      kind: "compare",
      countries: ["DEU", "JPN"],
    });
  });
  it("single-country analytical questions stay general", () => {
    expect(classifyAsk("UAE-Germany hydrogen collaboration policy").kind).toBe("compare");
    expect(classifyAsk("Indonesia infrastructure outlook")).toEqual({
      kind: "general",
      countries: ["IDN"],
    });
  });
});
```

Note the fifth test's first assertion: "UAE-Germany hydrogen collaboration policy" names TWO countries → `compare` (a comparison card alongside the answer is helpful there too). That is intended behavior: `compare` = two-or-more countries named AND not prepare-phrased.

- [ ] **Step 2: Run → FAIL. Step 3: Implement `src/services/chat/intent.ts`:**

```ts
/**
 * Deterministic triage for the landing ask box. No LLM call: prepare-phrasing
 * and country extraction are regex/dictionary work; everything else goes to
 * the RAG pipeline which does its own (deeper) intent handling.
 */
import { ISO_COUNTRIES, resolveCountryFromText } from "@/lib/data/iso-countries";

export type AskKind = "prepare" | "compare" | "general";

export interface AskTriage {
  kind: AskKind;
  countries: string[];
}

/** All countries named in the text, in first-appearance order, capped at 3. */
export function resolveCountriesFromText(text: string): string[] {
  const hay = ` ${text.toLowerCase()} `;
  const hits: { iso3: string; at: number }[] = [];

  // Longest-name-first so "United Arab Emirates" wins over partial overlaps.
  const byLen = [...ISO_COUNTRIES].sort((a, b) => b.name.length - a.name.length);
  for (const c of byLen) {
    const idx = hay.indexOf(` ${c.name.toLowerCase()}`);
    if (idx >= 0 && !hits.some((h) => h.iso3 === c.iso3)) hits.push({ iso3: c.iso3, at: idx });
  }
  // Aliases / ISO3 tokens via the existing single resolver, scanned per word
  // window so multiple short forms ("uae", "ksa", DEU) are all caught.
  const words = text.split(/[^A-Za-z]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const win = words.slice(i, i + 3).join(" ");
    const iso = resolveCountryFromText(win);
    if (iso && !hits.some((h) => h.iso3 === iso)) {
      hits.push({ iso3: iso, at: text.toLowerCase().indexOf((words[i] as string).toLowerCase()) });
    }
  }
  return hits
    .sort((a, b) => a.at - b.at)
    .slice(0, 3)
    .map((h) => h.iso3);
}

const PREPARE_RE = /\b(prepare me|brief me|prep me|get me ready|جهزني|جهّزني)\b/i;

export function classifyAsk(text: string): AskTriage {
  const countries = resolveCountriesFromText(text);
  if (PREPARE_RE.test(text) && countries.length > 0) {
    return { kind: "prepare", countries: [countries[0] as string] };
  }
  if (countries.length >= 2) return { kind: "compare", countries: countries.slice(0, 2) };
  return { kind: "general", countries };
}
```

- [ ] **Step 4: Run → PASS (5 tests / 10 assertions). If a specific fixture string resolves unexpectedly (alias quirks), debug with `resolveCountryFromText` on the failing window and adjust the SCAN (not the tests) — the test strings are the challenge guide's own examples and must pass as written. Full suite + typecheck. Format. Commit:**

```bash
git add src/services/chat/intent.ts tests/unit/chat-intent.test.ts
git commit -m "feat(chat): deterministic ask triage — prepare/compare/general + multi-country extraction"
```

---

### Task 2: `POST /api/chat/ask`

**Files:**
- Create: `src/services/chat/comparison.ts`
- Create: `src/app/api/chat/ask/route.ts`
- Test: `tests/unit/chat-comparison.test.ts`

- [ ] **Step 1: Comparison builder (TDD).** Failing test:

```ts
import { describe, expect, it } from "vitest";
import { buildComparison } from "@/services/chat/comparison";
import type { Indicator } from "@/types";

function ind(countryIso3: string, metric: string, value: number, year: number): Indicator {
  return {
    countryIso3,
    metric,
    value,
    year,
    unit: "USD",
    source: "World Bank",
    confidence: "high",
  } as Indicator;
}

describe("buildComparison", () => {
  it("aligns latest values for both countries across the compare set", () => {
    const byCountry = (iso3: string) =>
      iso3 === "ARE"
        ? [ind("ARE", "gdp_usd_nominal", 5.5e11, 2024), ind("ARE", "gdp_usd_nominal", 5.0e11, 2022)]
        : [ind("SGP", "gdp_usd_nominal", 5.3e11, 2024)];
    const cmp = buildComparison(["ARE", "SGP"], byCountry);
    expect(cmp.countries).toEqual([
      { iso3: "ARE", name: "United Arab Emirates" },
      { iso3: "SGP", name: "Singapore" },
    ]);
    const gdp = cmp.rows.find((r) => r.metric === "gdp_usd_nominal");
    expect(gdp?.a?.value).toBe(5.5e11);
    expect(gdp?.a?.year).toBe(2024);
    expect(gdp?.b?.value).toBe(5.3e11);
  });
  it("returns null cells for missing metrics and keeps all six rows", () => {
    const cmp = buildComparison(["ARE", "SGP"], () => []);
    expect(cmp.rows).toHaveLength(6);
    expect(cmp.rows.every((r) => r.a === null && r.b === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement `src/services/chat/comparison.ts`:**

```ts
import { indicatorsByCountry } from "@/lib/data/indicators";
import { iso3Name } from "@/lib/data/iso-countries";
import type { Indicator } from "@/types";

export const COMPARE_METRICS = [
  "gdp_usd_nominal",
  "gdp_growth_pct",
  "renewables_share_pct",
  "co2_per_capita_t",
  "exports_usd",
  "fdi_inflows_usd",
] as const;

export interface ComparisonCell {
  value: number;
  unit: string;
  year: number;
}

export interface ComparisonPayload {
  countries: { iso3: string; name: string }[];
  rows: { metric: string; a: ComparisonCell | null; b: ComparisonCell | null }[];
}

function latest(rows: Indicator[], metric: string): ComparisonCell | null {
  const hit = rows
    .filter((i) => i.metric === metric)
    .sort((x, y) => y.year - x.year)[0];
  return hit ? { value: hit.value, unit: hit.unit, year: hit.year } : null;
}

export function buildComparison(
  pair: [string, string] | string[],
  byCountry: (iso3: string) => Indicator[] = indicatorsByCountry,
): ComparisonPayload {
  const [a, b] = [pair[0] as string, pair[1] as string];
  const rowsA = byCountry(a);
  const rowsB = byCountry(b);
  return {
    countries: [
      { iso3: a, name: iso3Name(a) ?? a },
      { iso3: b, name: iso3Name(b) ?? b },
    ],
    rows: COMPARE_METRICS.map((metric) => ({
      metric,
      a: latest(rowsA, metric),
      b: latest(rowsB, metric),
    })),
  };
}
```

- [ ] **Step 4: Route.** Create `src/app/api/chat/ask/route.ts` — FIRST read `src/app/api/rag/route.ts` and mirror its auth + classification + user-shape handling exactly (it already calls `runRag` correctly); then:

```ts
import { getCurrentUser } from "@/lib/auth/server";
import { logAudit } from "@/services/audit";
import { classifyAsk } from "@/services/chat/intent";
import { buildComparison } from "@/services/chat/comparison";
import { runRag } from "@/services/rag/orchestrator";
import { resolveDefaultClassification } from "@/services/policy/resolver";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  question: z.string().min(2).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(12)
    .optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { question, history } = parsed.data;
  const classification = resolveDefaultClassification(user)?.value ?? "internal";
  const triage = classifyAsk(question);
  logAudit(user, "chat.ask", "chat", {
    classification,
    meta: { kind: triage.kind, q: question.slice(0, 120) },
  });

  if (triage.kind === "prepare") {
    return NextResponse.json({ kind: "prepare", iso3: triage.countries[0] });
  }

  const rag = await runRag({ question, user, classification, history });
  return NextResponse.json({
    kind: triage.kind,
    answer: rag.answer,
    abstained: rag.abstained,
    abstainReasons: rag.abstainReasons,
    citations: rag.citations,
    comparison: triage.kind === "compare" ? buildComparison(triage.countries) : undefined,
    suggestIso3: triage.countries[0],
  });
}
```

Adapt the `runRag` call to the REAL `RagRequest`/user types you find in `/api/rag/route.ts` (e.g. if it derives an `AuthUser` differently or passes `sessionId`/`reqId`) — behavior over verbatim. If `resolveDefaultClassification` has a different import path/signature than shown (check the agent run route, which uses it), mirror that.

- [ ] **Step 5: Gates** — comparison tests pass; FULL `pnpm vitest run tests/unit` green; `pnpm typecheck` → 0. Format. Commit:

```bash
git add src/services/chat/comparison.ts src/app/api/chat/ask/route.ts tests/unit/chat-comparison.test.ts
git commit -m "feat(api): /api/chat/ask — triage, runRag answers, comparison payload"
```

---

### Task 3: ChatDock component

**Files:**
- Modify: `src/lib/i18n/messages.ts` (add `chatDock` blocks EN/AR)
- Create: `src/components/experience/ChatDock.tsx`
- Test: `tests/unit/chat-dock.test.tsx`

- [ ] **Step 1: i18n.** EN `experience` gains:

```ts
      chatDock: {
        placeholder: "or ask anything — \"UAE vs Singapore smart cities\"",
        send: "Ask",
        thinking: "Consulting sovereign intelligence…",
        abstained: "Not enough grounded data to answer confidently.",
        runFull: "Run a full briefing instead",
        sources: "Sources",
        comparison: "Quick comparison",
        you: "You",
        advisor: "Advisor",
        error: "The advisor could not answer — try again.",
      },
```

AR mirror:

```ts
      chatDock: {
        placeholder: "أو اسأل أي شيء — \"الإمارات مقابل سنغافورة في المدن الذكية\"",
        send: "اسأل",
        thinking: "جارٍ استشارة الذكاء السيادي…",
        abstained: "لا تتوفر بيانات موثّقة كافية للإجابة بثقة.",
        runFull: "شغّل إحاطة كاملة بدلاً من ذلك",
        sources: "المصادر",
        comparison: "مقارنة سريعة",
        you: "أنت",
        advisor: "المستشار",
        error: "تعذّر على المستشار الإجابة — حاول مجددًا.",
      },
```

- [ ] **Step 2: Failing test** (`tests/unit/chat-dock.test.tsx`):

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/context";
import { ChatDock } from "@/components/experience/ChatDock";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(onPrepare = vi.fn()) {
  const utils = render(
    <I18nProvider>
      <ChatDock onPrepare={onPrepare} />
    </I18nProvider>,
  );
  const input = utils.getByRole("textbox");
  return { ...utils, input, onPrepare };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("ChatDock", () => {
  it("asks and renders a cited answer card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          kind: "general",
          answer: "Indonesia's grid is **expanding**.",
          abstained: false,
          citations: ["World Bank 2024", "IEA 2025"],
        }),
      ),
    );
    const { input, getByText } = show();
    fireEvent.change(input, { target: { value: "Indonesia infrastructure" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => {
      expect(getByText(/expanding/)).toBeTruthy();
      expect(getByText("World Bank 2024")).toBeTruthy();
    });
  });

  it("renders the comparison table for compare answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          kind: "compare",
          answer: "Both lead regionally.",
          abstained: false,
          citations: [],
          comparison: {
            countries: [
              { iso3: "ARE", name: "United Arab Emirates" },
              { iso3: "SGP", name: "Singapore" },
            ],
            rows: [
              {
                metric: "gdp_usd_nominal",
                a: { value: 5.5e11, unit: "USD", year: 2024 },
                b: { value: 5.3e11, unit: "USD", year: 2024 },
              },
            ],
          },
        }),
      ),
    );
    const { input, getByText } = show();
    fireEvent.change(input, { target: { value: "UAE vs Singapore" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => {
      expect(getByText("Singapore")).toBeTruthy();
      expect(getByText(/Quick comparison/i)).toBeTruthy();
    });
  });

  it("abstains with a run-full-briefing CTA wired to onPrepare", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          kind: "general",
          answer: null,
          abstained: true,
          citations: [],
          suggestIso3: "MAR",
        }),
      ),
    );
    const { input, getByText, onPrepare } = show();
    fireEvent.change(input, { target: { value: "Morocco solar exports" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(getByText(/Not enough grounded data/i)).toBeTruthy());
    fireEvent.click(getByText(/Run a full briefing/i));
    expect(onPrepare).toHaveBeenCalledWith("MAR");
  });

  it("prepare responses call onPrepare immediately", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ kind: "prepare", iso3: "JPN" })),
    );
    const { input, onPrepare } = show();
    fireEvent.change(input, { target: { value: "prepare me for Japan" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith("JPN"));
  });
});
```

- [ ] **Step 3: Run → FAIL. Step 4: Implement** `src/components/experience/ChatDock.tsx`:

```tsx
"use client";

import { MarkdownView } from "@/components/chat/MarkdownView";
import { useI18n } from "@/lib/i18n/context";
import { formatMetric } from "@/utils/format";
import { useRef, useState } from "react";

interface ComparisonCell {
  value: number;
  unit: string;
  year: number;
}
interface AskResponse {
  kind: "prepare" | "compare" | "general";
  iso3?: string;
  answer?: string | null;
  abstained?: boolean;
  citations?: string[];
  suggestIso3?: string;
  comparison?: {
    countries: { iso3: string; name: string }[];
    rows: { metric: string; a: ComparisonCell | null; b: ComparisonCell | null }[];
  };
}
interface Turn {
  q: string;
  res?: AskResponse;
  error?: boolean;
}

export function ChatDock({ onPrepare }: { onPrepare: (iso3: string) => void }) {
  const { t, locale } = useI18n();
  const x = t.experience.chatDock;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  async function ask(q: string) {
    setBusy(true);
    setTurns((ts) => [...ts, { q }]);
    try {
      const res = await fetch("/api/chat/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, history: historyRef.current.slice(-6) }),
      });
      if (!res.ok) throw new Error(`ask failed (${res.status})`);
      const data = (await res.json()) as AskResponse;
      if (data.kind === "prepare" && data.iso3) {
        setTurns((ts) => ts.slice(0, -1));
        onPrepare(data.iso3);
        return;
      }
      historyRef.current.push({ role: "user", content: q });
      if (data.answer) historyRef.current.push({ role: "assistant", content: data.answer });
      setTurns((ts) => [...ts.slice(0, -1), { q, res: data }]);
    } catch {
      setTurns((ts) => [...ts.slice(0, -1), { q, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = value.trim();
          if (q.length < 2 || busy) return;
          setValue("");
          void ask(q);
        }}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-1.5 backdrop-blur"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={x.placeholder}
          aria-label={x.placeholder}
          className="flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || value.trim().length < 2}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-tamm-cyan transition hover:bg-white/15 disabled:opacity-40"
        >
          {x.send}
        </button>
      </form>

      <div className="mt-3 space-y-3">
        {turns.map((turn, i) => (
          <div
            key={`${i}-${turn.q}`}
            className="animate-in rounded-xl border border-white/10 bg-[#0c0c15]/90 p-4 text-start"
          >
            <p className="text-2xs uppercase tracking-wide text-white/35">
              {x.you} · <span className="normal-case text-white/60">{turn.q}</span>
            </p>
            <div className="mt-2">
              {!turn.res && !turn.error && (
                <p className="flex items-center gap-2 text-sm text-tamm-cyan">
                  <span className="h-2 w-2 animate-ping rounded-full bg-tamm-cyan" aria-hidden />
                  {x.thinking}
                </p>
              )}
              {turn.error && <p className="text-sm text-signal-risk">{x.error}</p>}
              {turn.res?.abstained && (
                <div className="space-y-2">
                  <p className="text-sm text-tamm-olive">⚠ {x.abstained}</p>
                  {turn.res.suggestIso3 && (
                    <button
                      type="button"
                      onClick={() => onPrepare(turn.res?.suggestIso3 as string)}
                      className="rounded-lg border border-tamm-cyan/40 px-3 py-1.5 text-sm font-medium text-tamm-cyan transition hover:bg-tamm-cyan/10"
                    >
                      {x.runFull} →
                    </button>
                  )}
                </div>
              )}
              {turn.res?.answer && !turn.res.abstained && (
                <div className="text-sm text-ink-800 [&_*]:text-white/85">
                  <MarkdownView text={turn.res.answer} />
                </div>
              )}
              {turn.res?.comparison && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
                  <p className="border-b border-white/10 px-3 py-1.5 text-2xs uppercase tracking-wide text-white/40">
                    {x.comparison}
                  </p>
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-white/45">
                        <th className="px-3 py-1.5 text-start font-normal">{}</th>
                        {turn.res.comparison.countries.map((c) => (
                          <th key={c.iso3} className="px-3 py-1.5 text-start font-semibold text-white/75">
                            {c.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {turn.res.comparison.rows
                        .filter((r) => r.a || r.b)
                        .map((r) => (
                          <tr key={r.metric} className="border-t border-white/5">
                            <td className="px-3 py-1.5 text-white/50">
                              {t.metrics[r.metric as keyof typeof t.metrics] ?? r.metric}
                            </td>
                            {[r.a, r.b].map((cell, ci) => (
                              <td key={`${r.metric}-${ci === 0 ? "a" : "b"}`} className="px-3 py-1.5 tabular text-white/85">
                                {cell ? (
                                  <span>
                                    {formatMetric(cell.value, cell.unit, locale)}{" "}
                                    <span className="text-white/30">·{cell.year}</span>
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              {turn.res?.citations && turn.res.citations.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-2xs uppercase tracking-wide text-white/35">
                    {x.sources}:
                  </span>
                  {turn.res.citations.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-white/10 px-2 py-0.5 text-2xs text-white/55"
                    >
                      {c}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

(Adapt `t.metrics[...]` typing if the catalog's metric keys type complains — a `Record<string,string>` cast at the lookup site is acceptable.)

- [ ] **Step 5: Run → PASS (4). Full suite; typecheck; format. Commit:**

```bash
git add src/components/experience/ChatDock.tsx src/lib/i18n/messages.ts tests/unit/chat-dock.test.tsx
git commit -m "feat(experience): ChatDock — cited answers, comparison card, abstain CTA"
```

---

### Task 4: Landing + Experience wiring

**Files:**
- Modify: `src/components/experience/Landing.tsx`
- Modify: `src/components/experience/Experience.tsx`

- [ ] **Step 1: Landing.** Add `onAskPrepare: (iso3: string) => void` to Landing's props and render `<ChatDock onPrepare={onAskPrepare} />` directly AFTER the SentenceComposer block (before the recent chips). Import ChatDock.

- [ ] **Step 2: Experience.** Pass the handler where Landing is rendered:

```tsx
onAskPrepare={(iso3) => {
  dispatch({
    type: "SELECT_COUNTRY",
    country: { iso3, name: iso3Name(iso3) ?? iso3, flag: flagForIso3(iso3) },
  });
  beginFor(iso3);
}}
```

Check how `begin()` currently reads the selected country (it closes over machine state which won't have updated yet within the same handler). If `begin()` derives the command from `s.country`, add a small `beginFor(iso3: string)` variant that builds the command from the passed iso3 (`commandFor(iso3Name(iso3) ?? iso3, s.role)`) and dispatches `BEGIN` + starts the run — mirroring `begin()` exactly otherwise. Report which shape you used. `iso3Name`/`flagForIso3` are already imported in Experience (verify; add if not).

- [ ] **Step 3: Manual + gates.** `pnpm vitest run tests/unit` green (Landing's existing component test must still pass — if it asserts on child count/structure, update it for the new dock); `pnpm typecheck` → 0. Format. Commit:

```bash
git add src/components/experience/Landing.tsx src/components/experience/Experience.tsx
git commit -m "feat(experience): chat dock on the landing — ask anything, prepare redirect"
```

---

### Task 5: E2E + sweep

**Files:**
- Modify: `tests/e2e/experience.spec.ts`

- [ ] **Step 1: Mock + new test.** Add to the spec a new test "ask anything answers with citations and prepare redirects":

```ts
  test("ask anything answers with citations; prepare phrasing redirects to the run flow", async ({
    page,
  }) => {
    await login(page);
    await mockRunApis(page);
    await page.route("**/api/chat/ask", async (route) => {
      const body = route.request().postDataJSON() as { question: string };
      if (/prepare me/i.test(body.question)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ kind: "prepare", iso3: "BRA" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "general",
          answer: "Indonesia's infrastructure pipeline is **substantial**.",
          abstained: false,
          citations: ["World Bank 2024"],
        }),
      });
    });

    await page.goto("/");
    const ask = page.getByPlaceholder(/or ask anything/i);
    await ask.fill("Indonesia infrastructure");
    await ask.press("Enter");
    await expect(page.getByText(/substantial/)).toBeVisible();
    await expect(page.getByText("World Bank 2024")).toBeVisible();

    await ask.fill("prepare me for Brazil");
    await ask.press("Enter");
    await expect(page.getByText(/Research counterpart|Agents working/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
```

Adapt the final assertion to whatever the theater reliably shows with the existing mocked agent SSE (the golden-path test already proves that flow — reuse its wait pattern). The `login`/`mockRunApis` helpers exist in the spec — reuse, do not duplicate.

- [ ] **Step 2: Run** — dev server up → `pnpm test:e2e --project=chromium` → ALL pass (14 now). Kill server.

- [ ] **Step 3: Full sweep** — `pnpm typecheck` → 0; `pnpm vitest run` all green; biome on the spec; porcelain empty.

- [ ] **Step 4: Commit:**

```bash
git add tests/e2e/experience.spec.ts
git commit -m "test(e2e): chat dock — cited answer + prepare redirect"
```

---

## Execution handoff

Execute with **superpowers:subagent-driven-development**, strict order 1 → 5.

**After Plan D ships:** Plan E (polish — voice, provenance badges, AR dossier translation, hook dedupe, SSE resume, demo script + feasibility docs).
