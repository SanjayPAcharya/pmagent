# AgentPM — Implementation Progress

> **Live status of the monorepo build.** The plan (what to build) lives in [`agentpm-plan/`](agentpm-plan/README.md); the code lives in [`sourcecode/`](sourcecode/README.md) (the pnpm workspace root — all paths below are relative to it). This file tracks **what's actually been done**. Load this first each session to see where things stand.

## How to use this file (the convention)

- **Update it after every implemented step** — same commit as the code. A "step" = one checkbox below.
- Status markers: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked.
- When you finish a step: tick its box, and add a one-line entry to the **Log** (newest first) with the date + commit/PR.
- Keep **Now / Next / Blocked** current — it's the 5-second answer to "where are we?".
- Don't duplicate plan detail here; link to the phase file for the how.

---

## Now / Next / Blocked

- **Current phase:** Phase 2 — PM Core
- **Now:** 🟡 **Phase 2 in progress — 2A–2D done (backend complete + frontend foundation).** 2D adds: shadcn/ui infra (`components.json`, `lib/utils` cn, `@/*` tsconfig paths, theme tokens + CSS vars, base ui: button/input/card/badge/avatar); routing restructure (always-on Router; public `/invite/:token` vs gated via `RequireAuth`→Landing); `InviteAccept` page (sign-in-to-accept→returns to token, auto-accept→redirect to org); members endpoint enhanced (+avatarUrl + initials fallback) + `api.listMembers`/`createInvite`/`acceptInvite`; typed WS client `useProjectWebSocket` (token refresh before connect, backoff reconnect, refetch-on-reconnect, self-echo dedupe) on shared `WSMessage`. web typecheck + vite build green; api typecheck + **29 tests** still green.
- **Next:** **2E — Board & drawer & verify:** Kanban (dnd-kit + position) + quick-add + JIRA status; ticket drawer (comments/activity/assignee/watchers/labels/due, sanitized markdown+@mention); sprint view + completion bars; optimistic UI + toasts + skeletons; notification bell. **Verify in-browser; fill remaining API test gaps; close Phase 2.**
- **Blocked:** none. Notes: **after changing any app's deps, rebuild that container** (`docker compose build api|web && docker compose up -d …`) — `node_modules` lives in the image (only `apps/*`+`packages` source is mounted), so the running dev container won't see new deps and will crash (`ERR_MODULE_NOT_FOUND` / Vite "Failed to resolve import"). Hit this for both 2B/2C (api: swagger/redis/zod-provider) and 2D (web: radix/shadcn). `corepack` flake — pin `corepack pnpm@9.12.0` (bare `corepack pnpm` grabbed 11.8.0 → `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`); `COREPACK_INTEGRITY_KEYS=0` still needed for install. Realtime tests need Redis (host `:6379`); other test files stay hermetic. CI (Postgres+Redis+Playwright) finalized in Phase 3.

---

## Phase 1 — Skeleton, Auth (Keycloak), Platform → [plan](agentpm-plan/phases/phase-1-skeleton-auth-platform.md)
**Status:** ✅ **COMPLETE (Stages A–E)** — boots, auth, platform CRUD, frontend, tests green. (Optional: social IdP external apps.)

Scaffold & data
- [x] Monorepo: pnpm workspaces + Turborepo (`package.json`, `pnpm-workspace.yaml`, `turbo.json`)
- [x] Prisma schema + first migration (User, Organization, OrgMember, Project) — applied to Postgres

Local container stack (so `docker compose up` works)
- [x] `apps/api/Dockerfile` + `apps/web/Dockerfile`
- [x] `docker-compose.yml` (base) + `docker-compose.override.yml` (dev) + `.env.example`
- [x] Postgres init script (`agentpm` + `keycloak` DBs)
- [x] Local Keycloak container + committed `realm-agentpm.json` (clients, audience mapper, self-registration)

