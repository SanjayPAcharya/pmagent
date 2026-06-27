# PMAgent

AI-agent-first project management for software teams — a full kanban + sprint board (think JIRA/Linear) with real-time collaboration, and (in progress) AI agents that execute tickets through a GitHub-native ticket → PR pipeline.

> **Status:** under active development. Phases 1, 2, 2.1, 2.5, 2.6, 2.8, 2.8.5 are complete (PM core, real-time, branding, in-app social sign-in). See **[PROGRESS.md](PROGRESS.md)** for live build status and **[agentpm-plan/](agentpm-plan/README.md)** for the full plan.

## Repository layout

| Path | What |
|---|---|
| [`agentpm-plan/`](agentpm-plan/README.md) | The spec — phases + shared reference docs (source of truth for design) |
| [`PROGRESS.md`](PROGRESS.md) | Live build status, updated per step |
| [`sourcecode/`](sourcecode/README.md) | The pnpm / Turborepo workspace — `apps/api` (Fastify), `apps/web` (Vite/React), `packages/`, `infra/` |
| [`CLAUDE.md`](CLAUDE.md) | Repo conventions |

## Stack

Vite + React 18 + Tailwind/shadcn (web) · Fastify + Prisma + PostgreSQL (api) · Keycloak (OIDC auth) · Redis (real-time + queues) · everything containerized with Docker Compose (same images dev → prod).

## Quick start (local dev)

Requires **Docker** and **pnpm 9.x** + **Node 20+**.

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

> Social sign-in (Google / Microsoft / GitHub) needs OAuth apps registered — see [references/13-social-login-setup.md](agentpm-plan/references/13-social-login-setup.md). Containerized deployment + CI/CD lands in Phase 3.
