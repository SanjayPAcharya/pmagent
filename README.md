# PmAgent by Buildenics

AI-agent-first project management for software teams: a full kanban + sprint board with real-time collaboration, a Timeline (Gantt), milestones, reports and AI ticket drafting. Still ahead are AI agents that work tickets through a GitHub-native ticket → pull request pipeline.

> **Status:** under active development, **local-first** (production deployment is parked). Live status is **[BOARD.md](BOARD.md)**; the docs are in **[docs/](docs/README.md)**.

## Repository layout

| Path | What |
|---|---|
| [`BOARD.md`](BOARD.md) | Live status: every work item by group (pending / ready / building / completed), with its stage and the next role |
| [`docs/`](docs/README.md) | Workflow (the six-role pipeline), product docs, phase specs, technical reference, reports, history |
| [`sourcecode/`](sourcecode/README.md) | The pnpm / Turborepo workspace: `apps/api` (Fastify), `apps/web` (Vite/React), `packages/`, `infra/` |
| [`CLAUDE.md`](CLAUDE.md) | Repo conventions (also loaded into every Claude Code session) |
| `.claude/commands/` | Session launchers for the six roles: `/role-planning`, `/role-pm`, `/role-dev`, `/role-review`, `/role-test`, `/role-devops` |

## How the work flows

Six Claude Code sessions run in sequence, each in one role: **Planning → Product Manager → Developer → Reviewer → Tester → DevOps**. Each one picks up from the previous role's handoff note and leaves one for the next. See [docs/workflow/README.md](docs/workflow/README.md).

## Stack

Vite + React 18 + Tailwind/shadcn (web) · Fastify + Prisma + PostgreSQL (api) · Keycloak (OIDC auth) · Redis (real-time + queues) · everything containerized with Docker Compose.

## Quick start (local dev)

Requires **Docker Desktop**, **Node 20+** and **pnpm 9.x**. Full details are in [docs/reference/00-local-runbook.md](docs/reference/00-local-runbook.md).

```bash
cd sourcecode
cp .env.example .env                # dev defaults — all local/dummy
pnpm install --frozen-lockfile      # host install: the dev containers bind-mount these node_modules
docker compose up -d                # postgres + redis + keycloak + api + web

# first run only — initialize the database
docker compose exec api pnpm --filter @agentpm/api exec prisma migrate deploy
docker compose exec api pnpm --filter @agentpm/api exec tsx prisma/seed.ts
```

Then open:
- **App** → http://localhost:3000
- **API** → http://localhost:3001 (`/health`, `/documentation`)
- **Keycloak** → http://localhost:8080

> Social sign-in (Google / Microsoft / GitHub) needs OAuth apps registered; see [docs/reference/13-social-login-setup.md](docs/reference/13-social-login-setup.md).