Backend
- [x] Fastify bootstrap + middleware — CORS, rate-limit, websocket, `/health`, **JWKS token verification (iss + aud)**
- [x] Auth middleware (`requireAuth` + JIT user provisioning, `requireOrgRole`) + RBAC
- [x] `GET`/`PATCH /api/me`
- [x] Organizations CRUD + member management
- [x] Projects CRUD (no GitHub repo link yet)

Frontend
- [x] Vite + React 18 + TS + Tailwind (shadcn/ui deferred — plain Tailwind for now)
- [x] React Router + protected layout / auth gate
- [x] keycloak-js auth (login, signup, PKCE, token auto-refresh; social shown on the KC page once IdPs added)
- [x] Dashboard + org/project navigation
- [x] Typed API client (attaches token + refresh-before / retry-on-401)

Identity (external prereqs)
- [x] Keycloak realm running locally (email/password first)
- [ ] Google OAuth client · Azure App Registration · GitHub OAuth App → wired as Keycloak IdPs (optional)

Tests (Stage E)
- [x] Hermetic auth harness (RSA keypair + static JWKS stand-in; no Keycloak in CI)
- [x] API tests green — auth middleware (6), organizations (4), projects (2), health (1) = 13

**Exit:** sign up (email/Google/Microsoft/GitHub) → create org → create project; `docker compose up` runs the full stack; auth + org/project tests pass.

---

## Phase 2 — PM Core (tickets, board, sprints, realtime) → [plan](agentpm-plan/phases/phase-2-pm-core.md)
**Status:** 🟡 in progress — **2A–2D done (backend + FE foundation); 2E (board/drawer/verify) closes the phase.**
- [x] **2A** Migration: ticket/sprint/label(+org rel)/comment + `TicketWatcher`/`TicketActivity`/`OrgInvite`/in-app `Notification`; ticket `dueDate`/`archivedAt`; `Project.key`+`ticketCounter` (+backfill); onDelete clauses; project-create derives key; idempotent seed; test truncation extended
- [x] **2B** Tickets backend: transactional create + atomic numbering, `updateTicket` service + activity, comments, assignee/watchers, cross-scope validation, search/filter/sort (whitelist) + cursor pagination, Swagger (zod-provider), `/ready` + graceful shutdown
- [x] **2C** Sprints + completion counts; event bus init/dispose; WS server (project+user rooms, presence, hardened handshake) + shared `WSMessage`; caller-scoped in-app notifications; org invite tokens (role-capped, single-use)
- [x] **2D** Frontend foundation: **shadcn/ui**, routing restructure (public `/invite/:token` vs gated), members endpoint + `api.listMembers`, typed WS client (refresh + reconnect-refetch + echo-dedupe)
- [ ] **2E** Board (dnd-kit + position) + quick-add + drawer (comments/activity/assignee/watchers/labels/due) + sprint view + completion bars + optimistic UI/toasts/skeletons + notification bell + deep-link; **verify in-browser**
- [ ] API + WS tests (CRUD, RBAC, pagination round-trip, soft-delete, invite, notification IDOR, WS handshake); REDIS_URL + truncation order in harness
- Dropped/deferred: `bulk-update` (deferred); dark mode/i18n/mobile/Cmd-K/Playwright → **Phase 2.5**

---

## Phase 2.5 — UX Hardening → [plan](agentpm-plan/phases/phase-2.5-ux-hardening.md)
**Status:** ⬜ not started (after Phase 2 verified)
- [ ] Dark mode (Tailwind `darkMode:'class'` + toggle; retrofit existing components)
- [ ] i18n (react-i18next, `en` baseline, externalize all strings incl. Phase-1)
- [ ] Mobile-responsive board + drawer
- [ ] Cmd-K command palette
- [ ] Playwright E2E (Keycloak storageState; CI wiring in Phase 3) + a11y pass

---

