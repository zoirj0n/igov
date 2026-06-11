# Fixes log

Append-only. ID format: `FIX-NNN`. Link to errors via "resolves ERR-NNN".

---

## [2026-05-22 02:14] FIX-001 — null coalesce in getCurrentUser

- Resolves: ERR-001
- Files: `src/services/auth.ts`
- Change: `res.ok ? res.data : null` → `res.ok ? (res.data ?? null) : null`
- Verification: `tsc --noEmit` exit 0
- Classification: Internal

## [2026-05-22 02:14] FIX-002 — QueryResultRow constraint on query<T>

- Resolves: ERR-002
- Files: `src/services/database.ts`
- Change: `query<T>` → `query<T extends QueryResultRow>`; import `QueryResultRow` from `pg`
- Verification: `tsc --noEmit` exit 0
- Classification: Internal

## [2026-05-22 05:22] FIX-003 — TS2345 ArrayBuffer narrowing in jwt.ts

- Resolves: caught during MS-010
- Files: src/lib/auth/jwt.ts
- Change: explicit `sigBytes.buffer.slice(...)` cast to ArrayBuffer before `crypto.subtle.verify` (lib.dom.d.ts narrowed Uint8Array<ArrayBufferLike>).
- Verification: `tsc --noEmit` exit 0
- Classification: Internal

## [2026-05-27 14:25] FIX-004 — null guard
- Actor: analyst@example.ae
- Resolves: ERR-001
- Area: src/lib/x
- Summary: added optional chain
- Classification: Internal

## [2026-06-10 03:44] FIX-005 — remove hardcoded NODE_ENV from env files; /404 prerender Html error gone

- Resolves: ERR-004, TODO-031
- Files: `.env.local` (untracked), `.env.example`
- Root cause: `NODE_ENV=development` was hardcoded in `.env.local` (copied from `.env.example`). During `next build`, Next.js loads `.env.local` and runs a production build with a non-standard NODE_ENV (build log warning: 'You are using a non-standard "NODE_ENV" value in your environment'), which renders dev-mode React into the static prerender of the pages-router error shell — surfacing as the misleading `Error: <Html> should not be imported outside of pages/_document.` on /404 and killing the build.
- Change: removed the NODE_ENV line from `.env.local` and `.env.example` (Next.js manages NODE_ENV itself per command — dev/build/start).
- Verification: `pnpm build` completes — all 21 pages generated, static + dynamic routes emitted, no Html/prerender errors.
- Classification: Internal

## [2026-06-10 04:23] FIX-006 — live agent briefs export through the structured deck pipeline (POST /api/export/deck)

- Resolves: TODO-030
- Files: `src/app/api/export/deck/route.ts` (new), `src/components/agent/AgentRunner.tsx`, `tests/unit/export-deck.test.ts` (new)
- Change: new POST /api/export/deck route accepts a Briefing-shaped payload from live agent briefings and routes it through the existing renderBriefingPptx/renderBriefingPdf pipeline — same classification stamping, ABAC clearance gate (canRead), and audit events (briefing.export.{format}.{ok|denied|error}, resourceId live:<ISO3>) as stored-briefing export. AgentRunner maps the agent brief (BLUF, whyNow, talking points, risks→text, deals→opportunity strings, citations, confidence) and adds a bilingual "Download full deck (PPTX)" action.
- Verification: tests/unit/export-deck.test.ts — 5 route-handler tests (401 unauthenticated, 403 + denial audit below clearance, 400 malformed payload, PPTX zip-magic + headers + success audit, PDF magic). Full suite 129 passed. `pnpm build` clean (21/21 pages). Commit f8a5aaf on branch feat/arabic-first-rtl.
- Classification: Internal

## [2026-06-10 04:49] FIX-007 — voice assistant: spoken country queries in chat + agent read-aloud via shared voice hooks

- Resolves: TODO-028
- Files: `src/lib/hooks/useVoice.ts` (new), `src/components/chat/ChatWorkspace.tsx`, `src/components/agent/AgentRunner.tsx`, `src/lib/i18n/messages.ts`, `tests/unit/voice.test.ts` (new)
- Change: shared voice hooks in src/lib/hooks/useVoice.ts — `useSpeechInput` (Web Speech recognition, ar-AE/en-US per locale), `useSpeakAloud` (speechSynthesis TTS with language-matched voice), `stripForSpeech` (markdown→prose for TTS). Chat workspace gains a mic button that dictates a question, auto-sends it, and speaks the answer back; every assistant message gets a Listen/Stop action. AgentRunner refactored onto the shared hooks (dedupes its inline Web Speech code; read-aloud follows the brief-language toggle). Voice labels added to the EN/AR i18n catalog.
- Verification: tests/unit/voice.test.ts — 3 stripForSpeech tests (incl. Arabic). Full suite 133 passed. `pnpm build` clean (21/21 pages). Commit ce44ff5 on branch feat/arabic-first-rtl.
- Classification: Internal

