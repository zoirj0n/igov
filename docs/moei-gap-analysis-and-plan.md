# MOEI Challenge — Gap Analysis, Scorecard & Plan

Date: 2026-06-09 · Branch: `feat/executive-briefing-redesign`
Sources: `Context/AI-Powered Global Country Intelligence Platform Challenge Guide.pdf`,
`Context/...Evaluation Rubric.pdf`, example visuals in `Context/`.

---

## 1. Scorecard — current implementation vs judging rubric (100 pts)

| Criterion | Max | Now | After plan | Why (current) |
|---|---|---|---|---|
| **Agentic Depth** | 25 | **21** | 24 | LangGraph pipeline (scope → research → analyse ‖ forecast → opportunities → briefing) autonomously researches via live tools (World Bank, IMF, EIA, Comtrade, Tavily web search), scores opportunities, composes EN/AR briefings with recommendations. Loses points: AI Search & Conversation is a *required core capability* and the chat responder is not wired (UI exists, RAG works, no LLM reply); comparison queries ("UAE vs Singapore") unsupported. |
| **Federal Impact** | 25 | **19** | 23 | Decision-first BLUF, UAE position (offers/asks/red lines), deal pipeline, talking points — strong leadership support. Loses points: no bilateral *investment map with total values* or MOFA-style trade infographic (the exact artifacts MOEI showed in Context/); leadership & government-structure data is mocked; UAE-competitiveness framing not surfaced on profiles. |
| **Technical Excellence** | 20 | **15** | 18 | Multi-source live integration, 6h caches + seed fallback, comparison engine with radar, SSE streaming, classification + audit. Loses points: "search capabilities" rubric item half-missing (chat), pgvector schema exists but chunks live in JSON, alerts not persisted/notified, governance data static. |
| **Demo & Storytelling** | 15 | **10** | 14 | The `/agent` "Prepare me for X" flow is a genuine executive scenario with actionable output. Loses points: no scripted demo of the canonical scenario ("meeting with Brazil's Energy Minister in 15 minutes"), no countdown/readiness framing, gemma compose latency (1–2 min) undermines "within seconds" story unless staged. |
| **Feasibility & Execution** | 15 | **9** | 13 | Real data strategy implicitly exists in code (cache TTLs, seed backfill, sources.csv catalog) but is *not documented*; no deployment roadmap artifact; sustainability of updates not written down. Judges can only score what they see. |
| **Total** | **100** | **74** | **92** | |

**Read of the rubric:** ~10 of the missing ~18 points are cheap — they come from wiring chat, two visualization packs, and two documents, not from new AI research capability.

---

## 2. Requirements coverage (challenge guide)

### Core capabilities
| # | Requirement | Status | Gap |
|---|---|---|---|
| 1 | Country smart profile (overview, government, leadership, economy, energy, infra, sustainability, priorities, projects) | ✅ mostly | Government structure & leadership are **mock/static**; missing general-IR facts (currency, political system, population, median age, GDP/capita, GDP sector composition) shown in the HKTDC-style example |
| 2 | Strategic insights (cooperation, investment, knowledge exchange, partnerships) | ✅ | Deterministic scoring + LLM rationale, real signals. Fine. |
| 3 | Executive briefing generator (summaries, talking points, one-pagers, **slides**) | ✅ | PPTX/one-pager/video exist. Upgrade deck quality (branded multi-slide). |
| 4 | **AI search & conversation** (smart queries, policy guidance, sector analysis, opportunity detection) | ⚠️ **biggest gap** | Chat UI + RAG retrieval exist; **no responder LLM wired**, no comparison-query handling, no multi-turn context |
| 5 | Country comparison engine | ✅ | Live, 20+ metrics, radar. Fine. |
| 6 | Predictive intelligence | ✅ | Holt's/regression forecast + scenarios. Could add "emerging sector" trends but acceptable. |

### Innovation features ("عناصر التميز")
| Feature | Status | Gap |
|---|---|---|
| AI meeting assistant | ✅ `/agent` | Add meeting-countdown framing for demo |
| AI video briefs | ✅/⚠️ | ffmpeg path works; fine for demo |
| Voice assistant | ⚠️ | Web Speech hooks exist; needs visible mic UX + spoken answers (EN/AR) |
| Real-time monitoring/alerts | ✅ SmartRadar | Fine; optionally persist + watchlist |
| Relationship mapping | ⚠️ | Graph exists but nodes/edges hardcoded — make dynamic from opportunities/trade |
| Accessibility / Arabic-first | ✅/⚠️ | i18n + RTL done; needs a11y pass on new views |

