# Infra

## Layout

```
infra/
├── k8s/
│   ├── base/                  Kustomize base (Deployment, Service, Ingress, NetworkPolicy, HPA, PDB)
│   └── overlays/
│       ├── dev/               1 replica, debug logging, dev.country-intel.gov.ae
│       └── prod/              6 replicas, prod tag, country-intel.gov.ae
└── argocd/
    └── application.yaml       ApplicationSet + AppProject for auto-sync
```

## Apply locally (kind / minikube)

```bash
# Build + load image
docker build -t country-intel/web:dev .
kind load docker-image country-intel/web:dev

# Apply dev overlay
kubectl apply -k infra/k8s/overlays/dev
kubectl rollout status deploy/dev-web -n country-intel-dev
```

## Production (UAE region)

```bash
kubectl apply -k infra/k8s/overlays/prod
```

Requires:
- Secrets `web-secrets` populated (Vault / Sealed Secrets / ESO):
  `DATABASE_URL`, `ANTHROPIC_API_KEY`, `JWT_SECRET`, `OIDC_*`, `REDIS_URL`
- cert-manager ClusterIssuer `letsencrypt-prod`
- ingress-nginx in namespace `ingress-nginx` (labeled `name: ingress-nginx`)
- `data` namespace hosting postgres + redis
- `observability` namespace with OTLP collector on `:4318`

## ArgoCD bootstrap

```bash
kubectl apply -f infra/argocd/application.yaml
```

ApplicationSet creates `country-intel-dev` (auto-sync) and `country-intel-prod` (manual sync).

## CI/CD

- `.github/workflows/ci.yml` — lint · typecheck · vitest · build · playwright · pnpm audit
- `.github/workflows/release.yml` — on tag `v*.*.*`: build, SBOM, sign w/ build-provenance attestation, push to registry, open PR bumping dev overlay tag

## Security baseline

- Pod Security Standards: `restricted` enforced via namespace label
- `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, all caps dropped, seccomp `RuntimeDefault`
- `automountServiceAccountToken: false`
- NetworkPolicy: default-deny + per-app egress to data + observability + 443 outbound (with RFC1918 carve-outs)
- TLS via cert-manager + Let's Encrypt; HSTS + nosniff at ingress
- HPA on CPU 70% / memory 80%, PDB minAvailable 2

## Data residency

- Namespace label `data-residency: uae`
- All clusters provisioned in UAE region (G42 / Etisalat / Azure UAE North)
- Cross-region replicas only within UAE AZs (DR: RPO 15m, RTO 1h)