## Phase 3 — Containerized Deployment + CI/CD → [plan](agentpm-plan/phases/phase-3-dev-deployment-cicd.md)
**Status:** ⬜ not started
- [ ] `docker-compose.prod.yml` + Caddy config + `Makefile` (`up-managed` / `up-selfhost`)
- [ ] Provision managed data (RDS + ElastiCache) + create `agentpm`/`keycloak` DBs
- [ ] Provision VM + DNS (`agentpm.io` / `api.` / `auth.`)
- [ ] Prod `.env` on VM (managed endpoints, locked perms)
- [ ] GitHub Actions CI (lint/typecheck/test) + CD (build/push images → migrate → `compose up -d`)
- [ ] Deploy to staging end-to-end + hardening checklist

---

## Phase 4 — GitHub Integration + Code Agent → [plan](agentpm-plan/phases/phase-4-github-code-agent.md)
**Status:** ⬜ not started
- [ ] GitHub App + connect flow + webhook receiver
- [ ] Shared agent utils + repo reader + code generator + PR creator
- [ ] BullMQ queue + concurrency guard + worker service
- [ ] AgentAction logging + rollback + approval gate
- [ ] Frontend: assign agent, activity feed, approval UI, PR link
- [ ] Trial/billing guard on agent runs (cost control)

---

## Phase 5 — Notifications & Channels → [plan](agentpm-plan/phases/phase-5-notifications-channels.md)
**Status:** ⬜ not started
- [ ] Email (SES) + notification worker + sprint digest cron
- [ ] WhatsApp + Slack two-way (post-MVP)

---

## Phase 6 — Full Agent Suite + Autonomy → [plan](agentpm-plan/phases/phase-6-agent-suite-autonomy.md)
**Status:** ⬜ not started
- [ ] Spec / QA / Deploy / Observability agents (+ per-run container isolation)
- [ ] Autonomy dial (server-side enforcement; prod always human)

---

## Phase 7 — Autonomous Sprints → [plan](agentpm-plan/phases/phase-7-autonomous-sprints.md)
**Status:** ⬜ not started
- [ ] Sprint Planner Agent + multi-agent coordination + parallel workstreams + analytics

---

## Log (newest first)

