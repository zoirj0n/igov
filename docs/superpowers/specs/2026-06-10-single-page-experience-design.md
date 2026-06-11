# Single-Page Experience Redesign — Design Spec

Date: 2026-06-10 · Branch: `feat/executive-briefing-redesign` · Status: approved by Salim (design dialogue, this date)

## 1. Goal

Collapse the 13-route app into one continuous executive experience built around the hero
flow: **"Prepare me for a meeting with [country]'s [counterpart]"**. The product becomes the
challenge guide's core scenario (meeting prep in minutes, decision-ready output), adds a
**counterpart-research agent** (who you're meeting, with photo), and folds the old pages into
**focus views** inside a one-page command center. Constraint context: MOEI hackathon, 2+ weeks
to demo, judged on Agentic Depth 25 / Federal Impact 25 / Technical Excellence 20 / Demo 15 /
Feasibility 15.

Non-goals (explicit, post-redesign follow-ups): voice assistant polish, dynamic relationship
graph, video pipeline changes, deleting legacy routes, NestJS v2.

## 2. Decisions locked during design dialogue

| Decision | Choice |
|---|---|
| Landing | **A — concierge minimal**: the screen is the sentence; nothing else competes |
| Landing input scope | Guided composer **plus real free-text chat** (closes challenge capability ④) |
| Counterpart input | **Country + role picker** mad-lib slot; role defaults to Energy Minister; custom name allowed |
| Country picker | **2 — map as filter, grid as selector**: map filters regions, selection on large cards |
| Agents view | **C + A flavor — assembling dossier** center-stage with named agent rail + live tool-call feed |
| Command center | **B — overview bento, zoom-to-focus**; counterpart card shrinks into header strip inside focus views |
| Route strategy | New experience is `/`; legacy routes stay as deep links until parity, then retire |
| Animation | framer-motion (only new runtime dep); all morphs degrade to fades under `prefers-reduced-motion` |

## 3. Experience flow

State machine (client-side, single route — no navigation between views):

```
landing ──(begin)──> running ──(complete)──> ready ⇄ focus:<view>
   ⇅ picking (overlay)
   └─(free-text question)→ chat answer cards stack under the pinned sentence
```

- **landing** — centered sentence: `Prepare me for a meeting with [country]'s [role ▾]`.
  Country slot opens the picker overlay; role slot is a dropdown (Energy Minister default;
  Infrastructure, Foreign Affairs, Head of State, Trade, custom name). Below: free-chat hint
  ("or ask anything…"), recent-run chips, classification banner in header.
- **picking** — full-screen overlay: search field (all ~195 from `iso-countries.ts`), world map
  band (existing Natural Earth topology) acting as **region filter** (Americas / Europe /
  Middle East & Africa / Asia-Pacific chips; country click on map highlights its card —
  enhancement, not the selection mechanism), card grid with per-country hook stats (GDP, trade
  with UAE where cached). Featured 12 seeds + IDN + SGP surface first. Flags: vendored SVGs
  for the featured 14, emoji flags for the long tail (offline-safe; demo machine is macOS). Selecting flies the
  card into the sentence slot. Focus-trapped dialog, ESC closes.
- **running** — theater. Top: agent rail (Router → Researcher ‖ Counterpart → Analyst ‖
  Forecaster → Strategist → Scribe EN→AR) with live statuses + elapsed timer. Center: the
  **bento skeleton assembling** — tiles materialize as artifacts land (indicators, trade,
  counterpart card, opportunities), prose tiles shimmer until the scribe finishes. Bottom:
  one-line streaming tool-call feed, expandable to full trace. SSE from existing
  `/api/agent/run` (10s heartbeat already implemented).
- **ready** — command center bento on the same grid (theater settles in place, no screen cut).
  Tiles: BLUF (wide), counterpart, trade headline, top opportunity, comparison radar thumb,
  forecast sparkline, IR facts, sources/freshness. Header: country + counterpart chip,
  readiness ✓, elapsed time, actions (Export PDF/PPTX/one-pager/video script · EN/AR toggle ·
  New briefing), focus-view button row.
- **focus:<view>** — tile zoom-morph (framer-motion shared layout IDs) into full panel; other
  tiles scale back; focus buttons = WAI-ARIA tablist. Views: Overview (default), Brief,
  Counterpart, Opportunities, Trade & Investment, Compare, Forecast, Profile, Sources.

URL/hash sync: `#run=<id>`, `#focus=<view>`. Browser back walks states; refresh mid- or
post-run rehydrates from the persisted run record. Tiles carry provenance badges
(`live / cached / seed`).

Shell: no sidebar. Slim header — logo, classification banner, EN/AR, user menu (admin, audit,
settings, legacy pages). Cmd+K palette retained.

## 4. Counterpart agent (new)

**Placement:** new LangGraph node `counterpart` in `src/services/agent/` fanning out from the
router **in parallel with** the researcher; feeds the scribe (name woven into brief + talking
points) and streams to the UI as soon as identification lands. Zero added critical-path
latency. LLM steps on `OLLAMA_MODEL_HEAVY` (qwen2.5:7b); Tavily/Wikipedia/Wikidata are data
APIs — sovereignty gates (`LLM_PROVIDER=local`, `OFFLINE_MODE`) untouched.

**Steps:**
1. **Identify** — role → Tavily query (e.g. `"Brazil minister of mines and energy 2026"`) →
   qwen extracts current officeholder + confidence. Custom-name input skips this step.
2. **Enrich** — MediaWiki search → Wikipedia REST `page/summary` (extract, thumbnail, page
   URL); merge Wikidata claims (positions held, education) when resolvable.
3. **Synthesize** — qwen composes dossier: who they are, career timeline (where they worked),
   priorities, "likely to raise with the UAE", recent statements (Tavily news). Every bullet
   cited.

**Contract** (`src/services/agent/state.ts`):
```ts
type CounterpartProfile = {
  name: string; nameAr?: string; role: string; roleAr?: string;
  photoUrl?: string; photoAttribution?: string;
  summary: string; career: { period: string; position: string; org: string }[];
  likelyToRaise: string[]; statements: { text: string; date: string; url: string }[];
  citations: Citation[]; identifiedAsOf: string;      // ISO date
  confidence: "high" | "medium" | "unconfirmed";
}
```

**Photo:** fetched server-side at run time, cached to `data/cache/counterparts/`, served via a
proxy API route (no hotlinking; renders offline after first fetch). Attribution shown in the
Sources view.

**Integrity rule — never fabricate a person.** Low confidence / failed search / air-gap
without seed ⇒ card renders the explicit `unconfirmed` state (role silhouette, "verify
counterpart before meeting"). Counterpart failure is non-fatal to the brief (same discipline
as the AR pass). Card always shows `identifiedAsOf`.

**Seeds:** `data/seed/counterparts.json` — profiles for the 12 curated countries + IDN + SGP,
photos vendored under `public/counterparts/` with attribution fields. Air-gap uses seeds only.

**Surfaces:** theater card (materializes on identify), bento tile, Counterpart focus view
(career timeline + likely-to-raise + statements), header chip in other focus views,
PPTX/one-pager counterpart block. AR rendering via the existing Arabic scribe pass.

## 5. Chat responder (new — challenge capability ④)

`POST /api/chat/ask` (SSE, additive — legacy chat route untouched):
1. **Intent parse** (`OLLAMA_MODEL_LIGHT`, qwen2.5:3b): `compare | sector | policy |
   opportunity | prepare | general` + countries/sectors extraction. `prepare` intent
   redirects into the prepare flow (state machine takes over).
2. **Answer** (`OLLAMA_MODEL_HEAVY`): grounded on RAG retrieval (existing orchestrator,
   classification-filtered) + live indicators + Tavily when online; last N turns threaded.
   `compare` intent also fetches both countries' indicators and renders an inline comparison
   card. Existing citation validator applies; weak retrieval ⇒ honest abstention with a
   suggestion to run a full briefing.

Answer cards stack beneath the pinned sentence on the landing. Covers the guide's four
examples (UAE vs Singapore smart cities; UAE–Germany hydrogen; Indonesia infrastructure;
UAE–India logistics).

## 6. Run record (single source of truth)

Extends existing briefings persistence (in-memory + JSONL; DB when `USE_DB=1`):
`{ id, scope (country, role), counterpart, indicatorsSnapshot, tradeSeries, opportunities,
forecast, briefEn, briefAr?, talkingPoints, citations, trace, timings, classification,
createdBy, createdAt }`. Rehydration endpoint `GET /api/agent/runs/:id`. Bento tiles and focus
views are pure projections of this record; exports read from it; recent-run chips list it.

## 7. Focus-view data wiring

| View | Source |
|---|---|
| Brief / Counterpart / Opportunities | run record |
| Trade & Investment | run record Comtrade series + new visualization pack: MOFA-style bilateral infographic, investment map with total-value headline (curated cited `data/seed/investments.<iso3>.json`), FDI chart |
| Compare | live comparison engine (existing compare components recomposed), country-vs-UAE preseeded, peers addable |
| Forecast | run record forecasts + existing scenario components |
| Profile | IR one-pager fields — World Bank `NV.*` sector composition + demographics live (all countries) + static facts (currency, political system, capital, language) |
| Sources | citations resolved against `data/sources.csv`, freshness stamps, classification banner |

Compare/Forecast/parts of Trade are recompositions of existing components, not rebuilds.

## 8. Resilience & honesty

- **Progressive reveal**: research artifacts land in seconds; only prose takes minutes. Theater
  + tool feed + timer carry the wait. Demo aids: documented gemma pre-warm; env toggle for
  fast-scribe (`OLLAMA_MODEL_SCRIBE=qwen2.5:7b`, ~3 min).
- **Degraded-mode honesty**: if Ollama is unreachable and deterministic templates engage, the
  theater shows a visible "degraded composition mode" notice (the known silent-fallback trap,
  surfaced). Provenance badges on every tile.
- **Per-stage failures**: unresolvable country → message + suggestions; mid-run failure →
  completed tiles persist, failed sections get per-section retry; SSE drop → reconnect +
  resume from run record; photo failure → initials avatar; AR failure → EN delivered, AR
  toggle disabled.
- **Air-gap** (`AGENT_AIRGAP=1`): full journey from cache/seed — picker, counterpart (seeds),
  chat (RAG-only). Wifi-proof demo.

## 9. Accessibility, i18n, governance

Picker = focus-trapped dialog; focus buttons = existing WAI-ARIA tablist util (arrows,
Home/End); agent progress announced via live region; reduced-motion ⇒ fades; RTL via logical
properties; all new strings in the EN/AR catalog. Runs carry classification labels; audit
events for run start/complete and chat asks via the existing audit service; no PII in logs.

## 10. Testing

- **Vitest**: state-machine transitions; counterpart node against Tavily/Wikipedia fixtures
  (incl. unconfirmed path); chat intent routing; run-record tile projections.
- **Integration**: `/api/chat/ask` SSE with mocked LLM; run persistence/rehydration
  round-trip; air-gap end-to-end (auto-on under Vitest).
- **Playwright**: golden path (land → pick Brazil → run with mocked stream → bento → zoom
  every focus view → export), free-text chat answer, RTL smoke, reduced-motion variant.
- Manual demo rehearsal: Brazil scenario with live Ollama, timed.

## 11. Build order (each step demoable)

1. Foundation — framer-motion, state machine + hash routing, slim header, landing composer
   wired to existing agent SSE.
2. Picker overlay (map filter + card grid).
3. Theater (agent rail + assembling dossier on existing events).
4. Run record + bento command center + focus-zoom shell.
5. Counterpart agent (node, wikipedia client, card/tile/focus view, seeds).
6. Focus views fill-in (Brief, Opportunities, Compare, Forecast recomposition, Profile
   enrichment, Sources).
7. Trade & investment visualization pack.
8. Chat responder.
9. Polish — a11y/RTL/i18n pass, export upgrades (counterpart + trade slides), demo script +
   feasibility docs, E2E hardening.

## 12. New surface inventory

- `src/lib/experience/machine.ts` — view state machine + hash sync.
- `src/components/experience/` — `Landing`, `SentenceComposer`, `CountryPicker`, `RolePicker`,
  `Theater`, `AgentRail`, `ToolFeed`, `Bento`, `tiles/*`, `focus/*`, `HeaderBar`.
- `src/services/agent/counterpart.ts` — node; `src/services/live/wikipedia.ts` — REST client.
- `src/app/api/chat/ask/route.ts`; `src/app/api/agent/runs/[id]/route.ts`; counterpart photo
  proxy route.
- `data/seed/counterparts.json`, `data/seed/investments.<iso3>.json`,
  `public/counterparts/*`.
- `/` becomes the experience (login still gates); legacy routes untouched this phase.