### Expected visual outputs (Context/ examples — judges showed exactly what they want)
| Artifact (from Context/) | Status |
|---|---|
| **Investment map with pins + total value** (UAE-US style "Examples of UAE Investments", "$1.4T framework") | ❌ missing — dashboard map shows arcs only, no investment values |
| **Top sources of FDI bar chart** + **trade balance chart** | ❌ missing |
| **MOFA-style bilateral trade infographic** (totals, exports/imports/re-exports YoY, #companies, headline %) | ❌ missing — Comtrade data already fetched, not visualized this way |
| **Country IR one-pager** (HKTDC style: GDP, GDP/capita, sector donut, external trade %, currency, political system, population, median age, language, religion) | ❌ missing fields + layout |
| **Economic indicator trend charts with (e)/(f) forecast markers** | ⚠️ partial (insights page has forecasts; profile lacks these charts) |

---

## 3. Plan

### P0 — Close requirement gaps (highest rubric leverage)

**T1. Wire the chat responder (AI Search & Conversation)** — *Agentic +2, Technical +2*
- `POST /api/chat/send` (SSE): intent parse via `OLLAMA_MODEL_LIGHT` → route to RAG (hybrid retrieval, classification-filtered) + live indicators + `OLLAMA_MODEL_HEAVY` answer with **citations**.
- Support the four guide examples: comparison ("UAE vs Singapore smart cities"), policy ("UAE–Germany hydrogen"), sector ("Indonesia infrastructure"), opportunity ("UAE–India logistics").
- Comparison intent → pull both countries' indicators, render inline comparison table/radar in chat.
- Multi-turn: thread last N messages into context. Reuse agent fallback discipline (cited, no fabrication).

**T2. Bilateral trade & investment visualization pack** — *Federal +2, Technical +1*
- New `BilateralTradeInfographic` (MOFA style, EN/AR, dark cinematic): total trade YoY, exports/imports/re-exports, headline growth % — from existing Comtrade fetch.
- **Investment map**: partner-country map with project/investment pins + **total value headline** (UAE-US style). Data: new `data/seed/investments.<iso3>.json` (curated real deals for the 12 + IDN/SGP, each row cited to sources.csv-resolvable URL), rendered with existing Natural Earth topology.
- FDI bar chart + trade balance chart components.
- Surface in: country profile Trade/Cooperation tabs, agent briefing "Visualize" tab, PPTX export slide.

**T3. Country IR one-pager + profile data enrichment** — *Federal +1*
- Add fields: currency, political system, capital, language, religion, population, median age, GDP per capita, GDP sector composition (agriculture/industry/services from World Bank NV.* value-added indicators — live, all countries).
- HKTDC-style one-pager section at top of country profile + exportable infographic.
- Profile trend charts (GDP & inflation line, unemployment, current account) with (e)/(f) forecast markers reusing Holt's output.

**T4. Real governance & leadership data** — *Federal +1*
- Replace mock leadership/ministries for the 12 seeds + **add IDN and SGP seeds** (both are named in the guide's examples; offline demo must cover them).
- Leadership cards: name, role, portfolio relevance, "what they'll likely raise" (LLM, cited).

### P1 — Impress-MOEI features

**T5. Meeting-countdown demo mode** — *Demo +3*
- Dashboard "Upcoming engagement" card: "Meeting with Brazil's Energy Minister — 15:00 min" → one click → agent run → readiness checklist (briefing ✓ talking points ✓ slides ✓ trade infographic ✓) with elapsed-time stamp.
- Pre-warm trick for live demos: cache-primed run so research streams fast; keep gemma compose visible as "composing" with streamed partials.

**T6. Voice assistant polish** — *Demo +1*
- Mic button on agent + chat (Web Speech API, ar-AE + en-US), spoken summary of BLUF via speechSynthesis. Graceful Chromium-only fallback.

**T7. Dynamic relationship graph** — *Technical +1*
- Nodes/edges computed from opportunity scores + Comtrade trade values + investment seed; edge width = trade value, node badge = total investment. Remove hardcoded data.

**T8. Branded slide deck export** — *Federal +1*
- Multi-slide PPTX: cover (classification banner) → country snapshot (IR one-pager) → trade/investment infographic + map → opportunities & risks → talking points. EN/AR variants.

### P2 — Cheap rubric points (documents + hardening)

**T9. Feasibility & deployment docs** — *Feasibility +4*
- `docs/data-strategy.md`: source catalog (90 sources), update cadence (6h cache / seed fallback), Comtrade/Tavily key handling, sustainability of updates.
- `docs/deployment-roadmap.md`: phases (pilot → MOEI prod), K8s UAE region, Ollama GPU sizing, SSO rollout, SIEM integration, NestJS v2.

**T10. Demo script & golden path** — *Demo +1*
- `docs/demo-script.md`: the Brazil scenario end-to-end (announce → select → research → brief → talking points → slides → ready), with timings, fallback path if offline, and which screens to show for each rubric criterion.

**T11. Hardening pass**
- E2E test for the golden demo path (agent run with mocked LLM, chat answer, exports).
- A11y/RTL audit on new views; i18n catalog entries for all new strings.
- `/log-milestone` + changelog when P0 lands.

### Suggested order & sizing
| Order | Task | Size |
|---|---|---|
| 1 | T1 chat responder | L |
| 2 | T2 trade/investment visuals + map | L |
| 3 | T3 IR one-pager + enrichment | M |
| 4 | T4 governance + IDN/SGP seeds | M |
| 5 | T5 countdown demo mode | M |
| 6 | T9 + T10 docs (parallelizable anytime) | S |
| 7 | T6 voice, T7 graph, T8 deck | S–M each |
| 8 | T11 hardening | M |
