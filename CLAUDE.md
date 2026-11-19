# PmAgent — repo conventions

PmAgent by Buildenics is an AI-agent-first project-management app. One owner builds it with six Claude Code role sessions, run in sequence. Repo, package and realm identifiers stay `agentpm`.

## Layout
- **`BOARD.md`** is the live status: every work item by group (pending → ready → building → completed), its stage, and the next role. Read it first, and update your item's row when you hand off.
- **`docs/`** holds everything that isn't code. Map: [docs/README.md](docs/README.md).
  - `docs/workflow/`: the six-role pipeline, the role guides, the work-item template.
  - `docs/phases/{1-pending,2-ready,3-building,4-completed}/`: one file per work item. It moves between folders (`git mv`) as it advances.
  - `docs/product/`: overview, roadmap, and `features.md`, the plain-language user guide.
  - `docs/reference/`: technical specs. `00-local-runbook.md` covers running everything locally.
  - `docs/reports/` (audits, AI evals) and `docs/history/` (the frozen pre-2026-11-19 PROGRESS log).
- **`sourcecode/`** is the pnpm workspace root; run all `pnpm` / `docker compose` commands from there. It contains `apps/api` (Fastify + Prisma), `apps/web` (Vite + React), `packages/shared-types` and `infra/`.

## How we work
- **Six roles, one per session, in order:** Planning → Product Manager → Developer → Reviewer → Tester → DevOps. A session starts with its command (`/pmagent-planning`, `/pmagent-pm`, `/pmagent-dev`, `/pmagent-review`, `/pmagent-test`, `/pmagent-devops`), follows `docs/workflow/roles/<n>-*.md`, and stays in role. Full rules: [docs/workflow/README.md](docs/workflow/README.md).
- **Every handoff:** update the item's header line and Handoff log, update its BOARD row, and commit.
- **One item in `3-building/` at a time, on its own `feat/<phase>-<slug>` branch.** Work slowly: small steps, and check in with the owner.
- **Never `git push` or merge to `main` without the owner's explicit OK.** `main` is frozen while prod is parked, because a push to `main` runs the AWS deploy workflow.
- **Local-only:** everything runs in Docker on this machine. Prod and AWS work is parked (see BOARD.md).
- **User-facing change** → update `docs/product/features.md` in the same commit (plain language; refresh its date).

## Conventions
- Auth is Keycloak (OIDC). The API only verifies tokens (JWKS) and never stores credentials.
- Secrets never go in code or images. Commit `.env.example`, never `.env`.
- API routes:
  - `requireAuth` plus an org-role check on every route;
  - zod validation on input;
  - throw `ApiError` (`apps/api/src/lib/errors.ts`) rather than hand-rolling error responses.
- All in-product AI goes through the `AIProvider` seam (`apps/api/src/services/ai.service.ts`, where `resolveProvider(orgId)` is the single switch). Never wire a route or button to a specific provider.
- Web UI standards (product-wide, from Phase 3.7.2):
  - **Inline validation:** `aria-invalid` + `FieldError`.
  - **Empty states:** the shared `EmptyState` component.
  - **Blocked / danger:** the `--destructive` token, never hardcoded reds.
  - **Async buttons:** `Loader2` + `disabled` on every one.
  - **Confirms:** two-click and inline, with a count and a ~4s reset.
  - **Focus:** a visible `:focus-visible` ring.
- Web copy and styling:
  - All copy goes through `t('…')` (`locales/en.json`), all colours through tokens, and icons are lucide only.
  - Don't add modal dialogs for confirmations or forms; the ⌘K palette and the `?` help overlay are the existing exceptions.
  - No form library, no illustrations. Keep PmAgent's own inline, keyboard-first feel rather than copying Jira or Monday.

## Dev-stack gotchas (details in `docs/reference/00-local-runbook.md`)
- **Prisma schema change:** `docker compose exec api pnpm --filter @agentpm/api exec prisma generate && docker compose restart api`. A host-side generate doesn't reach the container.
- **Any edit under `apps/api/src`:** `docker compose restart api` before verifying (tsx watch misses macOS bind-mount events).
- **`infra/keycloak/realm-agentpm.json`** only seeds a new Keycloak, because `--import-realm` skips an existing realm. Realm-level changes also need a kcadm step (`keycloak-init` for dev, `infra/keycloak/prod-bootstrap.sh` for prod).
- **Fresh clone:** run `pnpm install` on the host before `docker compose up`, or api/web exit with "tsx/vite: not found".
