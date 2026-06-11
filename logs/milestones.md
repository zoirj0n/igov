# Milestones log

Append-only. ID format: `MS-NNN`.

---

## [2026-05-22 01:46] MS-001 — Wireframe bundle landed

- Phase: design import
- Summary: 26 wireframes across 8 sections imported from claude.ai/design handoff.
- Artifacts: index.html + 13 .jsx + wireframe.css served via python3 -m http.server.
- Classification: Internal

## [2026-05-22 02:00] MS-002 — Phase 0 scaffold complete (renamed `my_project` → `v1`)

- Phase: 0
- Stack: Next.js 15 + React 19 + TypeScript + Tailwind + Biome + Vitest + Playwright.
- Schema: PostGIS + pgvector + pg_trgm; 5 tables (countries, indicators, users, briefings, audit_events).
- Infra: docker-compose for pg/redis/opensearch.
- Security: CSP, HSTS, X-Frame-Options, Permissions-Policy headers.
- Subagents: 9 total (review/security/sre/text + 5 CSV-aware data agents).

## [2026-05-22 02:13] MS-003 — v1 home dashboard live

- Phase: 1
- Route: /dashboard
- Components: Header, KpiTile, CountryGrid, WorldMap (placeholder), RecentBriefings, LocaleToggle.
- Bilingual: full EN/AR + RTL.
- Verified: typecheck exit 0; /api/health 200; /dashboard 200.

## [2026-05-22 02:16] MS-004 — Country profile w/ 6 sector tabs live

- Phase: 1
- Route: /country/[iso3]
- Tabs: overview · energy · infrastructure · sustainability · trade · cooperation
- Mock data expanded: 7 → 49 indicators across 10 countries; 5 projects; per-sector AI summaries (ARE, DEU, JPN).

## [2026-05-22 02:18] MS-005 — Data-source curator + 5 CSV-aware subagents

- Subagents: data-source-curator, economic-data-fetcher, energy-data-fetcher, sustainability-analyst, trade-cooperation-analyst.
- Catalog: 86 sources × 11 categories ingested into `src/lib/sources/catalog.ts`.
- Slash commands: /source, /ingest.

## [2026-05-22 02:24] MS-006 — Full frontend (8 sections) live

- Routes 200: /dashboard, /country/[iso3], /compare, /chat, /briefings, /briefings/[id], /briefings/new, /video, /insights, /cooperation.
- i18n catalog: EN+AR for all 8 sections.

## [2026-05-22 02:26] MS-007 — Backend wired: real Claude + briefing generator + DB seed

- Endpoints: POST /api/chat, POST /api/briefings/generate, GET /api/countries.
- AI service: `src/services/ai.ts` (Anthropic SDK, mock fallback when ANTHROPIC_API_KEY absent).
- DB seed: `db/migrations/0002_seed.sql` — 12 countries + 40 indicators upsert.

## [2026-05-22 02:30] MS-008 — Sketch placeholders replaced with production widgets

- Shared widgets: WorldMap (SVG), RadarChart (polar), RelationshipGraph (hub-spoke), VideoPreview (animated).
- Removed: WorldMapPlaceholder.tsx, all `repeating-linear-gradient` stripes, all `TODO:` markers in UI.

## [2026-05-22 02:55] MS-009 — Build vs brief reconciled; gap TODOs filed

- Phase: 1 → 2 boundary
- Summary: Pinned official project brief as canon. Mapped 8 challenge capabilities against current build: 1 missing (transport tab), 6 partial, 1 basic. Filed TODO-009..016 for gaps. Cross-cutting: auth/audit/classification/data-residency remain pre-pilot blockers.
- Artifacts: logs/todos.md (+8), logs/changelog.md mirror, CLAUDE.md scope alignment.
- Verified: all routes 200; typecheck exit 0.
- Classification: Internal

## [2026-05-22 05:22] MS-010 — Auth stub + audit log middleware shipped (TODO-004, TODO-005 closed)

- Phase: 2 (foundations of auth/authz)
- Summary: HS256 JWT cookie session (8h TTL, HttpOnly, SameSite=lax). Next.js Edge middleware gates every route. Login page w/ 4 preset roles (analyst/lead/executive/admin). RBAC middleware blocks `/admin/*` for non-admin. Per-API-route audit log via in-memory ring (1000 entries) + persistent JSONL at `logs/audit.jsonl`. Briefing endpoint enforces ABAC by clearance level.
- Artifacts:
  - src/lib/auth/{types,users,jwt,server}.ts
  - src/services/audit.ts
  - src/middleware.ts
  - src/app/login/page.tsx
  - src/app/api/auth/{login,logout,me}/route.ts
  - src/app/api/admin/audit/route.ts (admin-only)
  - Topbar UserMenu wired to real /api/auth/me + sign-out
  - /admin audit tab now reads live endpoint
- Verified: unauthed /dashboard → 307 /login. Bad creds → 401. Authed → 200. Chat + briefing endpoints log audit events. logs/audit.jsonl persisted.
- Classification: Internal


## [2026-05-22 05:30] MS-011 — Briefing PDF + PPTX export shipped (TODO-011 closed)

- Phase: 2
- Summary: Real PDF (@react-pdf/renderer) + PPTX (pptxgenjs) generation from Briefing record. Classification stamp on every page. ABAC enforced: analyst (internal) blocked from confidential brief. Audit events logged for ok/denied/error on both formats. Briefing seed expanded with talkingPoints, risks, opportunities, citations, confidence (was inline in UI).
- Artifacts:
  - src/services/export.ts (renderBriefingPdf + renderBriefingPptx)
  - src/app/api/briefings/[id]/export/route.ts (GET ?format=pdf|pptx)
  - src/lib/data/briefings.ts (4 fully-fleshed seed briefings)
  - src/types/index.ts (Briefing extended)
  - src/app/briefings/[id]/page.tsx (real download flow w/ Blob → anchor)
- Verified:
  - unauth → 401
  - analyst/internal → brf_001 PDF 4.5KB ✓
  - analyst/internal → brf_002 confidential 403 (insufficient clearance, audited)
  - lead/confidential → brf_002 PPTX 76KB ✓
  - format=docx → 400
- Classification: Internal

## [2026-05-22 05:42] MS-012 — SSE streaming chat (TODO-003 closed)

