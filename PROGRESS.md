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
- **Now:** ✅ **Stage A complete — verified locally & committed (`_pending_`, not pushed).** `docker compose up` brings up api + web + keycloak + postgres + redis (all green); API `/health` 200, `agentpm` realm imported, init migration applied, Keycloak admin reachable over HTTP.
- **Next:** Stage B — auth (JWKS verify, `requireAuth` + JIT provisioning, `/api/me`)
- **Blocked:** none. Notes for next session: (1) `corepack` 0.29 needs `COREPACK_INTEGRITY_KEYS=0` for `pnpm install`; (2) before Stage B add `127.0.0.1 keycloak` to `/etc/hosts` and switch the Keycloak URLs to `http://keycloak:8080` so token `iss` matches (see phase-1 gotchas).

---

## Phase 1 — Skeleton, Auth (Keycloak), Platform → [plan](agentpm-plan/phases/phase-1-skeleton-auth-platform.md)
**Status:** 🟡 in progress — **Stage A done (boots & verified)**; Stages B–E pending

Scaffold & data
- [x] Monorepo: pnpm workspaces + Turborepo (`package.json`, `pnpm-workspace.yaml`, `turbo.json`)
- [x] Prisma schema + first migration (User, Organization, OrgMember, Project) — applied to Postgres

Local container stack (so `docker compose up` works)
- [x] `apps/api/Dockerfile` + `apps/web/Dockerfile`
- [x] `docker-compose.yml` (base) + `docker-compose.override.yml` (dev) + `.env.example`
- [x] Postgres init script (`agentpm` + `keycloak` DBs)
- [x] Local Keycloak container + committed `realm-agentpm.json` (clients, audience mapper, self-registration)

Backend
- [~] Fastify bootstrap + middleware — CORS, rate-limit, websocket, `/health` done; **JWKS verify pending (Stage B)**
- [ ] Auth middleware (`requireAuth` + JIT user provisioning, `requireOrgRole`) + RBAC
- [ ] `GET`/`PATCH /api/me`
- [ ] Organizations CRUD + member management
- [ ] Projects CRUD (no GitHub repo link yet)

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
| 2026-06-23 | P1/A | Fix: local dev = plain HTTP (no TLS). Added dev-only `keycloak-init` (shares KC netns, sets master realm `sslRequired=NONE` on every up) so the admin console works over HTTP; not in prod overlay (prod keeps HTTPS via Caddy). Synced ref 12. | _pending_ |
| 2026-06-23 | P1/A | Fix: moved prod Keycloak flags (start --optimized, KC_HOSTNAME, KC_PROXY_HEADERS, KC_HTTP_ENABLED) out of compose base → dev base now `start-dev`. Resolves admin-console "HTTPS required" on localhost. Synced ref 12 (base dev-safe; prod flags in prod overlay). | _pending_ |
| 2026-06-23 | P1/A | Stage A scaffold: monorepo, Dockerfiles, compose (base+dev), Postgres init, Keycloak realm, Prisma schema+init migration, Fastify `/health`, Vite/React/Tailwind shell. Verified: install, typecheck, build, test, `docker compose up` (5 services green), `/health` 200, realm imported, migration applied. | _pending_ |
| 2026-06-23 | — | Progress tracker created; repo not yet scaffolded | — |
