# Country Intelligence Platform

AI-powered country intelligence platform for UAE government leadership. Centralized country profiles, real-time indicators, AI-generated executive briefings, video summaries, cross-country comparison, forecasting, and bilateral cooperation matching — all behind a 4-tier classification model with full audit + cost telemetry.

```
┌── /dashboard ──────────────────────────────────────────────────────┐
│  4 KPIs (live)        QuickActions (6 tiles)        World map      │
│  Countries: 12        ▸ Draft briefing             ▸ Recent feed   │
│  Indicators: 58       ▸ Ask AI                                     │
│  Auth datapoints 51   ▸ Forecast                                   │
│  Briefings/mo: live   ▸ Compare / Cooperation / Sources            │
└────────────────────────────────────────────────────────────────────┘
```

## Features

| Capability | What it does |
|---|---|
| **Multi-LLM router** | Anthropic (cloud) / OpenRouter (cloud) / Ollama (on-prem). Per-classification routing. Cloud blocked for `confidential`+ via server-side gate. |
| **RAG with grounding** | Understand → resolve → retrieve → rerank → generate → validate → safety. `<fig>` + `<cite>` tag grammar. Figure validator (±0.5% tolerance). Citation validator drops uncited claims. Abstention on low top-score / no entity coverage. |
| **Layered classification** | `org → dept → role → user` resolver. SSO ingestion (UAE PASS, Entra) with admin-override sticky. User can override within clearance ceiling. |
| **Briefings end-to-end** | List → new → AI-generate → persist (in-memory + DB) → detail → PDF/PPTX export. Cross-flow CTAs (Chat / Cooperation / Country). |
| **Per-dept budget caps** | Org/user/dept daily LLM spend caps. Pre-call gate returns 429 when `BUDGET_ENFORCE_BLOCK=true`. Live budget dashboard with progress bars. |
| **Cost telemetry** | Every LLM call logged with actor + actorDept + step + provider + model + tokens + USD. Aggregated by 7 dimensions. Month projection. CSV export. |
| **Safety filtering** | Prompt-injection screen (10 patterns). PII redact per classification. Sliding-window anomaly detector (5 events / 5 min). |
| **Trace + audit** | `x-request-id` propagation across 5 log streams. `pnpm log:trace <reqId>` joins access/audit/llm-calls/retrieval/chat by reqId. |
| **Accessibility** | WAI-ARIA tablist (arrow keys, Home/End). Focus trap in modals. `prefers-reduced-motion` respected. Skip-to-content. Screen-reader live regions on errors. Mobile drawer. |
| **i18n + RTL** | Full EN/AR catalog. `<html dir>` flips with locale. Logical CSS properties (`ms-`/`me-`/`start-`/`end-`). |

## Quick start

> Fresh machine? See **[docs/SETUP.md](docs/SETUP.md)** for the full
> prerequisite list (Node, pnpm, **ffmpeg for video export**, LLM providers,
> optional services) with per-OS install commands.

```bash
pnpm install
cp .env.example .env.local
# edit .env.local — at minimum set JWT_SECRET; optionally ANTHROPIC_API_KEY / OPENROUTER_API_KEY
pnpm dev                  # http://localhost:3000
# stub login: analyst@example.ae / demo  (also lead@ / exec@ / admin@)
```

Seed RAG corpus + run an eval:
```bash
pnpm seed:rag             # ingest mock + scripts/seed-rag-corpus.ts payloads
pnpm fetch:corpus         # pull Wikipedia + World Bank country pages into corpus
pnpm eval                 # scripts/eval-rag.ts
```

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 App Router · React 19 · TypeScript · Tailwind |
| LLM | Anthropic SDK · OpenRouter (OpenAI-compatible) · Ollama (on-prem) |
| RAG | Custom orchestrator · hashed mock embed (256d) or voyage / openai / Ollama bge-m3 |
| Auth | JWT HS256 cookie sessions · OIDC (UAE PASS / Entra) · stub login for dev |
| DB | PostgreSQL 16 (optional via `USE_DB=1`); falls back to in-process + JSONL |
| Export | `@react-pdf/renderer` · `pptxgenjs` |
| Obs | OpenTelemetry · pino · per-call cost telemetry · audit ring buffer |

## Layout

