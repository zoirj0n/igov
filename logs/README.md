# Project logs

Append-only structured logs maintained by Claude Code logging subagents.

| File | Owner agent | Slash command | Purpose |
|------|-------------|---------------|---------|
| `errors.md` | `error-logger` | `/log-error` | Runtime errors, test failures, build breaks, postmortems |
| `fixes.md` | `fix-logger` | `/log-fix` | Resolutions tied to errors or refactors |
| `todos.md` | `todo-logger` | `/log-todo` | Pending work, deferred decisions, technical debt |
| `milestones.md` | `milestone-logger` | `/log-milestone` | Phase boundaries, releases, demos, sign-offs |
| `changelog.md` | `recap-agent` | `/changelog` | User-visible changes per release |
| `recap.md` | `recap-agent` | `/recap` | On-demand state-of-project synthesis |

## Conventions

- One entry = one timestamped block.
- Format: `## [YYYY-MM-DD HH:MM] <Title>` then body with `- Field: value` lines.
- Entries are **append-only**. Never edit prior entries; correct via a new entry referencing the original ID.
- IDs: `ERR-NNN`, `FIX-NNN`, `TODO-NNN`, `MS-NNN`. Zero-padded, monotonic.
- Cross-link: `FIX-007 resolves ERR-014`.
- Severity (errors): `🔴 critical | 🟠 high | 🟡 med | 🔵 low`.
- Status (todos): `[ ] open | [~] in_progress | [x] done | [-] cancelled`.
- Classification labels follow platform rules: Public / Internal / Confidential / Secret.
- No PII, no tokens, no secrets. Redact paths inside user home dirs.

## How agents append

Each logging agent uses Edit/Bash to append a new block at end of file.
Never rewrites; never reorders. If the file is missing, recreates from template.
