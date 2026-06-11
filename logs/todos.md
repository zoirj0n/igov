# TODOs log

Append-only. ID format: `TODO-NNN`. Status: `[ ] open | [~] in_progress | [x] done | [-] cancelled`.

---

## [2026-05-22 02:20] TODO-001 — Wire MapLibre / topojson for production map

- Status: [-] cancelled
- Closed-by: replaced with custom SVG WorldMap shared widget
- Area: components/shared/WorldMap

## [2026-05-22 02:20] TODO-002 — Replace mock indicators with DB-backed queries

- Status: [x] done · closed by MS-019
- Area: lib/data/indicators.ts → src/services/database.ts
- Notes: schema in db/migrations/0001_init.sql; seed in 0002_seed.sql.

## [2026-05-22 02:20] TODO-003 — SSE streaming for /api/chat

- Status: [x] done · closed by MS-012
- Area: src/app/api/chat/route.ts
- Notes: currently returns full response; switch to ReadableStream + token-by-token.

## [2026-05-22 02:20] TODO-004 — OIDC auth (UAE PASS + Entra)

- Status: [x] done · closed by MS-010
- Area: src/services/auth.ts, src/app/api/auth/**
- Blocking: pilot
- Notes: stub login → JWT (RS256, 15m) → refresh rotation; MFA required.

## [2026-05-22 02:20] TODO-005 — Audit log middleware

- Status: [x] done · closed by MS-010
- Area: src/services/audit.ts (new)
- Notes: every API request → `audit_events` table; classification on each row.

## [2026-05-22 02:20] TODO-006 — Real World Bank ingest script

- Status: [x] done · closed by MS-013
- Area: scripts/ingest-worldbank.ts (new)
- Notes: per data-source-curator subagent — use api.worldbank.org/v2; ISO2→ISO3.

## [2026-05-22 02:20] TODO-007 — Add IMD Smart City Index, IESE Cities in Motion to sources.csv

- Status: [x] done · closed by MS-020
- Area: data/sources.csv
- Notes: surfaced during /source query for UAE smart-city rankings.

## [2026-05-22 02:20] TODO-008 — Strict CSP without `unsafe-inline`

- Status: [x] done · closed by MS-016
- Area: next.config.ts
- Notes: nonce-based for Next.js; remove inline-script allowance.

## [2026-05-22 02:55] TODO-009 — Add Transport sector tab to country profile

- Status: [ ] open
- Area: src/components/profile/SectorTabs.tsx, SectorPanel.tsx, lib/i18n/messages.ts
- Blocking: scope completion
- Notes: brief calls out energy, infrastructure, **transport**, sustainability, economic. Currently 6 tabs missing transport.

## [2026-05-22 02:55] TODO-010 — Country profile: government structure + national priorities + key initiatives blocks

- Status: [ ] open
- Area: src/components/profile/SectorPanel.tsx (or new Overview component); lib/data/governance.ts
- Blocking: scope completion
- Notes: brief requires gov structure, key initiatives, partnerships, national priorities. Only strategic overview + projects in current build.

## [2026-05-22 02:55] TODO-011 — Briefing PDF + PPTX export

- Status: [x] done · closed by MS-011
- Area: src/app/briefings/[id]/page.tsx export buttons → src/services/export.ts (new)
- Blocking: pilot
- Notes: buttons currently stubs. Use `@react-pdf/renderer` for PDF, `pptxgenjs` for deck.

## [2026-05-22 02:55] TODO-012 — Real video render pipeline

- Status: [x] done · MS-018 (script) + MS-020 (storyboard/SRT) + MS-021 (playback/manifest)
- Area: src/app/api/videos/route.ts (new), src/services/video.ts
- Blocking: GA
- Notes: brief requires AI-powered short videos. Wire Remotion + ElevenLabs TTS or HeyGen API. Studio UI ready.

## [2026-05-22 02:55] TODO-013 — Command palette (⌘K) global search

- Status: [ ] open
- Area: src/components/shared/CommandPalette.tsx (new); shortcut in layout.tsx
- Notes: brief calls out "intelligent search" — cmd-K opens fuzzy search over countries · indicators · briefings · cooperation.

## [2026-05-22 02:55] TODO-014 — Predictive ML models (ARIMAX + anomaly + peer scoring)

- Status: [x] done · closed by MS-017
- Area: src/services/predict.ts (new); python sidecar OR ONNX runtime
- Blocking: GA
- Notes: insights forecast currently slider-driven. Brief requires "predictive and analytical insights". Need real time-series + risk model.

## [2026-05-22 02:55] TODO-015 — Classification enforcement on AI outputs

- Status: [x] done · closed by MS-015
- Area: src/services/ai.ts; src/services/audit.ts
- Blocking: pilot
- Notes: brief requires reliable, executive-grade output. AI outputs must inherit classification of input + refuse cross-tier elevation.

## [2026-05-22 02:55] TODO-016 — Wire ETL pipelines via subagents

- Status: [x] done · closed by MS-013
- Area: scripts/ingest-*.ts; .claude/agents/*-fetcher.yml
- Blocking: pilot
- Notes: 5 fetcher subagents specced. Schedule daily via Dagster/Airflow or cron. Real World Bank/IEA/IRENA pulls.

## [2026-05-22 06:24] TODO-017 — Wire UI to fetch live indicators from API

- Status: [x] done · closed by MS-014
- Area: src/app/country/[iso3]/page.tsx; src/components/dashboard/CountryGrid.tsx
- Notes: post-MS-013, /api/countries/[iso3]/indicators exposes live overlay. Convert client components to fetch this endpoint instead of importing INDICATORS module directly. Adds loading skeleton + error state.

## [2026-05-22 07:34] TODO-018 — Wire MP4 render pipeline (Remotion or HeyGen)

- Status: [x] done · closed by MS-021 (server MP4 render integration is now a connector job, not platform work)
- Area: src/services/video/render.ts (new); /api/videos/render
- Blocking: GA
- Notes: scripts now generated via Claude (MS-018). Need: Remotion server-side compile of scenes + TTS (ElevenLabs/OpenAI) for narration. Alternative: HeyGen API integration. ~2-3 day spike.

## [2026-05-22 08:20] TODO-019 — Real UAE PASS + Entra OIDC integration

- Status: [x] done · closed by MS-027
- Area: src/lib/auth/oidc.ts (new); src/app/api/auth/{uae-pass,entra}/{start,callback}/route.ts
- Blocking: pilot
- Notes: stub login works for dev. Production needs real OIDC dance: PKCE code flow, JWKS verification, identity proofing, MFA step-up. UAE PASS uses standard OAuth2/OIDC.

## [2026-05-22 08:20] TODO-020 — Additional ETL fetchers (IRENA, IMF, OECD, UN Comtrade)

- Status: [x] done · closed by MS-028 (WB extended + Ember best-effort; OECD/Comtrade → TODO-024)
- Area: src/services/ingest/{irena,imf,oecd,comtrade}.ts (new)
- Notes: World Bank wired (MS-013). IRENA + IMF + OECD + Comtrade have specs in `.claude/agents/*-fetcher.yml`. Each is a ~50-line fetcher following the worldbank.ts template.

## [2026-05-22 08:20] TODO-021 — Observability: OpenTelemetry instrumentation

- Status: [x] done · closed by MS-025
- Area: src/instrumentation.ts; src/lib/otel.ts
- Notes: Next.js native instrumentation hook. Need OTLP exporter env config. Trace API requests, DB queries, AI calls, ingest runs. Grafana/Tempo backend per docs/architecture.md.

## [2026-05-22 08:20] TODO-022 — Pilot deployment infra (k8s manifests, ArgoCD, CI)

- Status: [x] done · closed by MS-024
- Area: infra/k8s/{base,overlays/{dev,staging,prod}}; .github/workflows/*.yml
- Blocking: pilot
- Notes: Dockerfile + docker-compose live for local. Need: Kustomize base + 3 overlays, sealed-secrets for Vault, NetworkPolicy, ArgoCD Application manifest, GH Actions for lint/test/build/push/deploy.

## [2026-05-22 08:20] TODO-023 — Audit log forwarding to SIEM (Splunk/Sentinel)

- Status: [x] done · closed by MS-026
- Area: src/services/audit.ts (extend); src/lib/siem.ts (new)
- Blocking: pilot
- Notes: audit.jsonl is local. Production: structured syslog over TLS to org SIEM. Add transport with batch + retry + backpressure.

## [2026-05-22 09:56] TODO-024 — OECD + UN Comtrade ETL connectors

- Status: [~] in_progress · scaffold landed MS-030 · need dataflow ID discovery + Comtrade subscription key
- Area: src/services/ingest/{oecd,comtrade}.ts (new)
- Blocking: data breadth (not pilot)
- Notes: OECD uses SDMX-JSON (complex query strings, per-domain dataflow IDs). UN Comtrade v2 requires subscription key + has quota. Each ~80-100 LOC. Deferred until license/key acquired.

## [2026-05-22 09:56] TODO-025 — Ember CSV URL resolver

- Status: [x] done · closed by MS-029
- Area: src/services/ingest/ember.ts
- Notes: Ember rotates yearly CSV URL annually. Current candidate list may go stale. Options: (a) scrape ember-climate.org/data for current dataset link, (b) set EMBER_CSV_URL env per release, (c) use Ember API if/when published.

## [2026-05-23 00:29] TODO-026 — OECD SDMX dataflow discovery

- Status: [ ] open
- Area: src/services/ingest/oecd.ts; src/services/ingest/oecd-discovery.ts (new)
- Notes: SDMX dataflow IDs change per release. Need fetcher that queries https://sdmx.oecd.org/public/rest/dataflow/all and resolves metric → current dataflow + key structure. Cache resolved IDs for 30 days. Until then OECD ingest returns 404s gracefully.

## [2026-05-27 14:25] TODO-027 — wire dashboard refresh
- Actor: analyst@example.ae
- Owner: frontend
- Priority: med
- Status: [x] done · Closed-by: FIX-010
- Area: src/app/dashboard
- Classification: Internal

## [2026-06-10 03:06] TODO-028 — Voice assistant for spoken country queries

- Status: [x] done · Closed-by: FIX-007
- Area: src/components/chat, src/components/agent
- Blocking: n/a
- Notes: Challenge guide (docs/AI-Powered Global Country Intelligence Platform Challenge Guide.pdf, gap analysis 2026-06-10) lists voice assistant as an innovation differentiator ("Ask questions verbally, get instant answers"). No dedicated voice UI exists — only incidental "voice" references in AgentRunner.tsx, src/services/ai.ts, and the video manifest route. Needs mic input + speech-to-text routed into the existing chat/agent pipeline, with spoken or text answer. Bilingual EN/AR per project convention.

## [2026-06-10 03:06] TODO-029 — Arabic-first posture — flip default locale or prove AR parity

- Status: [x] done · Closed-by: FIX-009
- Area: src/lib/i18n
- Blocking: n/a
- Notes: Challenge guide (gap analysis 2026-06-10) requires "Arabic-first, voice, inclusive design". Current implementation is EN-default with an AR toggle (commit 7ec0033). Either flip the default locale to Arabic or make AR parity demonstrable in the demo flow.

## [2026-06-10 03:06] TODO-030 — Slides export from briefing generator

- Status: [x] done · Closed-by: FIX-006
- Area: src/app/api/export, src/components/briefings
- Blocking: n/a
- Notes: Guide (gap analysis 2026-06-10) lists "Slides — Ready-to-present materials" as a required briefing output. api/export exists but unverified for slide generation (related: TODO-011/MS-011 covered PDF + PPTX export buttons). Verify coverage; build slide export if missing.

## [2026-06-10 03:30] TODO-030 — scope narrowed after verification (update to TODO-030)

- Status: [x] done · Closed-by: FIX-006
- Notes: Verified 2026-06-10. Two PPTX paths exist: (1) renderBriefingPptx (src/services/export.ts:165) — full structured deck w/ classification stamp + ABAC + audit, but only reachable via /api/briefings/[id]/export for stored/seeded Briefing records; (2) AgentRunner live briefs → /api/export/onepager?format=pptx — SVG rasterized to PNG pasted on 1–2 slides (not editable text slides, no classification stamping). Narrowed scope: route live agent briefs through renderBriefingPptx (persist agent briefs as Briefing records, or add export endpoint accepting Briefing-shaped body); carry classification/ABAC/audit. NOT building slide export from scratch.
- Reference option: Presenton (https://github.com/presenton/presenton) — Apache 2.0 self-hosted AI deck generator, Docker, Claude-compatible, editable PPTX, REST API, custom Tailwind templates. Candidate polish layer only: adds Python/FastAPI runtime + second LLM pass (latency vs "seconds" bar); Arabic/RTL support unverified — blocker to confirm before adoption. Classification/audit must remain in our wrapper either way.

## [2026-06-10 03:36] TODO-031 — Fix pnpm build failure: /404 prerender "<Html> should not be imported outside of pages/_document" (ERR-004)

- Status: [x] done · Closed-by: FIX-005
- Area: build (Next.js prerender); next.config.ts; app-router error/not-found pages
- Blocking: deploy
- Notes: see ERR-004. `pnpm build` on clean main (5e9ee15) fails during "Generating static pages" — /404 prerender throws `<Html> should not be imported outside of pages/_document` (`.next/server/chunks/6011.js`), then `Export encountered an error on /_error: /404`. Pre-existing (reproduced via `git stash` + build); not from 2026-06-10 i18n changes. Next.js 15.5.18, app router; `pnpm dev` unaffected. Suspect an import of `next/document` or a dependency rendering a pages-router error shell during app-router /404 prerender — audit deps/chunk 6011 and add proper app-router `not-found.tsx`/`error.tsx` if missing.

## [2026-06-10 04:49] TODO-032 — On-prem speech-to-text for voice queries (Whisper)

- Status: [x] done · Closed-by: FIX-008
- Area: src/lib/hooks/useVoice.ts, infra
- Blocking: n/a
- Notes: Voice input (FIX-007) uses the browser Web Speech API; Chrome's recognition engine is cloud-backed, so spoken queries leave the device — a data-residency concern for Confidential+ content under the UAE-region mandate. Replace or complement with self-hosted Whisper (or UAE-region Azure Speech) behind an API route; TTS (speechSynthesis) is OS-local and fine.

## [2026-06-11 01:28] TODO-033 — Durable conversation store + voice orchestration for the AI assistant

- Owner: backend
- Priority: med
- Status: [ ] open
- Area: src/components/shell/AssistantFab.tsx, src/app/api/chat/ask, db/migrations
- Blocking: n/a
- Notes: The assistant's chat+call modes now share one in-memory history and session id (commit 7ebaae3), with the per-turn server chat log as the only durable copy. Follow-up for production: (1) Postgres conversations/messages tables (role, modality text|voice, content transcript as source of truth, optional audio_url to object storage, status complete|interrupted|partial) replacing the in-memory history, surviving navigation/reload; (2) summarize older turns into a running summary when history exceeds the context budget, keep last ~10 verbatim; (3) evaluate LiveKit Agents or Pipecat (both self-hostable, fit the on-prem mandate) to replace the hand-rolled VAD/barge-in/AEC plumbing in VoiceCallOverlay.tsx.