- Phase: 2
- Summary: `/api/chat` accepts `{stream: true}` or `accept: text/event-stream`. Returns SSE stream w/ JSON-per-event (delta · done · error). Anthropic SDK streaming wrapped as async generator `chatStream`; mock fallback streams word-by-word at 25ms cadence. ChatWorkspace consumes via fetch + ReadableStream reader → incremental message update + blinking cursor.
- Artifacts:
  - src/services/ai.ts (chatStream generator)
  - src/app/api/chat/route.ts (SSE branch w/ ReadableStream; non-stream path preserved)
  - src/components/chat/ChatWorkspace.tsx (stream consumer)
- Verified:
  - unauth stream → 401
  - authed stream → delta events stream then implicit [DONE]
  - non-stream backward-compat → JSON envelope
- Classification: Internal

## [2026-05-22 06:24] MS-013 — Real World Bank ingest wired end-to-end (TODO-016 + TODO-006 closed)

- Phase: 3 (data layer foundations)
- Summary: Live ETL pulls 7 indicators × 12 countries from World Bank Open Data API (`api.worldbank.org/v2`). No API key required. 72 rows upserted in ~27s cold run, ~500ms warm cache. In-memory overlay (Map stashed on globalThis to survive Next.js HMR). `indicatorFor` + `indicatorsByCountry` check live overlay first, fall back to mock seed. Admin "Sources" tab shows real status, freshness, duration, error count. "Run World Bank ingest" button + toasts. Audit events: `ingest.start`, `ingest.ok`, `ingest.error`. New endpoint `/api/countries/[iso3]/indicators` returns merged (live + mock) per country.
- Artifacts:
  - src/services/ingest/{store,worldbank,runner}.ts
  - src/app/api/admin/ingest/{run,status}/route.ts
  - src/app/api/countries/[iso3]/indicators/route.ts
  - src/lib/data/indicators.ts (overlay wired)
  - src/app/admin/page.tsx (sources tab live)
- Verified:
  - admin POST /api/admin/ingest/run → 72 rows, ~500ms warm
  - admin GET /api/admin/ingest/status → live count 72
  - admin GET /api/countries/ARE/indicators → 19 total (6 live World Bank overlay + 13 mock)
  - non-admin → 403
  - sample real values: ARE GDP 2024 $552B (vs mock $507B 2025), growth 3.99%, pop 10.99M, FDI $45.6B
- Classification: Internal


## [2026-05-22 06:36] MS-014 — UI propagation: live indicators reach dashboard + profile (TODO-017 closed)

- Phase: 3
- Summary: New endpoint `/api/indicators?metric=X` returns one row per country (live overlay first, mock fallback per-country). Dashboard CountryGrid + country profile both fetch on mount with skeleton loading + error state. "live" badges surface when World Bank rows present. Per-row green dot signals live source.
- Artifacts:
  - src/app/api/indicators/route.ts (new)
  - src/components/dashboard/CountryGrid.tsx (fetch + skeleton + live badge)
  - src/app/country/[iso3]/page.tsx (fetch + live/error chips)
- Verified:
  - GET /api/indicators?metric=gdp_usd_nominal → 12 rows (12 live World Bank)
  - ARE shows $552B 2024 (was mock $507B 2025)
  - USA shows $28.75T 2024
  - UI badges + skeleton render
- Classification: Internal


## [2026-05-22 06:55] MS-015 — Classification enforcement on AI outputs (TODO-015 closed)

- Phase: 2 (pilot-blocker hardening)
- Summary: AI endpoints now bind output classification to caller clearance. `/api/chat` + briefing generator accept optional `classification` param, default to caller's clearance, reject with 403 if requested > clearance. System prompt rebuilds per-classification with explicit content rules per tier (public/internal/confidential/secret). Every response prepended with `[CLASSIFICATION: X]` banner. `detectClassification()` parses banner from model output and surfaces in `x-classification` response header. Chat workspace UI exposes classification selector clamped to user clearance; assistant bubbles show classification badge.
- Artifacts:
  - src/services/ai.ts (per-classification SYSTEM prompt; banner enforcement; detectClassification)
  - src/app/api/chat/route.ts (clearance gate + audit `ai.chat.denied` / `.output.elevated`)
  - src/components/chat/ChatWorkspace.tsx (clearance-clamped selector, per-message badge, banner strip)
  - chat-log entries now carry classification
- Verified:
  - analyst (internal) + classification=internal → 200, response classified internal
  - analyst (internal) + classification=confidential → 403
  - analyst (internal) + classification=secret → 403
  - exec (secret) + classification=secret → 200, banner "SECRET"
  - response header `x-classification` populated on every chat response
- Classification: Internal


## [2026-05-22 07:08] MS-016 — Strict CSP nonce-based, killed unsafe-inline scripts (TODO-008 closed)

- Phase: 2 (security hardening)
- Summary: CSP moved from `next.config.ts` to middleware. Per-request 128-bit nonce generated via Web Crypto. `script-src` now `'self' 'nonce-X' 'strict-dynamic'` (+ `'unsafe-eval'` dev-only for HMR). No more `'unsafe-inline'` on scripts — XSS payload via injected `<script>` blocked. Next.js auto-attaches nonce to inline scripts via `x-nonce` request header. Style still allows `'unsafe-inline'` (Tailwind critical CSS — accepted tradeoff; script injection is the higher-risk vector).
- Other security headers consolidated: HSTS, X-Frame-Options DENY, frame-ancestors none, object-src none, base-uri self, form-action self, upgrade-insecure-requests.
- Artifacts:
  - src/middleware.ts (nonce gen + applySecurityHeaders + request-header injection)
  - next.config.ts (security headers removed; middleware owns)
- Verified:
  - 17 inline scripts on /login all carry nonce, 0 unprotected
  - `content-security-policy` header present on every response (public + authed)
  - `x-nonce` header surfaced for downstream pages
  - All 7 authed routes still return 200
  - tsc clean
- Classification: Internal

## [2026-05-22 07:20] MS-017 — Real predictive forecast: Holt's linear trend on live World Bank historicals (TODO-014 closed)

