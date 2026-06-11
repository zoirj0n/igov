# Changelog

All user-visible changes. Keep a Changelog format (https://keepachangelog.com/), date-tagged.

---

## [Unreleased]

### Added
- Full 8-section frontend: dashboard, country profile (6 sector tabs), compare, chat, briefings (list + viewer + generator), video studio, insights, cooperation.
- Bilingual EN ⇄ AR with full RTL.
- 4 production SVG widgets: WorldMap, RadarChart, RelationshipGraph, VideoPreview.
- Backend endpoints: `/api/chat`, `/api/briefings/generate`, `/api/countries`, `/api/health`.
- Anthropic SDK integration with mock fallback when `ANTHROPIC_API_KEY` absent.
- Postgres schema (PostGIS + pgvector) + seed migration.
- 9 Claude Code subagents (code review, security, SRE, text-writer, 5 data agents).
- Slash commands: `/review`, `/test-all`, `/deploy`, `/bootstrap`, `/source`, `/ingest`.
- Source catalog loader (`data/sources.csv` → typed queries).

### Fixed
- TS2322 in `services/auth.ts` (FIX-001).
- TS2344 in `services/database.ts` (FIX-002).

### Added (gap TODOs against pinned brief — 2026-05-22)
- Reconciled build against canonical project brief: 8 capabilities mapped, 8 new gap TODOs filed (TODO-009..016).

### Added
- Briefing PDF export via @react-pdf/renderer (one-pager w/ classification header, talking points, risks, opportunities, sources, page numbers).
- Briefing PPTX export via pptxgenjs (4-5 slides, master template w/ classification banner).
- Briefing detail page wired to real download flow w/ Blob handler.
- ABAC enforcement on briefing export — clearance < classification → 403.

### Changed
- `/api/chat` streams via SSE when `stream:true` or `accept: text/event-stream`. Token-by-token output in ChatWorkspace w/ blinking cursor.

### Added
- Real World Bank ETL: 7 indicators × 12 countries, ~500ms warm-cache run.
- Admin Sources tab now triggers live ingest + shows status, freshness, duration, error count.
- New endpoint `/api/countries/[iso3]/indicators` returns live overlay merged with mock seed.

### Added
- Live indicator propagation to UI. Dashboard watchlist + country profile fetch `/api/indicators` and `/api/countries/[iso3]/indicators` on mount. "live · World Bank" badges + per-row source dots.

### Added
- Classification enforcement on AI outputs. `/api/chat` accepts `classification` param; rejects 403 if > caller clearance. Per-tier system prompt + mandatory `[CLASSIFICATION: X]` banner. UI selector clamped to clearance; per-message badge.

### Security
- AI output classification now propagates to audit log + chat log + response headers (`x-classification`).

### Security
- Strict CSP with per-request nonce. `script-src` no longer permits `unsafe-inline`. `strict-dynamic` allows scripts chained from trusted nonced ones. HSTS, frame-ancestors, base-uri, form-action, object-src all locked.

### Added
- Real predictive forecasts on `/insights`: Holt's linear-trend smoothing over 25y World Bank historicals, 95% confidence band, 7 predictable metrics, confidence label derived from CV.

### Added
- AI video script generation: 4-style multi-variant Claude output with timed scenes, narration, visuals, overlays, citations, confidence. UI surfaces real scene-by-scene timeline. MP4 render deferred (TODO-018).

### Added
- DB-backed routes via repo layer behind `USE_DB=1` flag. Falls back to in-memory mock when off. New `/api/admin/db/status` + live postgres health chip in admin. ETL dual-upserts to memory + DB when enabled.

### Added
- Video storyboard PDF export (cover + per-scene page) and SRT subtitle export from AI-generated scripts.
- Source catalog: IMD Smart City Index, IESE Cities in Motion, EIU Safe Cities, Arcadis Sustainable Cities Index.

### Added
- Browser-native video playback in Video Studio: scene-by-scene player with Web Speech TTS narration, synchronized timecode, classification stamp, play/pause/restart/TTS controls.
- Render manifest JSON export (schema 1.0.0) for Remotion/HeyGen/ffmpeg downstream integration.

### Changed
- BriefingsList + Recent briefings card now fetch from clearance-filtered `/api/briefings`. Analyst sees only briefings ≤ internal; exec sees all.

### Added
- Unit test coverage: jwt sign/verify, clearance hierarchy, Holt's forecast, SRT renderer, sources catalog. 26 tests, 6 files, 741ms.
- Playwright e2e auth flow spec.

### Added
- IMF Datamapper ETL: 5 forward-looking metrics (GDP growth, inflation, unemployment, debt/GDP, current account/GDP). Run via admin Sources tab alongside World Bank. 59 rows upserted in ~3.5s.

### Added
- Production K8s infrastructure: Kustomize base + dev/prod overlays, restricted Pod Security Standards, default-deny NetworkPolicy, HPA, PDB, cert-manager TLS.
- ArgoCD ApplicationSet + AppProject for GitOps deployment.
- GitHub Actions: CI (lint/typecheck/vitest/build/playwright/audit), release (build w/ SBOM + provenance attestation, auto-PR for image bump).
- infra/README.md deployment runbook.

### Added
- OpenTelemetry tracing via `@vercel/otel`. Auto-instruments Next.js routes + fetch. Manual spans on AI chat, briefing generation, ETL ingest (with fetch + DB upsert sub-spans). Activates when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; zero-overhead no-op otherwise.

### Added
- SIEM audit forwarding. Three transports (`syslog-tcp`, `syslog-tls`, `http`), batched and queued with backpressure and reconnect. Off by default; enable via `SIEM_TRANSPORT` env. Audit jsonl persists in parallel.

### Security
- Audit pipeline now ships every event to org SIEM in real time (when configured), in addition to local immutable append-only journal.

### Added
- Real OIDC PKCE auth (UAE PASS + Microsoft Entra). JWKS-verified ID token (RS256). Web Crypto, no new deps. Login page surfaces configured providers; stub login retained.

### Security
- Authorization-code + PKCE flow with state, nonce, code-challenge S256. ID-token claims validated against issuer + audience + expiry + nonce; signature verified via JWKS.

### Added
- World Bank ETL extended: 12 metrics (was 7). New: internet users, mobile subscriptions, secondary enrollment, health expenditure, electricity per capita.
- Ember Electricity fetcher: best-effort CSV ingest (renewables/coal/gas/nuclear/solar/wind shares per country).

### Changed
- Ember ETL now resolves current CSV URL by scraping the Ember dataset index page (regex match), caches resolved URL for 7 days. `EMBER_CSV_URL` env override remains. Static fallback URLs preserved.

### Added
- TypeScript manifest loader for `agent-resources/manifest.json`. Helpers: loadManifest, categoryKeys, findCategory, findSourceByCacheKey, searchManifest.
- Admin endpoint `/api/admin/sources` (manifest browsing + free-text search, admin-only).
- OECD SDMX-JSON fetcher scaffold (parser landed; dataflow ID discovery in TODO-026).

### Changed
- Subagent YAMLs (`data-source-curator`, `economic-data-fetcher`, `energy-data-fetcher`, `sustainability-analyst`, `trade-cooperation-analyst`) now read from `agent-resources/manifest.json` primary, fall back to `data/sources.csv`. Each documents its category cache dirs, dispatch chain to `runByKey()`, and `source.fetch` audit requirement.

### Added
- `/sources` page: searchable catalog browser for all 90 trusted data sources, grouped by 11 categories. Any authed user can browse. New `/api/sources` endpoint (auth-gated, supports `?q=` and `?category=`). Sidebar nav link added.

### Changed
- Modernized UI/UX. Refined ink color scale + saturated indigo accent. New card/pop shadows. Larger nav. Gradient brand + avatar. Reusable utility classes (.card, .btn-*, .chip-*). Cleaner KpiTile with chip-style trend pill. Bigger headings with tighter tracking. Unified focus ring.

### Changed
- Country profile redesigned: gradient flag tile, larger title, refined chips, accent bullet/border treatments on overview cards.
- IndicatorCard: confidence dot replaces text label, bordered source/year footer.
- SectorTabs: pill-style nav with active fill, sticky-under-topbar.

### Changed
- BriefingsList: card table, segmented filter, chip-style classification badges, refined row hover.
- ChatWorkspace: gradient user bubbles, bordered assistant bubbles with subtle shadow, refined input + send button.

### Changed
- Polish across Compare · Insights · Cooperation · Video Studio · Sources. Tighter 3xl titles. Elevated form controls. Card-wrapped tables. Chip-style confidence + classification badges. Subtle row hover. Refined empty/error states.

### Changed
- Briefing detail page: 4xl heading, colored dot bullets per section, chip-style classification/confidence, btn-ghost export controls.
- Activity stream: vertical timeline w/ ring-stamped dots; card-wrapped entries; segmented filter.

### Changed
- Admin · Settings · New briefing form: unified card style, segmented tab bars, shadow-card form inputs, 3xl page heroes with subtitles. Consistent with other v1 pages.

### Added
- Manual + auto data import from 90-source catalog. Per-source "Import" button on `/sources` and admin "Auto-import all" button. Two-stage classifier (regex heuristic + Claude AI fallback) routes payloads to worldbank/imf/ember/oecd runners or marks cache-only. New `data-classifier` subagent spec.

### Changed
- Role-based UI: sidebar nav, action buttons, and source-import controls hide rather than 403 for users below the required role. Per-section minRole on sidebar. New `useAuthedUser()` hook with 30s cache.

### Added
- "Add source" on /sources — analyst+ can extend catalog by URL or by uploading a local file (≤ 8 MB). User-added sources merge into the manifest, become searchable, importable, and classifier-routable. New `data/user-sources.json` registry + `agent-resources/uploads/` directory. Multipart upload via `POST /api/sources/add`.

### Added (challenge-guide gap closure — 2026-06-10, MS-043, PR #2)
- Voice assistant: voice Q&A loop in chat with mic input and natural-voice TTS playback (TODO-028).
- Live-brief structured deck export endpoint with Arabic RTL slides (TODO-030).
- Docker web service: full stack runs via `docker compose up`; `.dockerignore` added.
- RTL screenshot script.

### Changed
- Arabic-first default locale resolved at SSR; RTL via CSS logical properties (TODO-029).
- Fonts self-hosted (no external font CDN).
- Western digits pinned across both locales.

### Fixed
- NODE_ENV build failure (ERR-004, FIX-005).
- Docker image build repaired.
- Login page localization (EN/AR).
- Mic errors now surfaced in the chat UI (FIX-007).
- TTS voice selection ranks natural voices first (FIX-007).
