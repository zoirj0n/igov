#!/usr/bin/env bash
set -euo pipefail

ENV="${1:-}"
case "$ENV" in
  dev|staging|prod) ;;
  *) echo "usage: $0 <dev|staging|prod>"; exit 1 ;;
esac

echo "==> Pre-flight checks"
pnpm typecheck
pnpm lint
pnpm test --run
pnpm build

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree dirty — commit or stash before deploy"; exit 1
fi

SHA=$(git rev-parse --short HEAD)
IMAGE="registry.uae.country-intel/web:${ENV}-${SHA}"

if [ "$ENV" = "prod" ]; then
  read -r -p "Deploy to PROD? Confirm with 'yes': " confirm
  [ "$confirm" = "yes" ] || { echo "aborted"; exit 1; }
fi

echo "==> Building $IMAGE"
docker build -t "$IMAGE" .

echo "==> Pushing"
docker push "$IMAGE"

echo "==> Applying k8s overlay/$ENV"
kubectl apply -k "k8s/overlays/$ENV"
kubectl set image deploy/web "web=$IMAGE" -n "country-intel-$ENV"
kubectl rollout status deploy/web -n "country-intel-$ENV" --timeout=5m

echo "==> Deployed $IMAGE to $ENV"
echo "Rollback: kubectl rollout undo deploy/web -n country-intel-$ENV"
