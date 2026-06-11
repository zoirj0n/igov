# Design Spec — Agentic Strategic Advisor (repositioning)

**Date:** 2026-06-07
**Branch:** `feat/agentic-advisor`
**Context:** MOEI AD42 Agentic AI Hackathon — "AI-Powered Global Country Intelligence Platform"
**Goal:** Reposition the existing codebase from a *country information platform* into the *digital strategic advisor for UAE leadership* the brief explicitly demands, and score ~90/100 against the rubric.

---

## 1. Why we are doing this

The Challenge Guide is blunt: *"You are NOT building a country information platform. You are building a digital strategic advisor for UAE leadership powered by AI."* It explicitly lists three anti-patterns — **not a chatbot, not a search engine, not a static dashboard** — which is exactly what the current build leads with (a 925-line chat workspace, a 985-line sources catalog, a KPI dashboard).

The current code has excellent *foundations* (real hybrid RAG with validators, RBAC/classification/audit, Holt's forecasting, offline kill-switch, EN/AR + a11y) but the **agentic spine is absent**: briefings are one ungrounded prompt (`src/services/ai.ts:266`), "opportunities" are a hardcoded array (`src/components/cooperation/CooperationView.tsx:24`), nothing is autonomous or multi-step, and exports are text-only.

We **reposition, not rebuild**: keep ~80% of the foundation, add a thin but real agentic + visual layer on top, and lead the demo with the brief's own signature scenario: **"Prepare me for Brazil's Energy Minister — meeting in 15 minutes."**

## 2. Rubric mapping (target)

| Criterion | Pts | Current est. | Target | Lever |
|---|---|---|---|---|
| Agentic Depth | 25 | 10–13 | 21–23 | Autonomous LangGraph multi-agent run; grounded briefing; computed opportunities |
| Federal Impact | 25 | 14–17 | 21–23 | Brazil energy scenario; sovereign on-prem AI (residency); exec deliverables |
| Technical Excellence | 20 | 12–15 | 16–18 | Real multi-source live fetch + persistence; RAG grounding; on-prem fleet |
| Demo & Storytelling | 15 | 7–10 | 13–14 | Live 8-step agent trace → infographics + slides + video; voice; AR/EN |
| Feasibility & Execution | 15 | 12–14 | 13–14 | Real data strategy; UAE Design System; deployment + residency story |
| **Total** | 100 | ~58–68 | **~88–92** | |

## 3. Decisions locked

- **Hero country:** Brazil (the brief's own example). Comparison/cooperation partners: Germany (hydrogen), India (logistics) — also from the brief.
- **AI runtime:** fully **local, no cloud key**. Sovereign-AI / data-residency is a *feature*, not a fallback.
- **Data:** wire **real** World Bank / IMF / IEA-Ember fetch for the demo countries; **fetch-then-persist** so the live demo never depends on venue wifi.
- **Runway:** 24h+ → full repositioning (Phases 0–4).
- **Design language:** UAE Design System 2.0 (what TAMM follows). MOEI is a Ministry → **core palette unchanged**.
- **Orchestration:** **LangGraph.js**, mirroring TAMM's real LangChain/LangGraph multi-agent architecture.
- **Model fleet:** `qwen2.5:7b` (reasoning/synthesis) + `qwen2.5:3b` (routing/extraction/translation) + `nomic-embed-text` (retrieval), kept warm together (~7 GB) on the 16 GB M4 Air.

## 4. Hardware constraint (binding)

Dev + demo machine: **MacBook Air, Apple M4, 16 GB unified memory, ~23 GB free disk.** Consequences:
- Cannot hold many models + ComfyUI + Next + browser in memory at once. → **2-model backbone only**, kept warm; no model zoo.
- **ComfyUI: offline/pre-demo only** for hero/background art. Live, it competes with the LLM. **Data charts stay deterministic** — a diffusion model must never render a GDP figure.
- **Video brief:** ffmpeg over deterministic infographic frames + local TTS — light and accurate, not a live generative pipeline.
- Expected latency: a full "Prepare me for Brazil" run ≈ **60–120 s**, streamed as a live step trace so it reads as thorough autonomous research, not lag.

## 5. Architecture

### 5.1 Local AI runtime (`src/services/llm/`)
- Ollama at `http://localhost:11434` (provider already exists: `src/services/llm/local.ts`).
- Add a **role→model map** so each agent node picks its model: `route|extract|translate → qwen2.5:3b`, `analyze|strategize|synthesize → qwen2.5:7b`.
- Embeddings via `nomic-embed-text` through the existing Ollama embed path (`src/services/llm/embed.ts`).
- "Specialized" = role-specific system prompt + strict Zod-validated I/O + per-agent validators. **No fine-tuning** (out of scope; honest).

### 5.2 Multi-agent orchestrator (`src/services/agent/`)
LangGraph.js state machine. **Supervisor + specialists**, streaming a trace event per node.

Shared state: `{ command, intent, country, sector, audience, classification, indicators, passages, analysis, forecast, opportunities, risks, briefing, deliverables, trace[] }`.

| Node (agent) | Model | Does | In → Out (validated) | Journey step |
|---|---|---|---|---|
| **Router/Scoper** | 3b | Parse NL command into scope | `command → {iso3, sector, audience, intent, classification}` | 1–2 |
| **Researcher** | 3b + tools | Fetch indicators + retrieve passages | `scope → {indicators[], passages[]}` | 3 |
| **Analyst** | 7b | Grounded economic/energy/infra read | `{indicators, passages} → analysis` | 4 |
| **Forecaster** | tool + 7b | Holt's trend + 1-line interpretation | `series → {forecast, band, read}` | 4 |
| **Strategist** | 7b + tool | Score opportunities + risks, grounded rationale | `{indicators, analysis} → {opportunities[], risks[]}` | 5 |
| **Scribe** | 7b | Synthesize briefing; run citation/figure validators | `state → {overview, talkingPoints[], citations[]}` | 6–7 |
| **Producer** | none | Assemble deliverables | `state → {onePager, slides, videoManifest}` | 7–8 |
| **Translator** | 3b | EN↔AR for outputs | `text → text` | cross-cutting |

Edges: linear supervisor flow; Analyst / Forecaster / Strategist may run **concurrently** after Researcher, then converge at Scribe. Each node appends to `trace[]` and emits SSE → the live UI.

### 5.3 Tools (typed, callable — `src/services/agent/tools/`)
Real functions the agents invoke (this is what makes it agentic, and makes native tool-calling a later 1-hour add):
- `fetchIndicators(iso3, codes[])` — wraps existing `worldbank|imf|ember|oecd` adapters; persists to store/DB + corpus.
- `retrievePassages(query, k)` — existing hybrid BM25+vector RAG (`src/services/rag/`).
- `forecast(series)` — existing Holt's (`src/services/predict/holts.ts`).
- `scoreOpportunities(uae, partner)` — **NEW, real computation** (see 5.4), replaces the hardcoded array.

### 5.4 Opportunity scoring (replaces hardcoded array)
For each sector, `score = f(UAE strength, partner gap/need, trade momentum, alignment flags)` computed from indicator-derived signals (e.g. UAE renewables capacity × partner energy-import dependence; bilateral trade YoY). Output: ranked `{sector, score 0–100, signals}`; the Strategist (7b) turns the signals into an executive rationale **grounded in the actual numbers**. Defensible, inspectable, not invented.

### 5.5 Grounding & validation (reuse)
Briefing flows through existing `src/services/rag/validators.ts`: figure round-trip (±tolerance), citation enforcement (drop uncited factual sentences), abstention on weak grounding. Honors the repo rule "all AI outputs must cite source documents/indicators" — which the current single-shot briefing violates.

### 5.6 Data layer (`src/services/ingest/`, `data/`)
- Run adapters for Brazil + UAE + Germany + India; persist to ingest store (+ DB if `USE_DB`).
- Write text snippets with provenance + timestamp into the RAG corpus.
- Commit a **seed corpus + indicator cache** for the demo countries so the system is real even fully offline (fixes today's empty-RAG footgun and Brazil's zero indicators).

### 5.7 Visual / deliverable layer
- **Design tokens** (Tailwind): core palette AEGold `#B68A35`, AERed `#EA4F49`, AEGreen `#4A9D5C`, AEBlack `#5F646D`; secondary Tech Blue `#286CFF`, Sea Blue `#00ABEB`, Camel Yellow `#F29F0E`, Desert Orange `#EB5F24`. Fonts: EN Inter/Roboto, AR Alexandria/Noto Kufi Arabic. WCAG AA.
- **TAMM-inspired shell**: warm, card-based, AI-assistant-centric; the "Prepare me for…" prompt is the hero, not a nav bar of tools.
- **Infographic renderer** (`src/services/export/`): React/SVG → PNG (via `@napi-rs/canvas` or satori+resvg) → embedded into PDF (`@react-pdf/renderer` Image) and PPTX (`pptxgenjs.addImage`). Replaces today's text-only decks.
- **New charts**: donut (GDP by sector), bar (trade balance), + a real flag map with deal values; reuse existing `RadarChart`/`LineChart`.
- **Outputs**: HKTDC-style country one-pager + MOFA-style bilateral one-pager + ready-to-present slides + talking points.

### 5.8 Video & voice (Phase 4, cuttable)
- **Video brief**: ffmpeg concat of infographic frames + local TTS (macOS `say`→mp3, or Piper) → ~75 s MP4. Removes `TODO-018` in `VideoStudio.tsx:464`.
- **Voice**: Web Speech API for the "Prepare me for Brazil" command + speech-out narration (partly present in `VideoPlayback.tsx`).

### 5.9 UI (`src/app/`)
- New **`/agent`** route is the hero: single prompt → live **8-step trace tracker** → assembled briefing, one-pagers, slides, opportunities, forecast, video. This is the demo. The dashboard's primary CTA links here ("Prepare me for a meeting").
- Existing pages (chat, compare, cooperation, insights, sources, admin) become *supporting surfaces of the advisor*, reachable from results — not the headline.

## 6. Non-goals / cut lines
- No model fine-tuning. No ComfyUI in the live path. No n8n. No new auth/SSO work. No rebuild of existing RBAC/classification/audit/validators (reuse).
- Keep existing pages; do **not** delete chat/sources — reframe them as supporting, lead with the agent.
- Phase 4 (video, voice) is upside; if time is short, ship Phases 0–3. Video before voice.

## 7. Risks & mitigations
| Risk | Mitigation |
|---|---|
| 7b output below "Claude quality" | Tight grounded prompts + structured I/O + validators + retrieval grounding; swap Scribe node to 14b if testing disappoints |
| Run latency 60–120 s | Stream the trace; run Analyst/Forecaster/Strategist concurrently |
| Live data fetch fails at venue | Fetch-then-persist; commit demo cache; system reads from cache |
| ffmpeg/TTS setup cost | Time-boxed Phase 4, cuttable |
| 23 GB disk | Lean models only (~7 GB); no SDXL on the demo box |

## 8. Phases (detail in the implementation plan)
- **P0** Local AI runtime — Ollama + 2-model fleet, warmed, smoke-tested; role→model map.
- **P1** Agent orchestrator + grounding — LangGraph.js graph, tools, opportunity scorer, grounded briefing, `/agent` live trace.
- **P2** Real data + corpus — adapters run for demo countries, persisted + committed cache.
- **P3** Design system + visual deliverables — UAE DS tokens, TAMM shell, infographic renderer, PDF/PPTX with images.
- **P4** Video + voice — ffmpeg brief + Web Speech.

## 9. Sources
- UAE Design System 2.0 — colour: https://designsystem.gov.ae/guidelines/colour-system ; typography: https://designsystem.gov.ae/guidelines/typography
- TAMM AI Assistant (LangChain/LangGraph) — https://www.langchain.com/blog/customers-abu-dhabi-government
- TAMM 3.0 launch — https://www.dge.gov.ae/en/news/dge-abu-dhabi-launches-tamm-3