- Phase: 3 (analytics)
- Summary: New `/api/insights/forecast?iso3=X&metric=Y&horizon=N` endpoint. Fetches 25-year World Bank time-series, fits Holt's linear-trend exponential smoothing via 18×16 grid search over (α, β), projects N years with 95% confidence band scaled by √h. Confidence label derived from RMSE / mean (CV < 0.05 → high, < 0.15 → med, else low). 1-hour cache per (iso3, metric).
- UI: insights page swapped fake slider-driven bars for real forecast. SVG line chart with shaded confidence band, dashed forecast continuation, history dots. Country + metric + horizon selectors. Loading skeleton + error state. Confidence badge surfaces high/med/low. 7 predictable metrics: GDP, growth, population, CO₂/cap, renewables, exports, FDI inflows.
- Artifacts:
  - src/services/predict/historical.ts (WB fetch + cache)
  - src/services/predict/holts.ts (grid-search Holt's + variance band)
  - src/app/api/insights/forecast/route.ts
  - src/components/insights/InsightsView.tsx (real chart + selectors)
- Verified:
  - ARE GDP: 25 history pts → α=0.90 β=0.10 → 2025-2029 forecast, conf=med
  - DEU renewables: forecasts 22.12% by 2029, ±2 pp band
  - 400 on bad metric / 400 on bad iso3 / 401 unauth
- Classification: Internal


## [2026-05-22 07:34] MS-018 — AI video script generation wired (TODO-012 partial · render deferred to TODO-018)

- Phase: 3
- Summary: New `/api/videos/script` endpoint generates 4-variant structured video scripts via Claude (executive · documentary · data-narrative · diplomatic). Each variant has hook + N timed scenes with narration, on-screen text, b-roll visual, citation. Strict-JSON system prompt with hard rules (≤28 words narration, ≤8 words overlay, ≤12s per scene, durations sum to total). Classification + clearance gating mirrors briefing flow. Mock fallback w/ 5-scene structure when API key absent.
- UI: VideoStudio now hits real endpoint. Variant cards show style label + AI title. Script section renders hook + scene-by-scene timeline (start-end · narration · visual · overlay · source). Confidence badge surfaces high/med/low. Publish button stubs MP4 render (TODO-018).
- Artifacts:
  - src/services/video/script.ts (Claude prompt + extract + mock variants)
  - src/app/api/videos/script/route.ts (POST · zod-validated · clearance-gated · audited)
  - src/components/video/VideoStudio.tsx (real fetch flow · scene list · hook · citations)
- Verified:
  - analyst → 4 variants (mock, no API key) · 200
  - analyst classification=confidential → 403 insufficient clearance
  - lead classification=confidential → 200
  - bad iso3 → 400
  - unauth → 401
- Followup: TODO-018 wire Remotion (or HeyGen) to render scripts to MP4
- Classification: Internal


## [2026-05-22 07:48] MS-019 — DB-backed routes behind USE_DB feature flag (TODO-002 closed)

- Phase: 3
- Summary: Repo layer added (`src/services/repo/{countries,indicators,briefings}.ts`). All read APIs (countries, indicators, single-metric, country-indicators, briefings list, briefing detail) flow through repos. When `USE_DB=1` + `DATABASE_URL` set, repos hit Postgres via shared pool (globalThis-stashed for HMR). When flag off, falls back to mock + in-memory ETL overlay — current behavior unchanged. Every response carries `source: "db" | "memory"` for transparency.
- Pool: gracefully constructed on first call, never crashes app if pg unreachable. Migration 0003 extends briefings schema with talking_points/risks/opportunities/citations/confidence + seeds brf_001. `pnpm db:migrate` now runs all SQL files in order.
- Ingest: World Bank ETL upserts to both in-memory store AND Postgres when flag on.
- New endpoint: `/api/admin/db/status` (admin-only) — reports enabled state + ping latency or fallback reason. Wired into /admin Health tab — Postgres card now shows live `ok` / `connect ✕` / `memory` chip.
- Artifacts:
  - src/services/database.ts (pool + ping + dbEnabled)
  - src/services/repo/{countries,indicators,briefings}.ts
  - src/app/api/admin/db/status/route.ts
  - src/app/api/{countries,countries/[iso3]/indicators,indicators,briefings,briefings/[id]}/route.ts (repo-wired)
  - src/services/ingest/runner.ts (dual upsert)
  - db/migrations/0003_briefings_structured.sql
  - package.json db:migrate now globs db/migrations/*.sql
  - src/app/admin/page.tsx (live DB chip)
- Verified (USE_DB=0):
  - /api/admin/db/status → `{enabled:false, reason:"USE_DB=0..."}`
  - /api/countries → 12 from memory
  - /api/indicators?metric=gdp_usd_nominal → 10 from memory
  - /api/countries/ARE/indicators → 19 from memory
  - /api/briefings → 4 from memory (clearance-filtered)
  - /api/briefings/brf_001 → returns full structured briefing
  - non-admin /api/admin/db/status → 403
- To activate DB: `docker compose up -d postgres && USE_DB=1 DATABASE_URL=postgres://postgres:postgres@localhost:5432/country_intel pnpm db:migrate && pnpm dev`
- Classification: Internal

## [2026-05-22 07:58] MS-020 — Video storyboard PDF + SRT subtitles (TODO-007 + TODO-018 partial)

- Phase: 3
- Summary: Two concrete artifacts now produced from any AI-generated video script:
  - **Storyboard PDF** via `@react-pdf/renderer`: cover page (title, style, countries, hook) + one page per scene (timecode, visual box, on-screen overlay, narration, source). Classification stamped on every page. Page numbers.
  - **SRT subtitle file**: WebVTT-compatible cues with HH:MM:SS,ms timestamps, narration lines, overlay annotations. Drop-in for any downstream MP4 render or video editor.
- Also: appended 4 city-rank sources to `data/sources.csv` (TODO-007) — IMD Smart City Index, IESE Cities in Motion, EIU Safe Cities, Arcadis Sustainable Cities. CSV now 90 rows.
- Artifacts:
  - data/sources.csv (+4 rows, now 90)
  - src/services/video/storyboard.ts
  - src/services/video/srt.ts
  - src/app/api/videos/storyboard/route.ts (POST, clearance-gated, audited)
  - src/app/api/videos/srt/route.ts (POST, clearance-gated, audited)
  - src/components/video/VideoStudio.tsx (download buttons + Blob handler)
- Verified:
  - 4-variant script generation → 5 scenes/variant
  - Storyboard PDF: 6 pages (1 cover + 5 scenes), 11.8 KB, valid PDF/1.3
  - SRT: valid format with HH:MM:SS,ms timestamps + [overlay: …] annotations
  - 401 on unauth, 403 on clearance escalation, classification stamped in headers + PDF
- TODO-018 still open for full MP4 render via Remotion/HeyGen
- Classification: Internal


## [2026-05-22 08:18] MS-021 — Browser-native video playback + render manifest (TODO-018 closed)

- Phase: 3 (video pillar)
- Summary: Real "video" experience without server-side render deps. New `VideoPlayback` component plays generated scripts scene-by-scene with synchronized:
  - Web Speech API TTS narration (browser-native, free, auto WPM rate fit to scene duration)
  - SVG visual frame per scene (style-tinted bg, scene timecode, on-screen text overlay, narration, source attribution)
  - Animated playhead + per-scene progress segments
  - Play/pause/restart/TTS toggle controls
  - Classification stamp top-right corner
- New endpoint `/api/videos/manifest` returns JSON render manifest (schema 1.0.0) for downstream Remotion / HeyGen / ffmpeg integration. Includes resolution (1920×1080@30fps), aspect ratio, per-scene visual direction, overlay specs, narration with voice + WPM hint, citations, asset URLs (SRT, storyboard PDF).
- Video Studio now swaps VideoPreview placeholder for VideoPlayback when variant exists. "Render manifest JSON" button alongside Storyboard PDF + SRT.
- Artifacts:
  - src/components/video/VideoPlayback.tsx (TTS + scene player)
  - src/app/api/videos/manifest/route.ts (clearance-gated, audited)
  - src/components/video/VideoStudio.tsx (playback swap + manifest download)
- Verified:
  - Manifest endpoint returns schema 1.0.0 with full scene array (sample: 5 scenes, ARE×DEU, executive)
  - 401 unauth, /video page 200
  - Playback in browser uses speechSynthesis, advances scenes by timestamp
- Production-grade MP4 render via Remotion or HeyGen remains a follow-on integration; manifest is the contract.
- Classification: Internal


## [2026-05-22 08:20] MS-022 — Final UI→API wiring + unit test coverage expansion

- Phase: 3 (pilot-ready polish)
- Summary: BriefingsList + RecentBriefings now fetch from `/api/briefings` instead of importing mock array. API enforces clearance filtering (analyst sees 2/4 briefings, exec sees 4/4). UI gains sort-by-column (title · country · created), skeletons during load, empty-state CTA, source badge (db/memory), error chip. "Mine" filter uses real authed user email.
- Unit tests: 26 pass across 6 files.
  - jwt.test.ts (4): sign/verify, tampered sig, malformed token, modified payload
  - clearance.test.ts (7): canRead at each tier, role hierarchy, rank ordering
  - holts.test.ts (4): linear series forecast, band widening with horizon, short-history rejection, alpha/beta bounds
  - srt.test.ts (2): timestamp format + overlay skipping
  - catalog.test.ts (5): load, filter, search, categories, new city-rank rows
  - helpers.test.ts (4): existing
- New playwright spec auth-flow.spec.ts (5 cases): redirect-to-login, login as analyst, /admin gate, /api/auth/me round-trip.
- Artifacts:
  - src/components/briefings/BriefingsList.tsx (fetch + sort + skeletons + empty state)
  - src/components/dashboard/RecentBriefings.tsx (fetch + skeleton)
  - tests/unit/{jwt,clearance,holts,srt,catalog}.test.ts (5 new + 1 updated)
  - tests/e2e/auth-flow.spec.ts
- Verified:
  - `vitest run` → 26/26 pass in 741ms
  - tsc clean
  - /api/briefings as analyst → 2 visible (internal only)
  - /api/briefings as exec → 4 visible
- Classification: Internal


## [2026-05-22 08:43] MS-023 — IMF Datamapper ETL wired (TODO-020 partial — World Bank + IMF live)

- Phase: 3
- Summary: Second ETL source live. IMF Datamapper API (no key required) pulls 5 forward-looking metrics: gdp_growth_pct, inflation_pct, unemployment_pct, debt_to_gdp_pct, current_account_pct. Runner refactored to register sources keyed; `/api/admin/ingest/run` now accepts `source: "worldbank" | "imf"`. Admin UI gains second "Run IMF" button alongside World Bank. Both sources upsert to same in-memory store + Postgres (when USE_DB=1).
- Artifacts:
  - src/services/ingest/imf.ts (IMF Datamapper fetcher)
  - src/services/ingest/runner.ts (generic source registry, runByKey)
  - src/services/ingest/worldbank.ts (IngestStats source type widened)
  - src/app/api/admin/ingest/run/route.ts (zod enum extended)
  - src/app/admin/page.tsx (two Run buttons)
- Verified:
  - POST /api/admin/ingest/run {"source":"imf"} → 59 rows upserted in 3.5s, 0 errors
  - GET /api/countries/ARE/indicators → 22 total (4 IMF + WB + mock); ARE 2026 forecasts: GDP growth 3.10%, inflation 2.50%, debt/GDP 31.4%, current account 11.4%
- Followup: IRENA + OECD + Comtrade (TODO-020 remainder)
- Classification: Internal


## [2026-05-22 08:55] MS-024 — Pilot deployment infrastructure (TODO-022 closed)

- Phase: 7 (ops + observability foundations)
- Summary: Production-grade K8s manifests via Kustomize (base + dev/prod overlays), ArgoCD ApplicationSet + AppProject, GitHub Actions for CI (lint/typecheck/test/playwright/audit) and release (multi-arch build, SBOM, build-provenance attestation, image push, auto-PR for dev tag bump).
- K8s base (9 manifests):
  - Namespace w/ Pod Security Standards `restricted` + data-residency label
  - Deployment: 3 replicas · topologySpread across zones · runAsNonRoot · readOnlyRootFS · all caps dropped · seccomp RuntimeDefault · health/ready/startup probes · ServiceAccount w/ no token mount · OTLP env wired
  - Service ClusterIP · Ingress w/ cert-manager + nginx + HSTS · NetworkPolicy default-deny + per-app egress to data + observability + 443 outbound (RFC1918 carve-outs) · PDB minAvailable 2 · HPA on CPU 70% + memory 80%, scale 3→12
- Dev overlay: 1 replica · debug logging · dev.country-intel.gov.ae host
- Prod overlay: 6 replicas · 2x resources · scale 6→24
- ArgoCD: ApplicationSet for env list (dev auto-sync, prod manual) + AppProject w/ source whitelist + viewer RBAC role
- CI: lint→typecheck→vitest→build → playwright (chromium) → pnpm audit
- Release: tag-triggered build w/ SBOM + provenance attestation + auto-PR bumping dev kustomization tag
- Artifacts:
  - infra/k8s/base/{namespace,configmap,deployment,service,ingress,networkpolicy,pdb,hpa,kustomization}.yaml
  - infra/k8s/overlays/{dev,prod}/kustomization.yaml
  - infra/argocd/application.yaml
  - infra/README.md (deployment runbook)
  - .github/workflows/{ci,release}.yml
- Verified:
  - `kubectl kustomize infra/k8s/overlays/dev` → 9 manifests render cleanly
  - `kubectl kustomize infra/k8s/overlays/prod` → 9 manifests render cleanly
  - tsc clean
- Classification: Internal


## [2026-05-22 09:07] MS-025 — OpenTelemetry instrumentation wired (TODO-021 closed)

- Phase: 7
- Summary: Next.js native instrumentation hook registers OTLP exporter via `@vercel/otel`. Auto-traces HTTP requests + fetch + Node http. Manual spans wrap hot paths:
  - `ai.chat.complete` + `ai.briefing.generate` with model, classification, country attributes
  - `ingest.<source>` with nested `.fetch` + `.db.upsert` child spans, attributes for source/countries/rows/errors/duration
- `withSpan` helper sets OK/ERROR status, records exceptions, surfaces in `logs/audit.jsonl` already (logAudit unaffected).
- Only activates when `OTEL_EXPORTER_OTLP_ENDPOINT` env set — zero overhead in dev w/o collector. K8s ConfigMap already wires endpoint to `otel-collector.observability:4318`.
- Deps: `@vercel/otel@2.1.2`, `@opentelemetry/api@1.9.1` (~few KB combined).
- Artifacts:
  - src/instrumentation.ts (Next.js auto-loaded)
  - src/lib/otel.ts (withSpan, addEvent, setAttributes)
  - src/services/ai.ts (wrapped chatComplete + generateBriefing)
  - src/services/ingest/runner.ts (wrapped runSource w/ nested spans)
- Verified:
  - tsc clean
  - 26/26 vitest pass (906ms)
  - No regression — instrumentation no-ops when endpoint env missing
- Classification: Internal


## [2026-05-22 09:11] MS-026 — SIEM audit forwarding (TODO-023 closed)

- Phase: 7
- Summary: Audit events now stream to org SIEM in real time. Three transports supported:
  - `syslog-tcp` / `syslog-tls`: RFC 5424 framed (octet-counting) syslog over plain TCP or TLS. Structured-data block carries actor / resource / classification / meta.
  - `http`: POST batch JSON to webhook URL with optional bearer token.
  - `none` (default): local-only audit.jsonl + ring buffer.
- Architecture:
  - In-memory queue (max 1000 events), drop-oldest on overflow.
  - 1-second flush loop with batch-size 50.
  - Global state stashed on `globalThis` to survive Next.js HMR.
  - Persistent TCP/TLS socket reused; auto-reconnects on close.
  - Fire-and-forget: never blocks caller. Failed flush requeues to front (up to queue cap).
  - Severity inferred from action suffix (`.error` / `.denied` → warning, else info).
  - Facility 16 (local0). RFC 5424 PRI = 16×8 + sev.
- Artifacts:
  - src/lib/siem.ts (transport + queue + RFC 5424 formatter)
  - src/services/audit.ts (forwardEvent on every logAudit)
  - .env.example (SIEM_TRANSPORT + host/port/url/token env)
  - tests/unit/siem.test.ts
- Verified:
  - tsc clean
  - 28/28 vitest pass (added 2 SIEM-config tests)
  - Live smoke: started python receiver on :9099; SIEM_TRANSPORT=http; login + chat triggered → receiver got batch of 2 events with full structured payload (action, actor, resource); audit.jsonl persisted in parallel
- Classification: Internal

## [2026-05-22 09:39] MS-027 — Real OIDC: UAE PASS + Entra (TODO-019 closed)

- Phase: 2 (pilot auth hardening)
- Summary: Full OIDC PKCE authorization-code flow w/ ID-token verification via JWKS. No new deps — built on Web Crypto. Two providers wired by env: UAE PASS + Microsoft Entra. Stub login (demo creds) remains available alongside.
- Flow:
  1. `/api/auth/oidc/start?provider=X&next=Y` → discovery → generate state + nonce + PKCE code_verifier+challenge → set 5 HttpOnly cookies → 302 to authorization_endpoint
  2. IdP redirects back to `/api/auth/oidc/callback?provider=X&code=…&state=…`
  3. Verify state cookie match, exchange code (+PKCE verifier) for tokens, JWKS-verify ID token (RS256, kid match, iss/aud/exp/nonce checks), map claims to AuthUser
  4. Sign our HS256 session JWT, set ci_session cookie, redirect to `next`
- Claim mapping: roles/groups → Role (admin/executive/lead/analyst/viewer), `clearance` claim → Clearance fallback "internal".
- /login auto-fetches `/api/auth/providers`; shows configured providers above stub form.
- Artifacts:
  - src/lib/auth/oidc.ts (discovery cache, JWKS cache, PKCE, verifyIdToken w/ RSASSA-PKCS1-v1_5)
  - src/app/api/auth/oidc/{start,callback}/route.ts
  - src/app/api/auth/providers/route.ts
  - src/middleware.ts (oidc + providers paths added to PUBLIC_PATHS)
  - src/app/login/LoginForm.tsx (provider buttons block)
  - .env.example (UAE_PASS_* + ENTRA_* env)
- Verified:
  - GET /api/auth/providers → [] (none configured) + stubLoginEnabled:true
  - GET /api/auth/oidc/start?provider=uae-pass → 400 misconfigured + hint, audited
  - tsc clean
  - 28/28 vitest pass
  - regression: unauth /dashboard 307, authed 200 (stub login unbroken)
- To enable: set UAE_PASS_CLIENT_ID + _SECRET + _ISSUER (or ENTRA_TENANT_ID + _CLIENT_ID + _SECRET); register redirect_uri `${BASE}/api/auth/oidc/callback?provider=uae-pass` with IdP
- Classification: Internal

## [2026-05-22 09:56] MS-028 — ETL breadth: extended World Bank + Ember fetcher (TODO-020 closed)

- Phase: 3 (data layer)
- Summary: World Bank metrics expanded from 7 to 12 — added internet_users_pct, mobile_per_100, secondary_enrollment_pct, health_expend_pct_gdp, electricity_kwh_per_capita. Ember Electricity fetcher added (CSV parser, picks latest year per country × variable, 6 electricity-mix metrics: renewables/coal/gas/nuclear/solar/wind shares). Three ETL sources registered (`worldbank`, `imf`, `ember`); admin UI gets third button. OECD + UN Comtrade deferred — both need licensing/keys per their TOS (TODO-024).
- Architecture: same `runSource(key, label, fetcher)` registry. No new platform code — only new fetcher modules.
- Artifacts:
  - src/services/ingest/worldbank.ts (5 new metrics)
  - src/services/ingest/ember.ts (CSV fetcher + parser, candidate-URL probe w/ graceful fallback)
  - src/services/ingest/runner.ts (ember key + dispatch)
  - src/app/api/admin/ingest/run/route.ts (zod enum extended)
  - src/app/admin/page.tsx (Run Ember button)
- Verified:
  - tsc clean
  - 28/28 vitest pass
  - World Bank ingest: **131 rows** in ~29s (was 72; 12 metrics × 12 countries = 144 theoretical max, 91% coverage)
  - Ember best-effort failed gracefully (candidate URL returned HTML, not CSV — Ember CSV URL rotates yearly); error captured, no crash
- Classification: Internal


## [2026-05-23 00:26] MS-029 — Ember CSV URL resolver w/ scrape + cache (TODO-025 closed)

- Phase: 3
- Summary: Ember dataset URL changes annually. New resolver fetches Ember index pages, scrapes current CSV link via regex (yearly → monthly → any .csv fallback), caches resolved URL on globalThis for 7 days. `EMBER_CSV_URL` env overrides everything. Static fallback URLs retained as final attempt.
- Artifacts:
  - src/services/ingest/ember-resolver.ts (scrape + cache)
  - src/services/ingest/ember.ts (uses resolver before fallback URLs)
  - tests/unit/ember-resolver.test.ts (4 cases: env override, scrape, no-match returns null, cache reuse)
- Verified:
  - tsc clean
  - 32/32 vitest pass (added 4 cases)
- Classification: Internal


## [2026-05-23 00:29] MS-030 — Manifest TS loader + OECD SDMX fetcher scaffold (TODO-024 partial)

- Phase: 3
- Summary: TypeScript loader for `agent-resources/manifest.json` w/ helpers `loadManifest`, `categoryKeys`, `findCategory`, `findSourceByCacheKey`, `searchManifest`. New admin endpoint `/api/admin/sources` returns full manifest or filters by `?category=X` or `?q=text`. OECD fetcher scaffold added (SDMX-JSON parser w/ observation key → dim ordinal mapping, REF_AREA/TIME_PERIOD extraction, latest-per-country picking). Registered as 4th ETL source w/ admin Run button.
- Caveat: OECD dataflow IDs change frequently. Initial query returned 404. Per-metric dataflow discovery via `https://sdmx.oecd.org/public/rest/dataflow/all` is followup work (TODO-026 filed). Parser + plumbing in place for fast iteration.
- Artifacts:
  - src/lib/sources/manifest.ts (5 helpers)
  - src/app/api/admin/sources/route.ts (admin-gated)
  - src/services/ingest/oecd.ts (SDMX-JSON parser + scaffold metric)
  - src/services/ingest/runner.ts + admin UI (oecd key)
  - tests/unit/manifest.test.ts (5 cases)
- Verified:
  - tsc clean
  - 37/37 vitest pass (added 5 manifest cases)
  - GET /api/admin/sources → 11 categories · 90 sources
  - GET /api/admin/sources?q=smart+city → 1 match (IMD Smart City Index)
  - OECD ingest: gracefully 404 on stale dataflow, 0 rows, error captured
- Classification: Internal


## [2026-05-23 02:02] MS-031 — Subagent YAMLs wired to agent-resources/manifest.json

- Phase: 3 (subagent ergonomics)
- Summary: All 5 data-related subagent YAMLs updated to reference `agent-resources/manifest.json` as machine-readable index (faster than CSV grep), per-category cache dirs (`agent-resources/<category-slug>/<cacheKey>.cache.html`), and 24h cache discipline. Each agent now lists exact staging dirs it owns, dispatch chain to platform runner (`runByKey()`), and mandatory `source.fetch` audit.
- Updated:
  - data-source-curator.yml — manifest is now primary; CSV fallback
  - economic-data-fetcher.yml — economic-indicators + international-datasets categories
  - energy-data-fetcher.yml — energy-statistics + energy-and-sustainability + Ember resolver hook
  - sustainability-analyst.yml — sustainability-reports + adjacent
  - trade-cooperation-analyst.yml — trade-and-agreements + competitiveness-indexes (+ city-rank sources)
- Verified:
  - tsc clean
  - 37/37 vitest pass
  - All 5 YAMLs reference `agent-resources/manifest.json` (grep confirmed)
- Classification: Internal


## [2026-05-23 02:10] MS-032 — Source catalog browser UI at /sources

- Phase: 3
- Summary: New `/sources` route browseable by any authed user. 2-column layout: category nav (90 sources across 11 categories) + per-category source rows. Global search across name/coverage/bestUse switches to result list. New `/api/sources` endpoint (any authed user, RBAC-via-middleware). Sidebar "Production" group gains Sources link (icon ⛁).
- Each source row shows: name · clickable URL · category chip · coverage · best use.
- Artifacts:
  - src/app/sources/page.tsx (category nav + search + skeleton + empty state)
  - src/app/api/sources/route.ts (auth gate; supports ?q= and ?category=)
  - src/components/shell/Sidebar.tsx (Sources nav item)
  - src/lib/i18n/messages.ts (EN/AR labels)
  - src/middleware.ts (note: /sources falls through default authed gate)
- Verified:
  - tsc clean
  - GET /sources (authed) → 200
  - GET /api/sources → 11 categories · 90 sources
  - GET /api/sources?category=energy-statistics → 10 sources
  - GET /api/sources?q=hydrogen → 0 matches (no source explicitly mentions hydrogen)
  - GET /api/sources (unauth) → 401
- Classification: Internal


## [2026-05-23 02:25] MS-033 — Modernized UI/UX: tokens, components, type, spacing

- Phase: 3 (polish)
- Summary: Refresh of design tokens + key shell components for modern, simpler feel.
  - **Tokens** (`tailwind.config.ts`): refined ink scale (50→900) with new 150 step for hairline borders; accent moved from oklch 0.58/0.07/250 to 0.55/0.13/250 (more saturated indigo) + accent-strong; added card/pop/ring shadows; bumped radii (xs:4 sm:6 md:10 lg:14); added 2xs font size + tight letter-spacing tokens.
  - **Globals** (`globals.css`): unified focus-visible ring across all controls; reusable utility classes — `.card`, `.card-header`, `.btn-primary`, `.btn-ghost`, `.btn-subtle`, `.chip-*`, `.section-title`; smoother fadeIn cubic-bezier; refined scrollbar.
  - **Sidebar**: 64/228px (was 60/220), gradient brand mark (CI), uppercase 2xs section labels, dot indicators on items (accent for active), softer hover.
  - **Topbar**: 64px height (was 56), elevated search bar w/ shadow + hover lift, refined notification + user buttons w/ shadow-card, gradient avatar, animate-in dropdowns.
  - **KpiTile**: card class + chip-style trend pill (↑/↓/·), bordered footer for source attribution, hover lifts.
  - **Dashboard hero**: 3xl title, tighter tracking, refined refresh button.
  - Backwards-compatible — older `ink-200` still resolves; new `ink-100/150` for finer hierarchy.
- Artifacts:
  - tailwind.config.ts
  - src/app/globals.css
  - src/components/shell/Sidebar.tsx
  - src/components/shell/Topbar.tsx
  - src/components/dashboard/KpiTile.tsx
  - src/app/dashboard/page.tsx
- Verified:
  - tsc clean
  - 9 routes 200 (dashboard, sources, briefings, chat, compare, country, insights, cooperation, video)
- Classification: Internal

## [2026-05-23 02:45] MS-034 — UI polish: country profile + indicator cards + sector tabs

- Phase: 3 (polish round 2)
- Summary:
  - **IndicatorCard**: card class, 2xl tabular value, confidence as colored dot (was text), bordered footer w/ source · year.
  - **SectorTabs**: pill-style buttons (active = filled ink-800 pill, hover = ink-100), sticky-under-topbar at 64px, backdrop-blur.
  - **Country profile hero**: flag in gradient-card 64×64, 3xl title with tracking-tighter, ISO3 chip-style, capital + FY meta, live/error chips use `.chip-*` utilities, buttons use `.btn-primary`/`.btn-ghost`.
  - **Overview cards** (gov/priorities/initiatives): card class, accent bullet dots on priorities, accent left-border on initiatives, looser line-height on prose.
- Artifacts:
  - src/components/profile/IndicatorCard.tsx
  - src/components/profile/SectorTabs.tsx
  - src/app/country/[iso3]/page.tsx
- Verified: tsc clean · 9 routes 200.
- Classification: Internal


## [2026-05-24 02:55] MS-035 — Polish round 3: Briefings list + Chat workspace

- Phase: 3 (polish)
- Summary:
  - **BriefingsList**: 3xl tracking-tighter title · source chip pill · segmented filter (rounded shell, ink-800 fill on active) · classification chips via `.chip-*` utilities · card-wrapped table · 2xs uppercase headers · refined row padding (py-3.5) · arrow link on row open.
  - **ChatWorkspace**: card class on chat shell · gradient user bubbles (ink-700→900) w/ shadow-card · bordered assistant bubbles w/ shadow-card · classification selector w/ shadow-card · form bar gets ink-50/40 backdrop · input w/ focus shadow-pop · send button via `.btn-primary`.
- Artifacts:
  - src/components/briefings/BriefingsList.tsx
  - src/components/chat/ChatWorkspace.tsx
- Verified: tsc clean · 9 routes 200.
- Classification: Internal


## [2026-05-24 03:10] MS-036 — Polish round 4: Compare, Insights, Cooperation, Video, Sources

- Phase: 3 (polish)
- Summary: Same modern token pass applied to remaining 5 views.
  - **Compare**: 3xl headline w/ subtitle; segmented selector with shadow-card; card-wrapped table; chip-style score column kept; radar + notes cards use `.card`.
  - **Insights**: 3xl headline + subtitle; control bar — selects + horizon all elevated w/ shadow-card; confidence as `.chip-{ok,warn,risk}`; forecast preview cells refined w/ ink-50/60 background.
  - **Cooperation**: 3xl headline + subtitle; view switcher = segmented control inside shadow-card shell; matchmaker table card-wrapped w/ 2xs uppercase headers.
  - **Video Studio**: control panel uses `.card`; main column grid tightened.
  - **Sources**: 3xl headline; search input elevated w/ shadow-card + focus shadow-pop; skeleton block uses `.card`.
- Artifacts:
  - src/components/compare/CompareView.tsx
  - src/components/insights/InsightsView.tsx
  - src/components/cooperation/CooperationView.tsx
  - src/components/video/VideoStudio.tsx
  - src/app/sources/page.tsx
- Verified: tsc clean · 9 routes 200.
- Classification: Internal


## [2026-05-24 03:25] MS-037 — Polish round 5: Briefing detail + Activity timeline

- Phase: 3
- Summary:
  - **Briefing detail page** (`/briefings/[id]`): 4xl tracking-tighter title; classification + confidence as `.chip-*`; export buttons use `.btn-ghost`; talking points / risks / opportunities lists swap bullet discs for colored dots (accent/risk/ok); section titles via `.section-title`; refined separator hierarchy.
  - **Activity page**: rebuilt as proper vertical timeline. Left border-s-2 spine in ink-100; per-item ring-stamped dot in kind-color; card-wrapped items w/ shadow-card → shadow-pop hover; segmented filter; chip-style kind badge.
- Artifacts:
  - src/app/briefings/[id]/page.tsx
  - src/app/activity/page.tsx
- Verified: tsc clean · 4 routes 200.
- Classification: Internal


## [2026-05-24 03:40] MS-038 — Polish round 6: Admin · Settings · New briefing form

- Phase: 3
- Summary:
  - **Admin**: 3xl hero w/ subtitle; segmented tab bar (Users/Sources/Audit/Health) inside shadow-card shell; all 4 tab sections wrap in `.card`; ingest run buttons use `.btn-primary`; refined ink-50/60 row bg + 2xs uppercase headers across every table.
  - **Settings**: 3xl hero w/ subtitle; cards via `.card`; density/theme/classification toggles in shadow-card segmented controls.
  - **New briefing form** (`/briefings/new`): card wrapper, subtitle ("Claude Opus 4.7 · classification-gated"); all inputs/selects/textareas elevated w/ shadow-card + focus shadow; submit via `.btn-primary`; result panel uses `.card`.
- Artifacts:
  - src/app/admin/page.tsx
  - src/app/settings/page.tsx
  - src/app/briefings/new/page.tsx
- Verified: tsc clean · 5 routes 200.
- Classification: Internal


## [2026-05-24 04:00] MS-039 — Manual + auto source import with AI category classifier

- Phase: 3 (data layer · agent integration)
- Summary: End-to-end "import from any of 90 catalogued sources" flow.
  1. Fetch source URL → cache at `agent-resources/<category>/<cacheKey>.cache.html` (24h TTL)
  2. Classify into ingest runner via two-stage pipeline:
     - **Heuristic**: regex against URL/name/coverage matches worldbank · imf · ember · oecd (covers 4 runners, ~25 of 90 sources directly)
     - **AI fallback**: Claude classifies payload preview (4KB) → strict JSON `{runner,reason,confidence}` when ANTHROPIC_API_KEY set
  3. If runner matched → `runByKey()` upserts to in-memory store + Postgres (when USE_DB=1)
  4. Else → cache-only (audit logs reason)
- New endpoints:
  - `POST /api/sources/import {cacheKey, force?}` (any authed user)
  - `POST /api/admin/import/auto {force?, max?}` (admin only) — bulk loop at 1 req/s
- UI (Sources page):
  - "Import" button per source row · disabled for non-HTTP URLs · busy spinner per row
  - "Auto-import all" button in header (admin) · runs first 15 sources, toasts summary
- New subagent: `data-classifier.yml` (agent-driven category routing alternative)
- Artifacts:
  - src/services/import/{classifier,import}.ts
  - src/app/api/sources/import/route.ts
  - src/app/api/admin/import/auto/route.ts
  - src/app/sources/page.tsx (Import buttons + Auto-import)
  - .claude/agents/data-classifier.yml
- Verified:
  - tsc clean
  - IMF import → runner=imf (heuristic), **59 rows upserted**
  - WEF publications → runner=none (no heuristic match, no API key), **558KB cached** to disk
  - World Bank Open Data → runner=worldbank (heuristic)
  - 401 on unauth
  - Audit events: `source.import.start/ok/error` + `import.auto.start/ok`
- Classification: Internal


## [2026-05-24 04:25] MS-040 — Role-based frontend gating

- Phase: 3 (auth UX)
- Summary: Client-side role-gating across sidebar nav, action buttons, source import. Backend ABAC already enforced; UI now hides controls users can't use rather than letting them click + 403.
- New: `src/lib/auth/client.ts` — `ClientUser` type, `Role`/`Clearance`, `ROLE_RANK`, `hasRole()`, `hasClearance()`, `useAuthedUser()` hook (30s globalThis cache to dedupe fetches across components).
- Sidebar:
  - Per-item `minRole` field (viewer / analyst / lead / admin)
  - Filters items + entire empty sections at render
  - Mapping: dashboard/compare/activity/settings = viewer · insights/cooperation/briefings/chat/sources = analyst · video = lead · admin = admin
  - Footer card shows "Signed in as <name> · <role> · <clearance>" when expanded
- Page gates:
  - `/sources`: Import button per row hidden for viewer (analyst+); "Auto-import all" hidden for non-admin
  - `/briefings`: "+ New briefing" hidden for viewer
  - `/dashboard` Recent briefings card: "+ Generate" hidden for viewer
  - `/country/[iso3]`: "+ Generate" briefing button hidden for viewer (Compare always visible)
- Backend gates unchanged; UI is defense in depth.
- Artifacts:
  - src/lib/auth/client.ts (new)
  - src/components/shell/Sidebar.tsx (role filter + signed-in card)
  - src/app/sources/page.tsx
  - src/components/briefings/BriefingsList.tsx
  - src/components/dashboard/RecentBriefings.tsx
  - src/app/country/[iso3]/page.tsx
- Verified: tsc clean; 4 seeded roles return correct role from /api/auth/me; 5 protected routes still 200 for analyst.
- Classification: Internal


## [2026-05-24 04:45] MS-041 — Add user-defined sources (URL or file upload)

- Phase: 3 (catalog extensibility)
- Summary: Analyst+ can extend the 90-source catalog with their own entries — either by URL or by uploading a local file (≤ 8 MB). User-added sources merge into the manifest at load time (overlay over CSV-derived base), become searchable, importable, and classifier-routable like built-in ones.
- New endpoint `POST /api/sources/add` handles both:
  - JSON body `{name, url, category, coverage?, bestUse?}` — URL addition
  - multipart form (file + name + category) — file upload; saves to `agent-resources/uploads/<slug>.<ext>`, registers as `local://uploads/<slug>.<ext>` URL
- Manifest loader (`src/lib/sources/manifest.ts`) now merges `data/user-sources.json` over the base manifest at read time; `invalidateManifestCache()` exposed for after writes.
- Import service handles `local://` URLs (reads from disk; same cache flow afterward), so user-uploaded files run through the same classifier + ingest pipeline.
- UI: "+ Add source" button on /sources (analyst+) opens modal w/ segmented "From URL" / "Upload file" tabs, category picker (11 known slugs), optional coverage + best use. Refresh on save.
- `.gitignore` excludes `agent-resources/uploads/*` (except .gitkeep) and `data/user-sources.json` (runtime-mutated).
- Artifacts:
  - src/lib/sources/userSources.ts (load/append/slugify + cache invalidation)
  - src/lib/sources/manifest.ts (overlay merge + invalidateManifestCache)
  - src/services/import/import.ts (handles local:// URLs)
  - src/app/api/sources/add/route.ts (POST · JSON or multipart · analyst+ gated · audited)
  - src/app/sources/page.tsx (Add button + AddSourceModal w/ URL + file tabs)
  - .gitignore (excludes uploads + user-sources.json)
- Verified:
  - tsc clean
  - POST /api/sources/add (URL) → 200, source appears in `?q=` search
  - POST /api/sources/add (file upload) → 200, file written to agent-resources/uploads/upload-test-2026.csv
  - Unauth → 401
  - /sources renders 200
- Audit events: `source.add.url`, `source.add.upload`, `source.add.error`
- Classification: Internal


## [2026-05-27 14:25] MS-042 — phase 1 complete
- Actor: lead@example.ae
- Area: src/services
- Summary: RAG + safety + anomaly + project-log shipped
- Links: FIX-* TODO-*
- Classification: Internal


## [2026-06-10 06:33] MS-043 — Challenge-guide gap analysis closed — Arabic-first, voice, deck export, Docker

- Phase: 3 (challenge-guide gap closure)
- Summary: All gaps from the MOEI challenge guide analysis (2026-06-10) implemented on branch `feat/arabic-first-rtl`, PR #2 (https://github.com/zoirj0n/intel-gov/pull/2).
  - Arabic-first SSR locale + RTL logical properties + self-hosted fonts + pinned Western digits + localized login (TODO-029)
  - Voice Q&A loop in chat with error surfacing and natural-voice TTS ranking (TODO-028, FIX-007)
  - Live-brief structured deck export with Arabic RTL slides (TODO-030, FIX-006)
  - NODE_ENV build fix (ERR-004, FIX-005)
  - Docker runtime — full stack via `docker compose up`, image build repaired, `.dockerignore` added
- Verified: 137 unit tests passing; clean build 21/21 pages; containerized app verified healthy.
- Remaining follow-up: TODO-032 (on-prem Whisper STT).
- Links: TODO-028 TODO-029 TODO-030 · FIX-005 FIX-006 FIX-007 · ERR-004 · PR #2
- Classification: Internal
