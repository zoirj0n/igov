# AGENTS.md

Onboarding + AI-agent context for this repo. Works for any AI tool (Claude Code, Codex,
Cursor, Aider…) and humans. The deeper canonical reference is **[CLAUDE.md](./CLAUDE.md)**.

---

## What this is

**Country Intelligence** — a sovereign-AI executive-intelligence platform for UAE government
leadership. The hero feature is **`/agent` (Strategic Advisor)**: one command ("Prepare me
for Brazil's energy minister") runs a multi-agent pipeline that pulls **live** data, has an
LLM **autonomously call research tools**, and composes a decision-first **bilingual (EN/AR)**
executive briefing + one-pager. Classification-aware (Public/Internal/Confidential/Secret),
audit-logged end-to-end.

Stack: Next.js 15 · React 19 · TypeScript · Tailwind/shadcn · LangGraph · **Ollama (local LLMs)**.

---

## ⚠️ AI runtime — OpenRouter cloud-first, Ollama fallback (models on the external SSD)

**Text generation is cloud-first via OpenRouter (`google/gemma-4-31b-it:free`); any cloud
failure falls back automatically to the local Ollama daemon (`:11434`) with the per-role
models below.** `confidential`/`secret` calls are pinned local-only via classMap; embeddings
and rerank stay fully local. Full sovereign mode is one flip away (`OFFLINE_MODE=true` +
`LLM_PROVIDER=local`) — the Ollama stack below must therefore stay installed and warm.

**Models are stored on the workspace SSD, not the home volume** (they're ~15 GB; the laptop
disk usually can't hold them). Point Ollama at the SSD via a symlink (or `OLLAMA_MODELS`):

```bash
# one-time, after installing Ollama (https://ollama.com)
rm -rf ~/.ollama/models                                   # only if empty/missing
ln -s /Volumes/Workspace/ollama-models ~/.ollama/models   # SSD is the model store
open -a Ollama
# alternative: launchctl setenv OLLAMA_MODELS /Volumes/Workspace/ollama-models && restart Ollama
```

Required models (the `OLLAMA_MODEL_*` env vars route subtasks to each):

| Slot | Env var | Model | Used by |
|---|---|---|---|
| Light | `OLLAMA_MODEL_LIGHT` | `qwen2.5:3b` | router / scope parsing |
| Heavy | `OLLAMA_MODEL_HEAVY` | `qwen2.5:7b` | analyst, opportunity scoring |
| Tools | `OLLAMA_MODEL_TOOLS` | `qwen2.5:7b` | LangGraph tool-loop (qwen tool-calls reliably; gemma cannot) |
| Scribe | `OLLAMA_MODEL_SCRIBE` | `gemma4:12b` | EN/AR brief prose (best Arabic) |
| Embed | `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | RAG embeddings |

`gemma4:12b` is **intentional** (strong Arabic), not a typo for gemma3. Verify with
`ollama list` — if the SSD isn't mounted or a model is missing, `ollama pull <name>`.

---

## Run it (fresh machine)

```bash
# 0. Prereqs: Node ≥20, pnpm 10, Ollama installed + pointed at the SSD (above),
#    and: ollama pull qwen2.5:3b qwen2.5:7b gemma4:12b nomic-embed-text
#    (run each pull separately; verify: ollama list)

# 1. Install deps
pnpm install

# 2. Env — copy the template and fill the keys (file is gitignored)
cp .env.example .env
#   Required for the live agent:
#     LLM_PROVIDER=local   OFFLINE_MODE=true
#     OLLAMA_MODEL_LIGHT=qwen2.5:3b   OLLAMA_MODEL_HEAVY=qwen2.5:7b
#     OLLAMA_MODEL_TOOLS=qwen2.5:7b   OLLAMA_MODEL_SCRIBE=gemma4:12b
#     OLLAMA_EMBED_MODEL=nomic-embed-text   OLLAMA_KEEP_ALIVE=30m
#   Optional live-data keys (the agent degrades gracefully without them):
#     EIA_API_KEY=...        # free: www.eia.gov/developer  (energy)
#     TAVILY_API_KEY=...     # tavily.com  (live web/news)
#   COMTRADE_KEY is optional (UN Comtrade preview needs no key).

# 3. Confirm Ollama is serving + models present
curl -s http://localhost:11434/api/tags | jq '.models[].name'

# 4. Run the dev server
pnpm dev            # → http://localhost:3000  (redirects to /login)
```

Sign in with a seeded demo user: **`exec@example.ae` / `demo`** (also analyst@/lead@/admin@,
all password `demo`). Then open **/agent** and run a brief.

> The DB/Redis/OpenSearch services in `.env.example` are **not required** for the `/agent`
> demo path — it runs on live APIs + the committed seed. Only spin those up (`pnpm db:up`)
> if you're working on the persistence/ETL layers.

---

## How the agent works (where to look)

`POST /api/agent/run` streams Server-Sent Events from `runAgent()` in
`src/services/agent/graph.ts`: **router → researcher → (deep-analyst ‖ forecaster) →
strategist → scribe (EN then AR)**.

- **Live data layer — `src/services/live/`** (`indicators.ts`, `comtrade.ts`, `tavily.ts`,
  `eia.ts`, `runtime.ts`). Fetches at request time and merges sources:
  **World Bank + IMF + EIA** (indicators), **UN Comtrade** (real bilateral UAE↔partner trade),
  **Tavily** (live web/news). Live → cache → committed seed fallback, with timeouts.
- **Air-gap toggle:** `AGENT_AIRGAP=1` (also auto-on under Vitest) skips all network calls and
  serves cache/seed only — the wifi-proof / fully-sovereign mode.
- **LangGraph tool-loop — `src/services/agent/research-agent.ts`.** A ReAct `StateGraph` over
  qwen2.5 that autonomously calls tools (`get_indicators`, `bilateral_trade`, `web_search`),
  then synthesizes a cited deep analysis. Tool calls stream into the live "agents working" feed.
- **Any country works** — `src/lib/data/iso-countries.ts` resolves ~195 countries to ISO3;
  `src/lib/data/countries.ts` is only the curated *seed* (12 with Arabic names + offline data).
- **Briefing types** in `src/services/agent/state.ts`; deterministic numeric builders in
  `briefing.ts` (numbers never come from the LLM — integrity rule); one-pager SVG in
  `src/services/export/infographic.ts`; UI in `src/components/agent/AgentRunner.tsx`
  (with the per-brief EN/AR toggle).

---

## Commands

```bash
pnpm dev          # dev server (http://localhost:3000)
pnpm typecheck    # tsc --noEmit
pnpm lint         # Biome
pnpm test         # Vitest (unit/integration; offline + deterministic)
pnpm test:e2e     # Playwright
pnpm db:up        # docker compose: postgres + redis + opensearch (only for persistence work)
```

---

## Gotchas (read before demoing)

- **gemma4 is slow** (~9 tok/s): a full bilingual brief is **~6–10 min**. The live feed covers
  the wait. **Pre-warm before a demo** so the first brief isn't cold:
  `curl -s localhost:11434/api/generate -d '{"model":"gemma4:12b","prompt":"ok","keep_alive":"30m","stream":false}'`
  Need it faster? Set `OLLAMA_MODEL_SCRIBE=qwen2.5:7b` (~3 min, Arabic still renders correctly).
- **Don't run other Ollama models during a brief** — Ollama evicts gemma4 to load the other
  model, which stalls the in-flight compose. A running brief keeps gemma4 warm for 30 min.
- **Silent-fallback risk:** if Ollama is unreachable / a model is missing, the agent falls
  through to deterministic templates and still returns "something". Tell-tale: opportunity
  `title === rationale`, EN/AR brief titles identical, trace ends instantly. Check `ollama list`
  + `curl localhost:11434/api/ps` before declaring an LLM was reached.
- **Resilience:** the Arabic pass is non-fatal (English always delivered; the AR toggle stays
  disabled if AR fails); the SSE stream sends a heartbeat every 10s so long composes don't drop.
- **Secrets:** `.env` is gitignored — never commit keys. Don't put PII or classified data in logs.
