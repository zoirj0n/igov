#!/usr/bin/env bash
# Pre-demo warm-up: verify Ollama, preload the local fleet (kept 1h), check seed.
# Run right before demoing so the first agent run is ~30s, not a cold ~90s.
#   pnpm warm
set -uo pipefail

OLLAMA="${OLLAMA_URL:-http://localhost:11434}"

echo "▸ Checking Ollama at $OLLAMA ..."
if ! curl -sf "$OLLAMA/api/tags" >/dev/null 2>&1; then
  echo "✗ Ollama not reachable. Start it with:  ollama serve"
  exit 1
fi
echo "✓ Ollama up"

for m in qwen2.5:7b qwen2.5:3b; do
  echo "▸ Warming $m ..."
  curl -s "$OLLAMA/api/chat" \
    -d "{\"model\":\"$m\",\"stream\":false,\"keep_alive\":\"1h\",\"options\":{\"num_predict\":1},\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}" \
    >/dev/null 2>&1 || echo "  (warn: could not warm $m)"
done
echo "▸ Warming nomic-embed-text ..."
curl -s "$OLLAMA/api/embeddings" \
  -d "{\"model\":\"nomic-embed-text\",\"prompt\":\"hi\",\"keep_alive\":\"1h\"}" \
  >/dev/null 2>&1 || echo "  (warn: could not warm nomic-embed-text)"

echo "✓ Models warmed (kept loaded 1h)"

n=$(ls data/seed/indicators.*.json 2>/dev/null | wc -l | tr -d ' ')
echo "✓ Seed countries: $n"
if [ -f data/llm-config.json ] && grep -q '"local"' data/llm-config.json 2>/dev/null; then
  echo "✓ LLM provider: local (on-prem)"
else
  echo "✗ data/llm-config.json not set to provider=local — agent may hit cloud/mock"
fi

echo "▸ Ready. Start the app:  pnpm dev   →   http://localhost:3000"