## [2026-06-10 06:51] FIX-008 — on-prem speech-to-text for voice queries via self-hosted Whisper proxy

- Resolves: TODO-032
- Files: `src/app/api/voice/transcribe/route.ts` (new), `src/lib/hooks/useVoice.ts`, `src/components/chat/ChatWorkspace.tsx`, `src/components/agent/AgentRunner.tsx`, `docker-compose.yml`, `.env.example`, `tests/unit/voice-transcribe.test.ts` (new)
- Change: POST/GET /api/voice/transcribe — auth-gated proxy to an OpenAI-compatible self-hosted transcription server via `WHISPER_URL` (speaches / faster-whisper / whisper.cpp); 15 MB upload cap, ar/en language hint, audit events log bytes + language only — never transcript content (no-PII-in-logs rule). Client: `useVoiceInput` in src/lib/hooks/useVoice.ts probes the capability endpoint (GET) and prefers MediaRecorder capture + on-prem transcription over the cloud-backed browser Web Speech engine, which stays as fallback; chat + agent pages switched to the combined hook. docker-compose.yml gains an opt-in `whisper` service under the "voice" profile (ghcr.io/speaches-ai/speaches, model cache volume); env documented in .env.example.
- Verification: tests/unit/voice-transcribe.test.ts — 9 route tests (auth, 503 unconfigured, 400 missing audio, 413 oversize, forward + transcript + audit-without-content, 502 upstream failure). Full suite 146 passed; `pnpm build` clean (21/21 pages). Commit 1647d2a on branch feat/arabic-first-rtl.
- Classification: Internal

## [2026-06-10 07:00] FIX-009 — Arabic-first posture: SSR-default Arabic locale, logical-property RTL, self-hosted fonts

- Resolves: TODO-029
- Files: `src/lib/i18n/` (locale provider + shared `localeTag()`), 7 components migrated to logical properties, login page, `renderBriefingPptx` (src/services/export.ts), `scripts/rtl-screenshot.mjs` (new)
- Change: Arabic is now the SSR default locale — cookie-based, `<html lang="ar" dir="rtl">` on first paint, secure cookie on HTTPS. Physical Tailwind direction classes (ml-/mr-/pl-/pr-/left-/right-/text-left/text-right) replaced with logical properties across 7 components. Fonts self-hosted via next/font (Google CDN dependency removed — data residency). Western (latn) digits pinned for Arabic via `ar-AE-u-nu-latn` in shared `localeTag()`. Login page fully localized (gap found via Playwright visual RTL pass — scripts/rtl-screenshot.mjs). Arabic RTL deck rendering added to renderBriefingPptx. Commits 70b3442, 572e90e, ad0bc23, 7cb8e25, 94c01f0 on branch feat/arabic-first-rtl (PR #2).
- Verification: RTL screenshots AR/EN clean (login + landing); 146 unit tests pass incl. digit-pinning + Arabic deck XML assertions; `pnpm build` 21/21 pages; containerized app serves `lang="ar" dir="rtl"`.
- Classification: Internal

## [2026-06-10 13:34] FIX-010 — wire dashboard refresh (map pins + radar + i18n)

- Resolves: TODO-027
- Files: src/app/dashboard/page.tsx, src/lib/i18n/messages.ts
- Change: dashboard Refresh now also re-derives world-map pins from current briefings (`loadMapPins` extracted from the mount effect, called from both) and remounts SmartRadar via reload key. Refresh success toast and the "Updated Xs ago" label moved into the EN/AR i18n catalog (`dashboard.refreshedTitle`/`refreshedDetail`, `shell.agoSeconds`/`agoMinutes`/`agoHours`) — were hardcoded English.
- Verification: 124 unit tests pass; build clean 21/21 pages. Commit 7d698d6 on fix/dashboard-refresh, PR #3 (https://github.com/zoirj0n/intel-gov/pull/3)
- Classification: Internal
