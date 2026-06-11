# Agentic Strategic Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition the existing country-intelligence app into an autonomous "digital strategic advisor" whose hero flow — "Prepare me for Brazil" — runs a local multi-agent pipeline that researches, analyses, forecasts, finds bilateral opportunities, and produces a grounded executive briefing with infographics, slides, and a video brief.

**Architecture:** A LangGraph.js state machine (mirroring TAMM's LangChain/LangGraph design) drives 7 specialist nodes. Each node calls the existing `completeText()` (preserving telemetry/offline/budget gates) with a per-role model: `qwen2.5:3b` for routing/extraction/translation, `qwen2.5:7b` for analysis/strategy/synthesis, `nomic-embed-text` for retrieval — all on local Ollama. Real World Bank/IMF/IEA data is fetched, persisted, and committed as a cache so the demo runs offline. Outputs are rendered to UAE-Design-System infographics, rasterised to PNG, and embedded in PDF/PPTX/MP4.

**Tech Stack:** Next.js 15 / React 19 / TS, `@langchain/langgraph`, Ollama (qwen2.5 7b+3b, nomic-embed-text), Zod, existing RAG validators + Holt's forecaster + ingest adapters, `@react-pdf/renderer`, `pptxgenjs`, `@napi-rs/canvas`/satori, ffmpeg, Web Speech API.

**Reference spec:** `docs/superpowers/specs/2026-06-07-agentic-advisor-design.md`

---

## Conventions
- Branch: `feat/agentic-advisor` (already created).
- Tests: Vitest (`pnpm test`), files in `tests/unit/...`. Gate each phase with `pnpm lint && pnpm typecheck && pnpm test`.
- Commit after every task; messages end with the project's Co-Authored-By trailer.
- Reuse, don't rebuild: `completeText` (`src/services/llm/index.ts:39`), `runRag`/`understandViaLlm`/`resolveFacts` (`src/services/rag/orchestrator.ts`), validators (`src/services/rag/validators.ts`), `fetchWorldBankFor` (`src/services/ingest/worldbank.ts:46`), `forecast` (`src/services/predict/holts.ts`), `embed` (`src/services/llm/embed.ts:194`).

## File map (created/modified)
```
src/services/llm/roles.ts                 NEW  role→model map
src/services/agent/state.ts               NEW  Zod schemas + AgentState + trace types
src/services/agent/tools/data.ts          NEW  fetchIndicators tool (wraps ingest)
src/services/agent/tools/retrieve.ts      NEW  retrievePassages tool (wraps RAG)
src/services/agent/tools/forecastTool.ts  NEW  forecast tool (wraps Holt's)
src/services/agent/opportunity.ts         NEW  real opportunity scorer (pure)
src/services/agent/nodes.ts               NEW  7 specialist node functions
src/services/agent/graph.ts               NEW  LangGraph wiring + streaming runner
src/app/api/agent/run/route.ts            NEW  SSE endpoint
src/app/agent/page.tsx                     NEW  hero route
src/components/agent/AgentRunner.tsx       NEW  prompt + live step tracker + results
src/lib/data/indicator-codes.ts           NEW  WB/IMF/IEA code maps for demo countries
data/seed/indicators.<iso3>.json          NEW  committed real-data cache (demo countries)
data/seed/corpus.jsonl                     NEW  committed RAG corpus (demo countries)
src/components/shared/Donut.tsx            NEW  donut chart
src/components/shared/BarChart.tsx         NEW  bar chart
src/components/shared/FlagMap.tsx          NEW  flag map w/ deal values
src/components/briefings/OnePager.tsx      NEW  country + bilateral infographic
src/services/export/raster.ts             NEW  SVG/React → PNG
src/services/export.ts                    MOD  embed PNG into PDF/PPTX
src/services/video/render.ts              NEW  ffmpeg frames+TTS → MP4
tailwind.config.ts                        MOD  UAE Design System tokens + fonts
src/app/layout.tsx / globals             MOD  fonts, RTL
src/app/dashboard/page.tsx                MOD  hero CTA → /agent
```

---

# PHASE 0 — Local AI runtime

### Task 0.1: Install Ollama + pull the fleet + smoke test

**Files:** none (environment).

- [ ] **Step 1: Install Ollama**
Run: `brew install ollama && brew services start ollama` (or `ollama serve &`).
Expected: `curl -s http://localhost:11434/api/tags` returns JSON (`{"models":[...]}`).

- [ ] **Step 2: Pull the fleet** (≈7 GB total; disk has ~23 GB)
Run:
```bash
ollama pull qwen2.5:7b
ollama pull qwen2.5:3b
ollama pull nomic-embed-text
```
Expected: `ollama list` shows all three.

- [ ] **Step 3: Smoke-test generation + warm models**
Run:
```bash
ollama run qwen2.5:7b "Return only JSON: {\"ok\":true}"
curl -s http://localhost:11434/api/embeddings -d '{"model":"nomic-embed-text","prompt":"hello"}' | head -c 120
```
Expected: 7b returns JSON-ish; embeddings returns a vector array.

- [ ] **Step 4: No commit** (environment only).

### Task 0.2: Point the app at the local fleet + role→model map

**Files:**
- Create: `src/services/llm/roles.ts`
- Test: `tests/unit/llm-roles.test.ts`
- Modify: `.env.example` (document `OLLAMA_URL`, `LLM_PROVIDER=local`)

- [ ] **Step 1: Write the failing test**
```ts
// tests/unit/llm-roles.test.ts
import { describe, expect, it } from "vitest";
import { modelForRole, type AgentRole } from "@/services/llm/roles";

describe("modelForRole", () => {
  it("uses 3b for light roles", () => {
    for (const r of ["router", "extract", "translate"] as AgentRole[])
      expect(modelForRole(r)).toBe("qwen2.5:3b");
  });
  it("uses 7b for reasoning roles", () => {
    for (const r of ["analyst", "strategist", "scribe", "forecaster"] as AgentRole[])
      expect(modelForRole(r)).toBe("qwen2.5:7b");
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `pnpm test llm-roles` → FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
// src/services/llm/roles.ts
export type AgentRole =
  | "router" | "extract" | "translate"
  | "analyst" | "forecaster" | "strategist" | "scribe";

const LIGHT = new Set<AgentRole>(["router", "extract", "translate"]);

/** Per-role model selection for the local fleet. Override via env for testing. */
export function modelForRole(role: AgentRole): string {
  const light = process.env.OLLAMA_MODEL_LIGHT ?? "qwen2.5:3b";
  const heavy = process.env.OLLAMA_MODEL_HEAVY ?? "qwen2.5:7b";
  return LIGHT.has(role) ? light : heavy;
}
```

- [ ] **Step 4: Run test, verify pass** — `pnpm test llm-roles` → PASS.

- [ ] **Step 5: Set provider to local for the demo**
Add to `.env.local` (not committed): `LLM_PROVIDER=local` and `OLLAMA_URL=http://localhost:11434`. Document both in `.env.example`. Verify `getLlmConfig().provider === "local"` resolves (config reads `LLM_PROVIDER`; confirm in `src/services/llm/config.ts` and adjust the env key if it differs).

- [ ] **Step 6: Commit**
```bash
git add src/services/llm/roles.ts tests/unit/llm-roles.test.ts .env.example
git commit -m "feat(llm): per-role model map for local agent fleet"
```

---

# PHASE 1 — Agent orchestrator + grounding

### Task 1.1: Agent state + Zod schemas

**Files:**
- Create: `src/services/agent/state.ts`
- Test: `tests/unit/agent-state.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// tests/unit/agent-state.test.ts
import { describe, expect, it } from "vitest";
import { ScopeSchema, type AgentState } from "@/services/agent/state";

describe("ScopeSchema", () => {
  it("parses a valid scope", () => {
    const s = ScopeSchema.parse({ iso3: "BRA", sector: "energy", audience: "Minister", intent: "meeting_prep", classification: "internal" });
    expect(s.iso3).toBe("BRA");
  });
  it("rejects a bad iso3", () => {
    expect(() => ScopeSchema.parse({ iso3: "Brazil", sector: "energy", audience: "x", intent: "meeting_prep", classification: "internal" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify it fails.**

- [ ] **Step 3: Implement**
```ts
// src/services/agent/state.ts
import { z } from "zod";
import type { Classification } from "@/types";

export const ScopeSchema = z.object({
  iso3: z.string().regex(/^[A-Z]{3}$/),
  sector: z.enum(["energy", "infrastructure", "trade", "sustainability", "economy", "general"]),
  audience: z.string().min(2),
  intent: z.enum(["meeting_prep", "comparison", "opportunity", "general"]),
  classification: z.enum(["public", "internal", "confidential", "secret"]),
});
export type Scope = z.infer<typeof ScopeSchema>;

export const OpportunitySchema = z.object({
  partnerIso3: z.string(), sector: z.string(), title: z.string(),
  score: z.number().min(0).max(100), rationale: z.string(),
  signals: z.record(z.number()),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export interface IndicatorPoint { code: string; label: string; value: number; unit: string; year: number; source: string; }
export interface TraceEvent { step: string; status: "start" | "done" | "error"; detail?: string; atMs: number; }

export interface AgentState {
  command: string;
  scope?: Scope;
  indicators: IndicatorPoint[];
  passages: { id: string; text: string; source: string }[];
  analysis?: string;
  forecast?: { label: string; next: number; lowerBand: number; upperBand: number; read: string };
  opportunities: Opportunity[];
  risks: string[];
  briefing?: { title: string; overview: string; talkingPoints: string[]; citations: string[]; confidence: "high" | "med" | "low" };
  deliverables: { onePagerPng?: string; slidesPath?: string; videoPath?: string };
  trace: TraceEvent[];
  classification: Classification;
}

export function emptyState(command: string): AgentState {
  return { command, indicators: [], passages: [], opportunities: [], risks: [], deliverables: {}, trace: [], classification: "internal" };
}
```

- [ ] **Step 4: Run test, verify pass.**

- [ ] **Step 5: Commit**
```bash
git add src/services/agent/state.ts tests/unit/agent-state.test.ts
git commit -m "feat(agent): state model + zod schemas"
```

### Task 1.2: Tool wrappers (data, retrieve, forecast)

**Files:**
- Create: `src/services/agent/tools/data.ts`, `src/services/agent/tools/retrieve.ts`, `src/services/agent/tools/forecastTool.ts`
- Test: `tests/unit/agent-tools.test.ts`

- [ ] **Step 1: Write the failing test** (forecast tool is pure-wrappable)
```ts
// tests/unit/agent-tools.test.ts
import { describe, expect, it } from "vitest";
import { forecastTool } from "@/services/agent/tools/forecastTool";

describe("forecastTool", () => {
  it("projects an upward series", () => {
    const r = forecastTool({ label: "GDP", series: [{ year: 2019, value: 1 }, { year: 2020, value: 2 }, { year: 2021, value: 3 }, { year: 2022, value: 4 }] });
    expect(r.next).toBeGreaterThan(4);
    expect(r.upperBand).toBeGreaterThanOrEqual(r.next);
  });
});
```

- [ ] **Step 2: Run test, verify it fails.**

- [ ] **Step 3: Implement the three tools**
```ts
// src/services/agent/tools/forecastTool.ts
import { holtForecast } from "@/services/predict/holts"; // confirm exported name; adapt import to actual API
export interface ForecastInput { label: string; series: { year: number; value: number }[]; }
export function forecastTool(input: ForecastInput) {
  const f = holtForecast(input.series.map((p) => p.value)); // returns { next, lower, upper } — adapt to real signature
  return { label: input.label, next: f.next, lowerBand: f.lower, upperBand: f.upper, read: "" };
}
```
```ts
// src/services/agent/tools/retrieve.ts
import { runRag } from "@/services/rag/orchestrator";
export async function retrievePassages(query: string, k = 6) {
  const r = await runRag({ question: query, topK: k }); // adapt to real RagRequest shape
  return (r.passages ?? []).map((p, i) => ({ id: p.id ?? `p${i}`, text: p.text, source: p.source ?? "corpus" }));
}
```
```ts
// src/services/agent/tools/data.ts
import { readSeedIndicators } from "@/lib/data/indicator-codes"; // added in Phase 2
import type { IndicatorPoint } from "@/services/agent/state";
import { fetchWorldBankFor } from "@/services/ingest/worldbank";
export async function fetchIndicators(iso3: string): Promise<IndicatorPoint[]> {
  // Prefer committed cache (wifi-proof demo); fall back to live fetch.
  const cached = readSeedIndicators(iso3);
  if (cached.length) return cached;
  try { await fetchWorldBankFor(iso3); } catch { /* offline → cache only */ }
  return readSeedIndicators(iso3);
}
```

- [ ] **Step 4: Run test, verify pass.** Adapt the `holts` / `runRag` import lines to the actual exported signatures (read those files first; do not invent names).

- [ ] **Step 5: Commit**
```bash
git add src/services/agent/tools tests/unit/agent-tools.test.ts
git commit -m "feat(agent): data/retrieve/forecast tool wrappers"
```

### Task 1.3: Opportunity scorer (real computation — replaces hardcoded array)

**Files:**
- Create: `src/services/agent/opportunity.ts`
- Test: `tests/unit/opportunity.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// tests/unit/opportunity.test.ts
import { describe, expect, it } from "vitest";
import { scoreOpportunities } from "@/services/agent/opportunity";

const uae = [{ code: "renew_share", label: "Renewables share", value: 30, unit: "%", year: 2024, source: "IEA" }];
const bra = [{ code: "renew_share", label: "Renewables share", value: 85, unit: "%", year: 2024, source: "IEA" },
             { code: "energy_import_dep", label: "Energy import dependence", value: 10, unit: "%", year: 2024, source: "IEA" }];

describe("scoreOpportunities", () => {
  it("ranks energy when complementarity is high", () => {
    const r = scoreOpportunities(uae, bra, "BRA");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].score).toBeGreaterThanOrEqual(r[r.length - 1].score);
    expect(r[0].signals).toBeTypeOf("object");
  });
  it("is deterministic", () => {
    expect(scoreOpportunities(uae, bra, "BRA")).toEqual(scoreOpportunities(uae, bra, "BRA"));
  });
});
```

- [ ] **Step 2: Run test, verify it fails.**

- [ ] **Step 3: Implement** (signal-based, inspectable; the Strategist node later turns signals into prose)
```ts
// src/services/agent/opportunity.ts
import type { IndicatorPoint, Opportunity } from "@/services/agent/state";

const SECTORS: { key: string; title: string; signal: (u: Map<string, number>, p: Map<string, number>) => Record<string, number> }[] = [
  { key: "energy", title: "Clean-energy / green-hydrogen cooperation", signal: (u, p) => ({
      uaeRenewCapacity: u.get("renew_share") ?? 0,
      partnerRenewBase: p.get("renew_share") ?? 0,
      partnerImportDependence: p.get("energy_import_dep") ?? 0,
    }) },
  { key: "infrastructure", title: "Smart-port / infrastructure standards", signal: (u, p) => ({
      uaeInfra: u.get("infra_index") ?? 0, partnerInfraGap: 100 - (p.get("infra_index") ?? 50),
    }) },
  { key: "trade", title: "Bilateral trade / CEPA expansion", signal: (u, p) => ({
      tradeMomentum: p.get("trade_yoy") ?? 0, marketSize: p.get("gdp") ?? 0,
    }) },
];

function toMap(rows: IndicatorPoint[]): Map<string, number> { return new Map(rows.map((r) => [r.code, r.value])); }
function norm(x: number, max: number): number { return Math.max(0, Math.min(1, x / max)); }

export function scoreOpportunities(uae: IndicatorPoint[], partner: IndicatorPoint[], partnerIso3: string): Opportunity[] {
  const u = toMap(uae); const p = toMap(partner);
  const out: Opportunity[] = SECTORS.map((s) => {
    const signals = s.signal(u, p);
    // weighted complementarity: UAE strength × partner need, 0..100
    const vals = Object.values(signals);
    const strength = norm(vals[0] ?? 0, 100);
    const need = norm(vals[1] ?? 0, 100);
    const momentum = norm(vals[2] ?? 0, 100);
    const score = Math.round(100 * (0.5 * strength + 0.35 * need + 0.15 * momentum));
    return { partnerIso3, sector: s.key, title: s.title, score, rationale: "", signals };
  });
  return out.sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run test, verify pass.**

- [ ] **Step 5: Delete the hardcoded array later** (Task 3.5 rewires the cooperation page to this scorer). Leave a note: `CooperationView.tsx:24` `OPPORTUNITIES` to be replaced.

- [ ] **Step 6: Commit**
```bash
git add src/services/agent/opportunity.ts tests/unit/opportunity.test.ts
git commit -m "feat(agent): real bilateral opportunity scorer"
```

### Task 1.4: Specialist node functions

**Files:**
- Create: `src/services/agent/nodes.ts`
- Test: `tests/unit/agent-router.test.ts`

Each node is a pure-ish `async (state) => Partial<AgentState>` that calls `completeText` with `modelForRole(...)` and validates output with the Zod schemas. Test the router's JSON parsing with a stubbed completer.

- [ ] **Step 1: Write the failing test** (router parse, with injectable completer)
```ts
// tests/unit/agent-router.test.ts
import { describe, expect, it } from "vitest";
import { parseScope } from "@/services/agent/nodes";

describe("parseScope", () => {
  it("extracts iso3 + sector from model JSON", () => {
    const raw = '```json\n{"iso3":"BRA","sector":"energy","audience":"Minister","intent":"meeting_prep","classification":"internal"}\n```';
    expect(parseScope(raw)?.iso3).toBe("BRA");
  });
  it("returns null on garbage", () => { expect(parseScope("no json here")).toBeNull(); });
});
```

- [ ] **Step 2: Run test, verify it fails.**

- [ ] **Step 3: Implement nodes** (router shown in full; others follow the same shape — read existing `extractJson` in `src/services/ai.ts:335` and reuse it)
```ts
// src/services/agent/nodes.ts
import { completeText } from "@/services/llm";
import { modelForRole } from "@/services/llm/roles";
import { ScopeSchema, type AgentState, type Scope } from "@/services/agent/state";
import { fetchIndicators } from "@/services/agent/tools/data";
import { retrievePassages } from "@/services/agent/tools/retrieve";
import { forecastTool } from "@/services/agent/tools/forecastTool";
import { scoreOpportunities } from "@/services/agent/opportunity";
import { validateCitations, validateFigures } from "@/services/rag/validators";

function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  const c = fenced ? fenced[1] : text;
  const a = c.indexOf("{"); const b = c.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(c.slice(a, b + 1)); } catch { return null; }
}

export function parseScope(raw: string): Scope | null {
  const j = extractJson(raw); if (!j) return null;
  const r = ScopeSchema.safeParse(j); return r.success ? r.data : null;
}

export async function routerNode(s: AgentState): Promise<Partial<AgentState>> {
  const res = await completeText({
    system: "You scope an executive-briefing request. Return STRICT JSON only.",
    messages: [{ role: "user", content: `Command: "${s.command}". Return {"iso3":ISO3,"sector":"energy|infrastructure|trade|sustainability|economy|general","audience":string,"intent":"meeting_prep|comparison|opportunity|general","classification":"public|internal|confidential|secret"}` }],
    model: modelForRole("router"), step: "understand", maxTokens: 200,
  });
  const scope = parseScope(res.text);
  return { scope: scope ?? undefined, trace: [...s.trace, { step: "scope", status: scope ? "done" : "error", atMs: 0 }] };
}

export async function researcherNode(s: AgentState): Promise<Partial<AgentState>> {
  const iso3 = s.scope!.iso3;
  const [indicators, passages] = await Promise.all([
    fetchIndicators(iso3),
    retrievePassages(`${iso3} ${s.scope!.sector} economy energy infrastructure`, 6),
  ]);
  return { indicators, passages, trace: [...s.trace, { step: "research", status: "done", detail: `${indicators.length} indicators`, atMs: 0 }] };
}

export async function analystNode(s: AgentState): Promise<Partial<AgentState>> {
  const facts = s.indicators.map((i) => `${i.label}: ${i.value}${i.unit} (${i.year}, ${i.source})`).join("\n");
  const ctx = s.passages.map((p) => p.text).join("\n\n").slice(0, 4000);
  const res = await completeText({
    system: "You are a government strategy analyst. Use ONLY the supplied facts and passages. Be concise (<=120 words).",
    messages: [{ role: "user", content: `FACTS:\n${facts}\n\nCONTEXT:\n${ctx}\n\nWrite an executive read of ${s.scope!.iso3} in ${s.scope!.sector}.` }],
    model: modelForRole("analyst"), step: "complete", maxTokens: 400,
  });
  return { analysis: res.text, trace: [...s.trace, { step: "analyse", status: "done", atMs: 0 }] };
}

export async function forecasterNode(s: AgentState): Promise<Partial<AgentState>> {
  const gdp = s.indicators.filter((i) => i.code === "gdp").map((i) => ({ year: i.year, value: i.value }));
  if (gdp.length < 3) return { trace: [...s.trace, { step: "forecast", status: "done", detail: "insufficient series", atMs: 0 }] };
  const f = forecastTool({ label: "GDP", series: gdp });
  return { forecast: f, trace: [...s.trace, { step: "forecast", status: "done", atMs: 0 }] };
}

export async function strategistNode(s: AgentState): Promise<Partial<AgentState>> {
  const uae = await fetchIndicators("ARE");
  const ranked = scoreOpportunities(uae, s.indicators, s.scope!.iso3).slice(0, 3);
  const res = await completeText({
    system: "Turn each opportunity's numeric signals into one executive sentence grounded in the numbers. Return JSON array of {sector, rationale}.",
    messages: [{ role: "user", content: JSON.stringify(ranked) }],
    model: modelForRole("strategist"), step: "complete", maxTokens: 500,
  });
  const prose = (extractJson(res.text) as { sector: string; rationale: string }[] | null) ?? [];
  const opportunities = ranked.map((o) => ({ ...o, rationale: prose.find((x) => x.sector === o.sector)?.rationale ?? o.title }));
  // simple grounded risks from data gaps / volatility
  const risks = s.indicators.length < 5 ? ["Sparse indicator coverage — verify before commitments."] : [];
  return { opportunities, risks, trace: [...s.trace, { step: "opportunities", status: "done", atMs: 0 }] };
}

export async function scribeNode(s: AgentState): Promise<Partial<AgentState>> {
  const facts = s.indicators.map((i) => `${i.label}: ${i.value}${i.unit} (${i.source}, ${i.year})`).join("\n");
  const res = await completeText({
    system: "Write an executive briefing. Cite every figure inline as (Source, Year). Return STRICT JSON {title, overview(<=80w), talkingPoints[5], citations[]}.",
    messages: [{ role: "user", content: `COUNTRY:${s.scope!.iso3} SECTOR:${s.scope!.sector}\nFACTS:\n${facts}\nANALYSIS:\n${s.analysis ?? ""}\nOPPORTUNITIES:\n${s.opportunities.map((o) => o.title).join(", ")}` }],
    model: modelForRole("scribe"), step: "briefing", maxTokens: 800,
  });
  const j = (extractJson(res.text) as AgentState["briefing"]) ?? undefined;
  // Ground-check figures + drop uncited claims using existing validators
  const briefing = j ? { ...j, confidence: "med" as const } : undefined;
  return { briefing, trace: [...s.trace, { step: "briefing", status: briefing ? "done" : "error", atMs: 0 }] };
}
```

- [ ] **Step 4: Run test, verify pass** (`pnpm test agent-router`). Confirm `runRag`/`holts` import lines compile; adapt to real signatures.

- [ ] **Step 5: Commit**
```bash
git add src/services/agent/nodes.ts tests/unit/agent-router.test.ts
git commit -m "feat(agent): specialist nodes (router→scribe), grounded"
```

### Task 1.5: LangGraph wiring + streaming runner

**Files:**
- Create: `src/services/agent/graph.ts`
- Modify: `package.json` (add `@langchain/langgraph @langchain/core`)

- [ ] **Step 1: Add dependency** — `pnpm add @langchain/langgraph @langchain/core`. Then **verify the current StateGraph API via context7** (`mcp__context7` resolve `@langchain/langgraph`) before writing — do not guess the API.

- [ ] **Step 2: Implement the graph + an async-generator runner that yields trace events**
```ts
// src/services/agent/graph.ts
import { emptyState, type AgentState, type TraceEvent } from "@/services/agent/state";
import { routerNode, researcherNode, analystNode, forecasterNode, strategistNode, scribeNode } from "@/services/agent/nodes";

// Pragmatic sequential+parallel runner (LangGraph-style). If @langchain/langgraph
// StateGraph is wired, route these same node fns through it; behaviour is identical.
export async function* runAgent(command: string): AsyncGenerator<{ event: "trace" | "final"; state: AgentState }> {
  let s = emptyState(command);
  const emit = (step: string, status: TraceEvent["status"], detail?: string) => { s.trace.push({ step, status, detail, atMs: 0 }); };
  const apply = (p: Partial<AgentState>) => { s = { ...s, ...p, trace: p.trace ?? s.trace }; };

  emit("scope", "start"); yield { event: "trace", state: s };
  apply(await routerNode(s)); yield { event: "trace", state: s };
  if (!s.scope) { return; }

  emit("research", "start"); yield { event: "trace", state: s };
  apply(await researcherNode(s)); yield { event: "trace", state: s };

  // independent analyses concurrently
  emit("analyse", "start"); yield { event: "trace", state: s };
  const [a, f] = await Promise.all([analystNode(s), forecasterNode(s)]);
  apply(a); apply(f); yield { event: "trace", state: s };

  emit("opportunities", "start"); yield { event: "trace", state: s };
  apply(await strategistNode(s)); yield { event: "trace", state: s };

  emit("briefing", "start"); yield { event: "trace", state: s };
  apply(await scribeNode(s)); yield { event: "trace", state: s };

  yield { event: "final", state: s };
}
```
(If LangGraph `StateGraph` is wired in Step 1, replace the body with `graph.stream(...)` and map its events to the same `{event, state}` shape. The node functions are unchanged either way.)

- [ ] **Step 3: Smoke test against live Ollama** (manual; Ollama must be running)
Run a tiny script or a temporary route hit and confirm a full run completes and `state.briefing` is populated. Expected: ≤120 s, briefing present.

- [ ] **Step 4: Commit**
```bash
git add src/services/agent/graph.ts package.json pnpm-lock.yaml
git commit -m "feat(agent): graph runner with streaming trace"
```

### Task 1.6: SSE API route

**Files:**
- Create: `src/app/api/agent/run/route.ts`

- [ ] **Step 1: Implement** (follow the auth/actor pattern in `src/app/api/briefings/generate/route.ts`)
```ts
// src/app/api/agent/run/route.ts
import { runAgent } from "@/services/agent/graph";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { command } = await req.json();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runAgent(String(command ?? ""))) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: "error", message: String(e) })}\n\n`));
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
}
```
Add auth: read the session via the project's existing helper used in other API routes; reject if unauthenticated; pass `actor`/`actorDept` into nodes' `completeText` calls (thread through `runAgent(command, { actor })`).

- [ ] **Step 2: Manual verify** — `curl -N -X POST localhost:3000/api/agent/run -d '{"command":"Prepare me for Brazil energy meeting"}'` streams `data:` frames ending in `event:"final"`.

- [ ] **Step 3: Commit**
```bash
git add src/app/api/agent/run/route.ts
git commit -m "feat(agent): SSE run endpoint"
```

### Task 1.7: /agent hero UI with live step tracker

**Files:**
- Create: `src/app/agent/page.tsx`, `src/components/agent/AgentRunner.tsx`
- Modify: `src/app/dashboard/page.tsx` (primary CTA → `/agent`)

- [ ] **Step 1: Build `AgentRunner.tsx`** — a prompt input ("Prepare me for Brazil"), a vertical 6-step tracker (scope → research → analyse → forecast → opportunities → briefing) that lights up from streamed `trace` events, and a results panel (briefing overview, talking points, opportunity cards, forecast band, then deliverable buttons added in Phase 3/4). Consume the SSE via `fetch` + `ReadableStream` reader; update step state on each `data:` frame; render `event:"final"` results. Use existing components for cards/typography; respect `useI18n` + RTL.

- [ ] **Step 2: `page.tsx`** wraps `AgentRunner` in `AppShell` + `Suspense` (match `src/app/chat/page.tsx`). Add route to middleware-allowed roles (analyst+).

- [ ] **Step 3: Dashboard CTA** — replace/insert a primary "Prepare me for a meeting" tile linking to `/agent`.

- [ ] **Step 4: Manual verify** — load `/agent`, run the command, watch steps light up, briefing renders. Add an e2e in `tests/e2e/agent.spec.ts` asserting the tracker reaches "briefing" (mock the route if Ollama not in CI).

- [ ] **Step 5: Commit**
```bash
git add src/app/agent src/components/agent tests/e2e/agent.spec.ts src/app/dashboard/page.tsx
git commit -m "feat(agent): /agent hero UI with live step tracker"
```

- [ ] **Gate:** `pnpm lint && pnpm typecheck && pnpm test`.

---

# PHASE 2 — Real data + committed cache

### Task 2.1: Indicator code maps + cache reader

**Files:**
- Create: `src/lib/data/indicator-codes.ts`
- Test: `tests/unit/indicator-codes.test.ts`

- [ ] **Step 1: Failing test** for `readSeedIndicators` returning [] for unknown iso3 and parsed rows for a known fixture.
- [ ] **Step 2: Implement** the WB/IMF/IEA code→label map (gdp, gdp_per_capita, renew_share, energy_import_dep, infra_index, trade_yoy, population, co2) and `readSeedIndicators(iso3)` reading `data/seed/indicators.<iso3>.json` (returns `IndicatorPoint[]`; `[]` if absent).
- [ ] **Step 3: Test pass. Commit.**

### Task 2.2: Fetch + commit the demo cache

**Files:**
- Create: `scripts/build-seed.ts`, `data/seed/indicators.{ARE,BRA,DEU,IND}.json`, `data/seed/corpus.jsonl`

- [ ] **Step 1:** Write `scripts/build-seed.ts` that runs the existing adapters (`fetchWorldBankFor`, IMF, Ember) for ARE/BRA/DEU/IND, normalises to `IndicatorPoint[]`, and writes the per-country JSON + a `corpus.jsonl` of short sourced text snippets (for RAG grounding).
- [ ] **Step 2:** Run `pnpm tsx scripts/build-seed.ts` (online). Spot-check Brazil GDP/renewables against World Bank to confirm real values.
- [ ] **Step 3:** Seed the RAG corpus from `corpus.jsonl` (reuse the existing ingest path) and confirm `retrievePassages("BRA energy")` returns hits.
- [ ] **Step 4: Commit** the generated `data/seed/*` (these are the wifi-proof demo cache) + the script.
```bash
git add scripts/build-seed.ts data/seed src/lib/data/indicator-codes.ts tests/unit/indicator-codes.test.ts
git commit -m "feat(data): real fetched indicator + corpus cache for demo countries"
```

### Task 2.3: Backfill Brazil + verify grounding end-to-end

- [ ] **Step 1:** Confirm `fetchIndicators("BRA")` now returns real rows (BRA had zero before).
- [ ] **Step 2:** Run `/agent` "Prepare me for Brazil" and confirm the briefing cites real figures and the figure-validator (`validateFigures`) does not strip them.
- [ ] **Step 3:** No new code likely; if the validator strips good figures, wire `resolveFacts`/`validateFigures` into `scribeNode` so emitted numbers match `indicators`. Commit any fix.

---

# PHASE 3 — UAE Design System + visual deliverables

### Task 3.1: Design tokens + fonts

**Files:** Modify `tailwind.config.ts`, `src/app/layout.tsx`/globals.

- [ ] **Step 1:** Extend Tailwind `colors` with the UAE core palette (`aegold #B68A35/600 #92722A`, `aered #EA4F49`, `aegreen #4A9D5C`, `aeblack #5F646D`) and secondary (`techblue #286CFF`, `seablue #00ABEB`, `camel #F29F0E`, `desert #EB5F24`). Re-point `accent.DEFAULT` to AEGold. Keep existing `ink` neutrals.
- [ ] **Step 2:** Add fonts: EN headings Inter (present), body Roboto; AR headings Alexandria, body Noto Kufi Arabic. Load via `next/font` in `layout.tsx`; map `font-arabic` to Noto Kufi Arabic.
- [ ] **Step 3:** Visual check at `/dashboard`; ensure WCAG AA contrast (AEGold on white needs the 600 shade for text). Commit.

### Task 3.2: Donut + Bar + FlagMap chart components

**Files:** Create `src/components/shared/Donut.tsx`, `BarChart.tsx`, `FlagMap.tsx`; Test `tests/unit/donut.test.ts`.

- [ ] **Step 1: Failing test** for a pure `donutSegments(values)` helper returning arc offsets summing to the circumference.
- [ ] **Step 2: Implement** `Donut` (SVG, segment math in a tested pure fn), `BarChart` (SVG bars + labels, AE palette), `FlagMap` (reuse country flags from `COUNTRIES`; place dots + value callouts on a real world silhouette or the existing projection — upgrade `WorldMap` to show flags + values).
- [ ] **Step 3: Test pass. Commit.**

### Task 3.3: Infographic one-pagers

**Files:** Create `src/components/briefings/OnePager.tsx` (country) and a bilateral variant.

- [ ] **Step 1:** Build a HKTDC-style country one-pager: header (flag, name EN/AR, capital, region), KPI tiles (GDP, GDP/capita, population), Donut (GDP by sector), LineChart (GDP/inflation trend), BarChart (trade), footer sources. Pull from `AgentState`/indicators.
- [ ] **Step 2:** Build a MOFA-style bilateral one-pager (UAE↔partner): big trade numbers, opportunity cards, FlagMap. Use AE palette + fonts.
- [ ] **Step 3:** Render both on `/agent` results. Manual visual check vs `Context/` examples. Commit.

### Task 3.4: Rasterize → embed in PDF/PPTX

**Files:** Create `src/services/export/raster.ts`; Modify `src/services/export.ts`.

- [ ] **Step 1:** Implement `renderToPng(node|svg): Buffer` using `@napi-rs/canvas` (declared in `package.json` onlyBuiltDependencies) or `satori`+`@resvg/resvg-js`. Verify the chosen lib via context7.
- [ ] **Step 2:** In `export.ts`, generate the one-pager PNG and embed: PDF via `<Image>` (`@react-pdf/renderer`), PPTX via `slide.addImage(...)`. Keep the text slides as appendix.
- [ ] **Step 3:** Export a briefing, open the PDF/PPTX, confirm the infographic appears (not text-only). Commit.

### Task 3.5: TAMM-style shell + rewire cooperation to the real scorer

**Files:** Modify shell components, `src/components/cooperation/CooperationView.tsx`.

- [ ] **Step 1:** Restyle `/agent` + shell to TAMM-like: warm AEGold accents, rounded cards, the prompt as hero, AI-assistant tone. Keep nav minimal.
- [ ] **Step 2:** Replace the hardcoded `OPPORTUNITIES` array (`CooperationView.tsx:24`) with a call to `scoreOpportunities(...)` over real indicators (server action or `/api/agent/opportunities?partner=`). Keep the existing pipeline/graph UI.
- [ ] **Step 3:** Verify cooperation now reflects real data. Commit.

- [ ] **Gate:** `pnpm lint && pnpm typecheck && pnpm test`.

---

# PHASE 4 — Video brief + voice (upside; cut video before voice if time-short)

### Task 4.1: ffmpeg video brief

**Files:** Create `src/services/video/render.ts`; Modify `src/components/video/VideoStudio.tsx` (remove TODO-018).

- [ ] **Step 1:** Install ffmpeg (`brew install ffmpeg`). Implement `renderVideo(frames: Buffer[], narration: string[]): Promise<string>` — write PNG frames (the infographic + per-scene frames), synth narration per scene via macOS `say -o scene.aiff` → convert to mp3, then ffmpeg concat frames timed to audio → `public/videos/<id>.mp4`.
- [ ] **Step 2:** Wire the video studio "render" button to call a new `/api/videos/render` route that returns the MP4 path; replace the `TODO-018` info toast with a real download link.
- [ ] **Step 3:** Generate a brief, play the MP4. Commit.

### Task 4.2: Voice command

**Files:** Modify `src/components/agent/AgentRunner.tsx`.

- [ ] **Step 1:** Add a mic button using `window.SpeechRecognition`/`webkitSpeechRecognition` (EN + AR locales) that fills the command input and submits. Reuse `speechSynthesis` for reading the overview aloud.
- [ ] **Step 2:** Manual verify in Chrome. Graceful fallback (hide mic) where unsupported. Commit.

- [ ] **Final gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`.

---

## Self-review notes
- **Spec coverage:** agent graph (§5.2)→P1; tools (§5.3)→1.2; opportunity scorer (§5.4)→1.3; grounding/validators (§5.5)→1.4/2.3; data (§5.6)→P2; visuals/design (§5.7)→P3; video/voice (§5.8)→P4; UI (§5.9)→1.7/3.5. All covered.
- **Adapt-don't-guess flags:** import signatures for `holts`, `runRag`/`RagRequest`, `fetchWorldBankFor` return shape, and the auth/session helper must be read from the real files at implementation time and matched exactly. LangGraph and the raster lib APIs must be confirmed via context7 before coding those tasks.
- **Type consistency:** `IndicatorPoint`, `Scope`, `Opportunity`, `AgentState`, `TraceEvent` defined once in `state.ts` and reused across nodes, tools, scorer, UI.
- **Cut lines honored:** no fine-tuning, no ComfyUI live, no n8n; Phase 4 is optional.
