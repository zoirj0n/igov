#!/usr/bin/env bash
set -euo pipefail

echo "==> Checking prerequisites"
command -v node >/dev/null || { echo "node missing"; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm missing — npm i -g pnpm"; exit 1; }
command -v docker >/dev/null || { echo "docker missing"; exit 1; }

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node >= 20 required (found v$NODE_MAJOR)"; exit 1
fi

echo "==> Copying .env.example if needed"
[ -f .env.local ] || cp .env.example .env.local

echo "==> Installing deps"
pnpm install --frozen-lockfile

echo "==> Starting local services (postgres, redis, opensearch)"
docker compose up -d postgres redis opensearch

echo "==> Waiting for Postgres"
until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done

echo "==> Running migrations + seed"
pnpm db:migrate
pnpm db:seed

echo "==> Setup complete"
echo "Next: pnpm dev → http://localhost:3000"
