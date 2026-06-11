# Onboarding

Welcome to the Country Intelligence Platform team.

## Day 1
1. Get accounts: GitHub org, UAE PASS test account, Entra ID dev tenant, Vault, Grafana.
2. Read:
   - `CLAUDE.md` (project conventions)
   - `docs/architecture.md`
   - `docs/api-reference.md`
3. Run `./scripts/setup.sh` — installs deps, brings up local stack, seeds DB.
4. `pnpm dev` — open http://localhost:3000.
5. Sign in with seeded `admin@example.ae / changeme`.

## Toolchain
- Node 20+, pnpm 9+, Docker, kubectl, jq.
- Editor: VS Code + Biome + Tailwind CSS IntelliSense + ESLint OFF.
- Recommended: pgcli, redis-cli, k9s.

## Workflow
1. Pull main, `git checkout -b feat/<short-slug>`.
2. Write tests first when feasible.
3. `pnpm test && pnpm lint && pnpm typecheck`.
4. Open PR. Run `/review` slash command in Claude Code.
5. Address review, merge via squash. Conventional Commits.

## Where things live
- Web: `src/`
- API: separate repo `country-intel-api`
- ETL: separate repo `country-intel-etl`
- Infra: `country-intel-infra` (Terraform + Kustomize)

## Getting help
- `#country-intel-dev` Slack
- On-call rota: see PagerDuty schedule `country-intel-primary`
- Architecture questions: ping @platform-tl