```
src/
├─ app/                      Next.js App Router pages + API
│  ├─ api/                   chat · rag · briefings · admin (cost/budget/audit/llm/org-policy/safety/users/rag)
│  ├─ admin/                 Admin panel (tabs, lazy-loaded)
│  └─ {dashboard,briefings,chat,country,compare,insights,cooperation,activity,settings,sources,video,login}/
├─ components/               UI (shell, shared, chat, briefings, dashboard, profile, video, cooperation, insights, compare)
├─ services/
│  ├─ llm/                   provider abstraction · budget · call-log · embed · rerank · pricing
│  ├─ rag/                   orchestrator · chunker · parser · validators · safety
│  ├─ policy/                org-policy · departments · user-departments · resolver
│  ├─ ingest/ + import/      data source classification + ingest runners
│  ├─ repo/                  briefings persistence (memory + DB)
│  └─ audit · chat-log · project-log · export
├─ lib/                      auth · i18n · hooks · data (countries, indicators, projects)
└─ types/                    shared types
```

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `JWT_SECRET` | yes | HS256 session signing. Generate with `openssl rand -base64 32`. |
| `ANTHROPIC_API_KEY` | one of | Cloud LLM. |
| `OPENROUTER_API_KEY` | one of | Cloud LLM aggregator. |
| `OLLAMA_BASE_URL` | optional | Defaults `http://localhost:11434`. On-prem LLM. |
| `VOYAGE_API_KEY` | optional | Cloud embeddings. Mock fallback (token-hashed 256d) when missing. |
| `OPENAI_API_KEY` | optional | Embeddings alternative. |
| `UAE_PASS_*` / `ENTRA_*` | optional | OIDC providers. See `.env.example`. |
| `DAILY_BUDGET_USD` | optional | Org-wide daily cap. |
| `PER_USER_DAILY_BUDGET_USD` | optional | Per-user cap. |
| `BUDGET_ENFORCE_BLOCK` | optional | `true` → return 429 on cap. Default alert-only. |
| `USE_DB`, `DATABASE_URL` | optional | Postgres persistence; else in-process + JSONL. |

## Commands

```bash
pnpm dev               # http://localhost:3000
pnpm build && pnpm start
pnpm typecheck         # tsc --noEmit
pnpm lint              # biome
pnpm test              # vitest
pnpm test:e2e          # playwright

pnpm eval              # RAG eval harness
pnpm seed:rag          # populate RAG corpus
pnpm fetch:corpus      # pull Wikipedia + World Bank pages
pnpm log:trace <reqId> # join 5 log streams by reqId

pnpm db:up             # docker compose postgres + redis + opensearch
pnpm db:migrate
pnpm db:seed
```

## Routes

| Path | Role | Purpose |
|---|---|---|
| `/dashboard` | viewer | KPIs · QuickActions · world map · recent briefings · freshness · watchlist |
| `/country/[iso3]` | viewer | Profile · sector tabs (?sector=) · indicators · timeseries · projects · CTAs to chat/insights/cooperation/compare/briefing |
| `/briefings` | viewer | List · ?filter=mine&class=internal&q=... · sortable · class filter chips |
| `/briefings/new` | analyst | Generator · ?country=XXX |
| `/briefings/[id]` | viewer | Detail · PDF/PPTX export · cross-flow CTAs |
| `/chat` | analyst | LLM workspace · session list · RAG toggle · classification picker · ?context=country:XXX · ?q=... |
| `/compare` | viewer | Side-by-side indicators · radar chart · ?add=XXX |
| `/insights` | analyst | Risk radar · Holt's forecast · benchmarks · ?country=XXX |
| `/cooperation` | analyst | Opportunity matchmaker · pipeline · graph · ?partner=XXX&view=... |
| `/sources` | analyst | 90-source catalog · import runner · file upload (xlsx/pdf/docx) · RAG ingest |
| `/activity` | viewer | Timeline · ?filter=...&q=... |
| `/video` | lead | Video script studio · 4 styles · 3 variants |
| `/admin` | admin | `#users` · `#sources` · `#audit` · `#health` · `#llm` · `#org` · `#rag` · `#safety` · `#cost` |
| `/settings` | viewer | Account · classification override (within clearance) · density · theme |

Press `Cmd/Ctrl+K` anywhere → command palette. Press `?` → keyboard help.

## Security model

- **Classification tiers**: `public < internal < confidential < secret`. Every record carries one.
- **Layered default**: `user > role > dept > org` resolver. Each layer clamped to user clearance.
- **Cloud-class gate**: cloud LLMs (Anthropic / OpenRouter) blocked server-side for `confidential` + `secret`. Forces on-prem (Ollama).
- **SSO**: OIDC with PKCE. UAE PASS or Entra. Stub login retained for dev.
- **Audit trail**: every state-changing action emits to `logs/audit.jsonl` + in-memory ring buffer. `pnpm log:trace <reqId>` reconstructs.
- **Anomaly detection**: sliding 5-event/5-min threshold per actor with cooldown.
- **Prompt-injection screen**: 10 pattern types checked on retrieved passages. Findings logged, suspicious passages excluded.
- **PII redact**: emails / phones / API-key shapes redacted before persistence per classification tier.
- **Budget enforcement**: hard 429 on org/user/dept caps when `BUDGET_ENFORCE_BLOCK=true`.

## Observability

5 log streams join on `x-request-id`:
- `logs/access.jsonl` — every HTTP request
- `logs/audit.jsonl` — every state-changing action
- `logs/llm-calls.jsonl` — every LLM call (provider, model, tokens, USD, dept)
- `logs/retrieval.jsonl` — every RAG retrieval (top-k, scores, abstention reasons)
- `logs/chat/<sessionId>.jsonl` — per-session chat transcript

All gitignored (Internal classification minimum).

Project history in `logs/{errors,fixes,todos,milestones,changelog,recap}.md` — append-only.

## Stopping the cycle

This README documents what's shipped at HEAD. To extend:
- Run `pnpm eval` to baseline RAG quality before changes
- Touch one provider/route at a time; budget gate is the safety net
- New admin panels: extract to `src/app/admin/_panels/{Name}.tsx` + `next/dynamic` import

## License

UNLICENSED — internal government use only.
