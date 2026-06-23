# AgentPM — Source Code (monorepo)

This is the **pnpm workspace root** for AgentPM. All application code, infra-as-config, and Docker/Compose files live here. Run all `pnpm` / `docker compose` commands from this directory.

**Meta lives one level up, in the repo root (`../`):**
- [`../agentpm-plan/`](../agentpm-plan/README.md) — the spec (what to build, per phase)
- [`../PROGRESS.md`](../PROGRESS.md) — live build status (update after every step)

## Layout (filled in during Phase 1)

```
sourcecode/
├── apps/
│   ├── api/         # Fastify backend
│   └── web/         # Vite + React SPA (served by nginx in a container)
├── packages/
│   └── shared-types/
├── infra/
│   ├── postgres/init/      # creates agentpm + keycloak DBs
│   └── keycloak/           # realm-agentpm.json
├── docker-compose.yml          # base
├── docker-compose.override.yml # dev (hot reload)
├── package.json  pnpm-workspace.yaml  turbo.json
└── .env.example
```

## Quick start (once scaffolded)

```bash
cd sourcecode
cp .env.example .env
docker compose up        # postgres + redis + keycloak (containers) + api + web (hot reload)
```
