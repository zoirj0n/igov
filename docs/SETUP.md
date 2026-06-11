# Local setup — running the platform on a new machine

Everything the platform needs to run fully featured on a fresh laptop. The app
degrades gracefully (mock data, clear error messages) when optional pieces are
missing, but this list gets you to 100%.

## 1. Required

### Node.js 20+ and pnpm

```bash
# macOS
brew install node pnpm
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
npm i -g pnpm
# Windows
winget install OpenJS.NodeJS.LTS
npm i -g pnpm
```

### Install dependencies & configure

```bash
pnpm install
cp .env.example .env.local
# REQUIRED: set JWT_SECRET (session signing)
#   openssl rand -base64 32
pnpm dev          # http://localhost:3000 · stub login: analyst@example.ae / demo
```

## 2. ffmpeg — required for video export (MP4)

The "Download video (MP4)" button and the video studio render entirely
on-prem with ffmpeg. Without it the API returns a clear 501 error.

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt update && sudo apt install -y ffmpeg

# Windows (either)
winget install Gyan.FFmpeg
choco install ffmpeg

# Verify
ffmpeg -version
```

If ffmpeg is installed somewhere not on PATH, point the app at it:

```bash
# .env.local
FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
```

Docker images: add `RUN apt-get update && apt-get install -y ffmpeg` to the
runtime stage of the `Dockerfile`.

> Note: the narrated video studio additionally uses macOS `say` for offline
> text-to-speech — that path is macOS-only. The deck video (MP4 export from a
> briefing) is silent by design and works on any OS with ffmpeg.

## 3. LLM providers (one of)

| Provider | Env vars | Notes |
|---|---|---|
| OpenRouter (cloud) | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Default; free models have separate rate limits |
| Anthropic (cloud) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | |
| Ollama (on-prem) | `OLLAMA_URL` + `OLLAMA_MODEL_*` | Required for `confidential`/`secret` work — the cloud gate blocks those tiers from cloud providers |

```bash
# On-prem models (optional but needed for confidential+ classifications)
brew install ollama          # or: curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:3b qwen2.5:7b gemma4:12b nomic-embed-text
```

With no key at all the app serves clearly-labelled mock content — useful for
UI work, not for demos.

## 4. Optional services

| Feature | Requirement |
|---|---|
| Live web developments (Tavily) | `TAVILY_API_KEY` in `.env.local` |
| Postgres persistence | `USE_DB=1`, `DATABASE_URL`; start with `pnpm db:up && pnpm db:migrate && pnpm db:seed` (needs Docker) |
| Cloud embeddings | `VOYAGE_API_KEY` or `OPENAI_API_KEY` (falls back to local/mock embeddings) |

## 5. Verify the install

```bash
pnpm typecheck       # tsc --noEmit
pnpm lint            # biome
npx vitest run       # unit tests
pnpm dev             # then log in with analyst@example.ae / demo
```

Smoke-test the export pipeline: open a briefing → the brief tab → try
**Download slides (PPTX)** (no ffmpeg needed) and **Download video (MP4)**
(needs ffmpeg).

## 6. Common issues

- **"ffmpeg not found" (HTTP 501) on video export** — install ffmpeg (§2) or
  set `FFMPEG_PATH`; restart `pnpm dev` after changing `.env.local`.
- **Briefings show an amber "template fallback" badge** — the LLM responded
  but its JSON failed validation, or the provider/key is misconfigured. Check
  `logs/llm-calls.jsonl` (look at `usedRealApi` and `errorClass`) and the
  server console.
- **Old saved runs still show mock/fallback content after fixing a key** —
  saved runs are immutable snapshots; start a new briefing.
- **Changed `.env.local` but behaviour didn't change** — Next.js reloads env
  on file change in dev, but a request already in flight uses the old values;
  when in doubt restart the dev server.
