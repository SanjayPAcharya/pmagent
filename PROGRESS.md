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

- **Current phase:** Phase 1 — Skeleton + Auth + Platform
- **Now:** ✅ **Stage C (Org + Project CRUD) complete & verified.** Orgs CRUD (creator→OWNER) + members; Projects CRUD; RBAC via `requireOrgRole`/`assertOrgRole`; global error handler (ApiError + Zod→400). Verified with real tokens: create/list/get, project create/list, validation 400, last-owner guard 400, non-member → 403. Stages A+B still green.
- **Next:** Stage D — frontend auth (keycloak-js login/signup/social) + org/project UI + typed API client.
- **Blocked:** none. Note: `corepack` 0.29 needs `COREPACK_INTEGRITY_KEYS=0` for `pnpm install`. (Automated API tests for auth/org/project land in Stage E; verified manually so far.)

---

## Phase 1 — Skeleton, Auth (Keycloak), Platform → [plan](agentpm-plan/phases/phase-1-skeleton-auth-platform.md)
**Status:** 🟡 in progress — **Stages A + B + C done (boots, auth, platform CRUD)**; Stages D–E pending

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
- [~] Vite + React 18 + TS + Tailwind — done; **shadcn/ui init pending**
- [ ] React Router + protected layout / auth guard
- [ ] keycloak-js auth (login, signup, social buttons, silent refresh)
- [ ] Dashboard + org/project navigation
- [ ] Typed API client (attaches token + refresh-on-401) — placeholder fetch only so far

Identity (external prereqs)
- [x] Keycloak realm running locally (email/password first)
- [ ] Google OAuth client · Azure App Registration · GitHub OAuth App → wired as Keycloak IdPs

**Exit:** sign up (email/Google/Microsoft/GitHub) → create org → create project; `docker compose up` runs the full stack; auth + org/project tests pass.

---

## Phase 2 — Containerized Deployment + CI/CD → [plan](agentpm-plan/phases/phase-2-dev-deployment-cicd.md)
**Status:** ⬜ not started
- [ ] `docker-compose.prod.yml` + Caddy config + `Makefile` (`up-managed` / `up-selfhost`)
- [ ] Provision managed data (RDS + ElastiCache) + create `agentpm`/`keycloak` DBs
- [ ] Provision VM + DNS (`agentpm.io` / `api.` / `auth.`)
- [ ] Prod `.env` on VM (managed endpoints, locked perms)
- [ ] GitHub Actions CI (lint/typecheck/test) + CD (build/push images → migrate → `compose up -d`)
- [ ] Deploy to staging end-to-end + hardening checklist

---

## Phase 3 — PM Core (tickets, board, sprints, realtime) → [plan](agentpm-plan/phases/phase-3-pm-core.md)
**Status:** ⬜ not started
- [ ] Migration: ticket/sprint/label/comment models
- [ ] Tickets CRUD + per-project numbering + status transitions
- [ ] Sprints CRUD + start/complete
- [ ] Event bus (Redis pub/sub) + WebSocket server + auth handshake
- [ ] Kanban board (dnd-kit) + ticket drawer + sprint view + live updates

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
| 2026-06-23 | P1/C | Stage C (platform CRUD): Organizations CRUD + members (creator→OWNER, last-owner guard, add-by-email), Projects CRUD; shared authz (`assertOrgRole`/`requireOrgRole`/RBAC), slug helper, global error handler (ApiError + ZodError→400). Verified with real tokens: CRUD, validation 400, last-owner 400, non-member 403. | 2560397 |
| 2026-06-23 | P1/B | Stage B (API auth): @fastify/jwt + get-jwks JWKS verification (iss/aud); issuer vs JWKS host decoupled (no /etc/hosts). `requireAuth` + JIT User provisioning, `requireOrgRole` + RBAC, `GET`/`PATCH /api/me`. Verified with real Keycloak token: 401/tampered→401, valid→200, PATCH ok, idempotent (1 row). | 8f6d5c6 |
| 2026-06-23 | P1/A | Fix: local dev = plain HTTP (no TLS). Added dev-only `keycloak-init` (shares KC netns, sets master realm `sslRequired=NONE` on every up) so the admin console works over HTTP; not in prod overlay (prod keeps HTTPS via Caddy). Synced ref 12. | beac2c9 |
| 2026-06-23 | P1/A | Fix: moved prod Keycloak flags (start --optimized, KC_HOSTNAME, KC_PROXY_HEADERS, KC_HTTP_ENABLED) out of compose base → dev base now `start-dev`. Resolves admin-console "HTTPS required" on localhost. Synced ref 12 (base dev-safe; prod flags in prod overlay). | beac2c9 |
| 2026-06-23 | P1/A | Stage A scaffold: monorepo, Dockerfiles, compose (base+dev), Postgres init, Keycloak realm, Prisma schema+init migration, Fastify `/health`, Vite/React/Tailwind shell. Verified: install, typecheck, build, test, `docker compose up` (5 services green), `/health` 200, realm imported, migration applied. | beac2c9 |
| 2026-06-23 | — | Progress tracker created; repo not yet scaffolded | — |