| Date | Phase | Step / change | Commit |
|---|---|---|---|
| 2026-06-24 | P2/D | Stage 2D (frontend foundation): shadcn/ui infra (`components.json`, `lib/utils.ts` cn, `@/*` paths in web tsconfig, tailwind theme tokens + `index.css` CSS vars, base ui: button/input/card/badge/avatar; deps cva/clsx/tailwind-merge/tailwindcss-animate/lucide-react/radix slot+avatar + `@agentpm/shared-types`). Routing restructure in `App.tsx` (always-on Router; public `/invite/:token`; gated via `RequireAuth`→Landing). `pages/InviteAccept.tsx` (unauth → sign-in-to-accept returns to token; authed → auto-accept → redirect to org). Backend `GET /orgs/:slug/members` enhanced (+`avatarUrl`, `initials` fallback). `lib/api.ts` +Member/Invite types +`listMembers`/`createInvite`/`acceptInvite`. `lib/websocket.ts` `useProjectWebSocket` (refresh-before-connect, backoff reconnect, refetch-on-reconnect, self-echo dedupe) on shared `WSMessage`. Layout sign-out → Button. Verified: web typecheck + vite build, api typecheck + 29 tests; full docker stack healthy (in-browser confirmed). | aec19c5 |
| 2026-06-24 | P2/C | Stage 2C (sprints + realtime + notifications + invites, backend): `routes/sprints.ts` (CRUD, start/complete+velocity, add/remove tickets w/ cross-scope guard, completion counts via groupBy); `websocket/ws-server.ts` (`/ws` handshake: auth-timeout→4001, `auth/verify-token.ts` shared jose JWKS verifier, project-membership gate, project+user rooms, presence, fan-out by projectId/userId); `services/notifications.service.ts` (subscribe ticket.* → recipients assignee/creator/watchers/@mentioned − actor → `Notification` rows + `notification.new`); org invites (CSPRNG token, role-cap, single-use, expiry) on org routes + `routes/invites.ts` accept; `routes/notifications.ts` caller-scoped (IDOR-safe). Event bus refactored to single Redis subscription → multi-handler dispatch; wired in `buildServer` + `onClose` dispose. Shared `WSMessage`/`WSEventType`. +10 tests (sprints, invites single-use/expiry, notification IDOR, WS timeout/auth/delivery). Verified: typecheck, build, **29 tests**. | 25c278d |
| 2026-06-24 | P2/B | Stage 2B (tickets backend): `routes/tickets.ts` (CRUD + soft-delete, status quick-change, comments, watchers, activity, list) via `fastify-type-provider-zod`; `tickets.service.ts` — transactional create + atomic numbering (`Project.ticketCounter`), `updateTicket` writing `TicketActivity` + returning post-commit events, cross-scope validation (assignee/labels/sprint/parent/deps); cursor pagination helper (Prisma keyset, id tiebreaker); lazy Redis `event-bus.ts` (`publishEvent` no-op until 2C); Swagger `/documentation`; `/ready` + SIGTERM/SIGINT graceful shutdown. +6 ticket API tests (numbering, RBAC 403, assign/activity, cross-scope 400, pagination round-trip, soft-delete). Verified: db:generate, typecheck, build, **19 tests**. | ac32a7e |
| 2026-06-24 | P2/A | Stage 2A (data): Phase-2 Prisma schema (Ticket/Sprint/Label/Comment/TicketDependency/TicketWatcher/TicketActivity/OrgInvite/in-app Notification + enums; agent scalar cols kept, agent tables deferred); `Project.key`+`ticketCounter`; onDelete clauses; Label↔Org relation. Hand-written migration with `key` backfill (existing projects → WEBA/EMPL). Project-create derives+dedupes key. Idempotent `db:seed`. Test truncation extended to new tables. Verified: migrate deploy, prisma generate, typecheck, build, 13 tests, seed×2. | c97352d |
| 2026-06-24 | plan | Phase 2/2.5 re-verify: no new Tier-1 blockers. Folded refinements — per-user rate-limit keying happens pre-auth (key off JWT sub in keyGenerator); soft-delete filters in list queries only (fetch-by-id/restore unaffected, no global Prisma hide); add `NotificationType`/`NotificationChannel` enums in 2A; `updateTicket` returns events to publish after commit; members endpoint enhances the Phase-1 route (+avatarUrl, initials fallback); E2E cross-user notification asserted via API. | fa3872e |
| 2026-06-23 | plan | Phase 2 audit (7-dim workflow, 62 findings) → folded Tier-1 fixes into plan: notification IDOR scoping, org-bounded @mention + server sanitize, invite token entropy/single-use/role-cap, sort whitelist + cursor tiebreaker, cross-scope validation, publish-after-commit + transactional create + `updateTicket` service, position scheme, onDelete + Label org relation, WS handshake hardening + self-echo dedupe + refetch-on-reconnect + shared `WSMessage`, public/gated routing, members endpoint, graceful shutdown, zod-provider scope, per-user rate limit. Defined sub-stages 2A–2E. Split **Phase 2.5 (UX hardening)**; dropped `bulk-update`; adopted shadcn. Updated phase-2, new phase-2.5, 03/04/06/07 refs, README, PROGRESS. | 37f5681 |
| 2026-06-23 | plan | Phase 2 blockers resolved in plan: (1) shared jose WS verifier + @fastify/websocket v11 `(socket,req)` signature; (2) lazy event bus init/dispose (tests use Redis); (3) atomic ticket numbering via `Project.ticketCounter`; (4) `Project.key` for AGP-42 + migration backfill; (5) `fastify-type-provider-zod` for validation+Swagger. Updated phase-2, 03-data-models, 04-api-reference. | 37f5681 |
| 2026-06-23 | plan | Phase 2 scope round 2: invite links, due date, soft-delete, search/filter/sort + cursor pagination, deep-link ticket route, optimistic UI/toasts/skeletons, quick-add + Cmd-K, markdown+@mention (DOMPurify), presence, in-app notification bell (WS user rooms → assignee/creator/watchers/mentioned), Swagger + /ready + seed, dark mode, i18n scaffold, mobile, Playwright E2E. Models: `OrgInvite` + in-app `Notification`, ticket `dueDate`/`archivedAt`. Decisions kept: org=project access, attachments deferred. | ae75857 |
| 2026-06-23 | plan | Phase 2 scope additions (feedback): clean/smooth/creative UI guideline, JIRA-style quick status change, assignee, watchers/CC, activity timeline, completion progress bar. Added `TicketWatcher` + `TicketActivity` models + watcher/activity endpoints. Not yet implemented. | 585ff49 |
| 2026-06-23 | plan | Re-sequenced phases: **Phase 2 = PM Core**, **Phase 3 = Deployment + CI/CD** (swapped). Renamed phase files + updated all headings, cross-refs, links, README flow/index, PROGRESS. | 9528d39 |
| 2026-06-23 | P1/E | Stage E (tests): hermetic auth harness (jose RSA keypair + in-test JWKS/OIDC stand-in, no Keycloak), Vitest globalSetup (creates+migrates `agentpm_test`) + per-worker truncation. Suites: auth middleware (6), organizations (4), projects (2) + health (1) = 13 green. Removed temp debug log. **Phase 1 complete.** | 8de7afe |
| 2026-06-23 | P1/D | Stage D (frontend): keycloak-js auth (login/signup, PKCE, token refresh), auth-gated React Router + Layout, typed API client (token attach + retry-on-401), Dashboard (orgs + create) + OrgProjects (projects + create) via React Query. Verified in-browser by user: signup → create org (OWNER) → create project. shadcn deferred (plain Tailwind). | 140d01c |
| 2026-06-23 | P1/C | Stage C (platform CRUD): Organizations CRUD + members (creator→OWNER, last-owner guard, add-by-email), Projects CRUD; shared authz (`assertOrgRole`/`requireOrgRole`/RBAC), slug helper, global error handler (ApiError + ZodError→400). Verified with real tokens: CRUD, validation 400, last-owner 400, non-member 403. | 2560397 |
| 2026-06-23 | P1/B | Stage B (API auth): @fastify/jwt + get-jwks JWKS verification (iss/aud); issuer vs JWKS host decoupled (no /etc/hosts). `requireAuth` + JIT User provisioning, `requireOrgRole` + RBAC, `GET`/`PATCH /api/me`. Verified with real Keycloak token: 401/tampered→401, valid→200, PATCH ok, idempotent (1 row). | 8f6d5c6 |
| 2026-06-23 | P1/A | Fix: local dev = plain HTTP (no TLS). Added dev-only `keycloak-init` (shares KC netns, sets master realm `sslRequired=NONE` on every up) so the admin console works over HTTP; not in prod overlay (prod keeps HTTPS via Caddy). Synced ref 12. | beac2c9 |
| 2026-06-23 | P1/A | Fix: moved prod Keycloak flags (start --optimized, KC_HOSTNAME, KC_PROXY_HEADERS, KC_HTTP_ENABLED) out of compose base → dev base now `start-dev`. Resolves admin-console "HTTPS required" on localhost. Synced ref 12 (base dev-safe; prod flags in prod overlay). | beac2c9 |
| 2026-06-23 | P1/A | Stage A scaffold: monorepo, Dockerfiles, compose (base+dev), Postgres init, Keycloak realm, Prisma schema+init migration, Fastify `/health`, Vite/React/Tailwind shell. Verified: install, typecheck, build, test, `docker compose up` (5 services green), `/health` 200, realm imported, migration applied. | beac2c9 |
| 2026-06-23 | — | Progress tracker created; repo not yet scaffolded | — |
