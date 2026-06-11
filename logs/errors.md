# Errors log

Append-only. ID format: `ERR-NNN`. Severity: 🔴 critical · 🟠 high · 🟡 med · 🔵 low.

---

## [2026-05-22 02:14] ERR-001 — TS2322 in src/services/auth.ts

- Severity: 🟡 med
- Area: services/auth
- Discovery: `pnpm typecheck`
- Symptom: `Type 'User | undefined' is not assignable to type 'User | null'.`
- Cause: `apiFetch<User>` returns `data?: T`; consumer assumed non-optional.
- Status: resolved by FIX-001.
- Classification: Internal

## [2026-05-22 02:14] ERR-002 — TS2344 in src/services/database.ts

- Severity: 🟡 med
- Area: services/database
- Discovery: `pnpm typecheck`
- Symptom: `Type 'T' does not satisfy the constraint 'QueryResultRow'.`
- Cause: `pg`'s `query<T>` requires T extends `QueryResultRow`; wrapper didn't constrain.
- Status: resolved by FIX-002.
- Classification: Internal

## [2026-05-27 14:25] ERR-003 — sample test error
- Actor: analyst@example.ae
- Kind: runtime
- Area: src/test
- Message: NPE in handler
- Classification: Internal
- Status: [ ] open

## [2026-06-10 03:36] ERR-004 — pnpm build fails prerendering /404 — "<Html> should not be imported outside of pages/_document"

- Severity: 🔴 critical
- Area: build (Next.js prerender)
- Discovery: `pnpm build`
- Symptom: `pnpm build` on clean main (commit 5e9ee15) fails during "Generating static pages". Prerender of /404 throws `Error: <Html> should not be imported outside of pages/_document.` at `.next/server/chunks/6011.js`, then `Export encountered an error on /_error: /404, exiting the build.` Build worker exits code 1.
- Reproduction: verified pre-existing — `git stash` to zero working-tree changes, then `pnpm build` still fails. Not caused by 2026-06-10 i18n/Arabic-first changes.
- Environment: Next.js 15.5.18, app router. `pnpm dev` unaffected.
- Cause: suspected — something importing `next/document`, or a dependency rendering a pages-router error shell during app-router /404 prerender. Unconfirmed.
- Impact: blocks production builds → blocks deploy.
- Status: resolved by FIX-005.
- Classification: Internal
