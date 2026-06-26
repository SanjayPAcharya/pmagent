# Reference: Docker Topology & Deployment

> Stable reference. **The app runs in Docker — the same images in dev and prod (parity).** The frontend is a container (nginx), not S3/CloudFront. Primary deployment target: **Docker Compose on a VM**; AWS ECS is a documented scale-up path (see [phase-3](../phases/phase-3-dev-deployment-cicd.md)).
>
> **Data placement (key rule):** **in production, state lives on managed cloud services — NOT in containers on the VM.** Postgres → managed (AWS RDS, or Neon/Supabase); Redis → managed (AWS ElastiCache, or Upstash). Only **stateless** app containers (web, api, worker, keycloak, caddy) run on the VM. **In local dev, everything (incl. Postgres + Redis) runs in containers** so a laptop needs nothing but Docker.

## Service topology

### Production — stateless containers on the VM, managed data outside it

```
                         ┌─────────────────────────────┐
   Internet  ──TLS──►     caddy (reverse proxy, HTTPS)        [VM]
                         └──────────────┬──────────────┘
            agentpm.io ──┐      api.agentpm.io ──┐    auth.agentpm.io ──┐
                         ▼                        ▼                      ▼
                   web (nginx, SPA)        api (Fastify :3001)     keycloak (:8080)
                                                 │  │                    │
   ── VM boundary ───────────────────────────────┼──┼────────────────────┼────────────
                                                 │  │                    │
                                                 ▼  ▼                    ▼
                                   ┌──────────────────────┐   ┌──────────────────────┐
                                   │  MANAGED PostgreSQL   │   │  MANAGED Redis        │
                                   │  (AWS RDS)            │   │  (AWS ElastiCache)    │
                                   │  DBs: agentpm,        │   └──────────────────────┘
                                   │       keycloak       │
                                   └──────────────────────┘
        worker (reuses api image; consumes BullMQ — Phase 5) also on the VM
```

### Local dev — everything in containers

```
   docker compose up  →  web + api (hot reload)  +  keycloak
                         +  postgres (container)  +  redis (container)
   (no Caddy, no TLS; talk to localhost:3000 / 3001 / 8080 directly)
```

`caddy` terminates TLS and gets automatic Let's Encrypt certs in prod; dev serves local HTTP. The Postgres instance (managed in prod, container in dev) hosts two logical databases: `agentpm` (app) and `keycloak` (IdP). The api/worker/keycloak containers don't care whether the database is a neighbour container or a managed endpoint — only the `DATABASE_URL` / `REDIS_URL` / `KC_DB_URL` values differ between environments.

## Images (one Dockerfile per buildable service)

### API — `apps/api/Dockerfile`
Multi-stage Node build (see [phase-3](../phases/phase-3-dev-deployment-cicd.md) for the full file). `CMD ["node", "dist/index.js"]`.

### Agent worker — no separate image
Reuses the API image with the command overridden to `node dist/worker.js` (wired in [phase-5](../phases/phase-5-github-code-agent.md)).

### Web (frontend) — `apps/web/Dockerfile`
The SPA is built, then served by nginx. This replaces the old S3+CloudFront hosting so dev and prod serve the frontend identically.

```dockerfile
# apps/web/Dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN pnpm install --frozen-lockfile
COPY . .
# VITE_* are baked in at build time — pass as build args in CI
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT
RUN pnpm turbo build --filter=web

FROM nginx:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
# nginx serves static assets + SPA fallback; routing/TLS handled by Caddy in front
```

```nginx
# apps/web/nginx.conf — SPA fallback so React Router deep links work
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  location / {
    try_files $uri $uri/ /index.html;   # client-side routing
  }
  location /healthz { return 200 'ok'; add_header Content-Type text/plain; }
}
```

> **Build-time env caveat:** because `VITE_*` are compiled into the bundle, the web image is environment-specific. Build it per environment with the right `--build-arg`s (staging vs prod URLs). The API/worker images, by contrast, read config at runtime and are environment-agnostic.

## Reverse proxy — Caddy

```caddyfile
# Caddyfile (prod) — automatic HTTPS via Let's Encrypt
agentpm.io, www.agentpm.io {
  reverse_proxy web:80
}
api.agentpm.io {
  reverse_proxy api:3001
}
auth.agentpm.io {
  reverse_proxy keycloak:8080
}
```

In dev, a minimal `Caddyfile.dev` maps `localhost` (or `*.localhost`) over HTTP so you don't need certs.

## Data placement toggle (Compose profiles) — VM data vs. managed cloud

Where Postgres + Redis run is a **single switch: the `selfhost-data` Compose profile.**

- **Profile OFF (default):** no data containers start; the app uses **managed cloud** Postgres/Redis (`DATABASE_URL`/`REDIS_URL` point at RDS/ElastiCache). Durable, production-grade.
- **Profile ON (`--profile selfhost-data`):** Postgres + Redis run **as containers on the box**, and the endpoints point at those containers. Cheaper — good for local dev and a low-cost dev/staging VM.

You pick the mode at the command line; the matching env file supplies the right connection strings:

```bash
# A) Managed data (prod default) — no profile; data containers never start
docker compose --env-file .env.managed -f docker-compose.yml -f docker-compose.prod.yml up -d

# B) Self-hosted data on the VM (cheap dev/staging) — profile ON
docker compose --profile selfhost-data --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml up -d

# C) Local dev — profile ON + hot reload (override auto-applies; .env defaults COMPOSE_PROFILES)
docker compose up
```

A `Makefile` wraps these so it's one word:

```makefile
dev:            ## local dev, data in containers, hot reload
	docker compose up
up-managed:     ## prod app + managed cloud data
	docker compose --env-file .env.managed -f docker-compose.yml -f docker-compose.prod.yml up -d
up-selfhost:    ## prod app + data containers on the VM (cheapest)
	docker compose --profile selfhost-data --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml up -d
```

The two env files differ only in where data lives:

```bash
# .env.managed — data on managed cloud (no profile)
DATABASE_URL=postgresql://USER:PASS@agentpm-db.xxxx.rds.amazonaws.com:5432/agentpm?sslmode=require
REDIS_URL=rediss://agentpm-cache.xxxx.cache.amazonaws.com:6379
KC_DB_URL=jdbc:postgresql://agentpm-db.xxxx.rds.amazonaws.com:5432/keycloak
KC_DB_USERNAME=keycloak
KC_DB_PASSWORD=...

# .env.selfhost — data in containers on the VM
COMPOSE_PROFILES=selfhost-data      # so plain `docker compose up` also starts the data containers
POSTGRES_PASSWORD=...
DATABASE_URL=postgresql://agentpm:${POSTGRES_PASSWORD}@postgres:5432/agentpm
REDIS_URL=redis://redis:6379
KC_DB_URL=jdbc:postgresql://postgres:5432/keycloak
KC_DB_USERNAME=agentpm
KC_DB_PASSWORD=${POSTGRES_PASSWORD}
```

> **Note:** the profile controls whether the *containers* run; the env file controls where the app *points*. Always pair them (profile ON ↔ `.env.selfhost`; profile OFF ↔ `.env.managed`) — the Makefile targets do this for you. With self-hosted data you own backups (`pg_dump` cron + offsite copy); with managed data backups are automatic.

## Compose files

Three files, merged by Docker Compose:
- `docker-compose.yml` — **base**: app services (always run) + the `postgres`/`redis` data services (gated behind the `selfhost-data` profile).
- `docker-compose.override.yml` — **dev** (auto-applied): bind-mounts source + hot reload for api/web, exposes ports, skips Caddy/TLS.
- `docker-compose.prod.yml` — **prod**: Caddy with TLS, restart policies, no bind mounts.

### `docker-compose.yml` (base — app services always on; data services profiled)

Data endpoints come from env vars. The `postgres`/`redis` services only start when the `selfhost-data` profile is enabled; otherwise the app talks to managed endpoints.

```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.0
    # Dev-safe default. Production flags (`start --optimized`, KC_HOSTNAME,
    # KC_PROXY_HEADERS, KC_HTTP_ENABLED) go in docker-compose.prod.yml — NOT here.
    # Proxy-header parsing with no proxy in front makes Keycloak treat dev requests
    # as non-local and reject the admin console with "HTTPS required".
    command: start-dev --import-realm
    environment:
      KC_DB: postgres
      KC_DB_URL: ${KC_DB_URL}              # selfhost: container; managed: RDS (keycloak DB)
      KC_DB_USERNAME: ${KC_DB_USERNAME}
      KC_DB_PASSWORD: ${KC_DB_PASSWORD}
      KC_BOOTSTRAP_ADMIN_USERNAME: ${KC_ADMIN}
      KC_BOOTSTRAP_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
    volumes:
      - ./infra/keycloak/realm-agentpm.json:/opt/keycloak/data/import/realm-agentpm.json:ro

  api:
    image: ${REGISTRY:-ghcr.io/yourorg}/agentpm-api:${IMAGE_TAG:-dev}   # `build` tags this; prod `pull` fetches it
    build: { context: ., dockerfile: apps/api/Dockerfile }
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: "3001"
      DATABASE_URL: ${DATABASE_URL}        # selfhost: container; managed: RDS (agentpm DB)
      REDIS_URL: ${REDIS_URL}              # selfhost: container; managed: ElastiCache
      KEYCLOAK_ISSUER_URL: ${KEYCLOAK_ISSUER_URL}
      KEYCLOAK_API_AUDIENCE: agentpm-api
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}      # used from Phase 5

  web:
    image: ${REGISTRY:-ghcr.io/yourorg}/agentpm-web:${IMAGE_TAG:-dev}
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        VITE_API_URL: ${VITE_API_URL}
        VITE_WS_URL: ${VITE_WS_URL}
        VITE_KEYCLOAK_URL: ${VITE_KEYCLOAK_URL}
        VITE_KEYCLOAK_REALM: agentpm
        VITE_KEYCLOAK_CLIENT: agentpm-web
    depends_on: [api]

  # ── Optional self-hosted data — only when `--profile selfhost-data` is active ──
  postgres:
    profiles: ["selfhost-data"]
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_USER: ${KC_DB_USERNAME:-agentpm}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-localdev}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/postgres/init:/docker-entrypoint-initdb.d   # creates agentpm + keycloak DBs
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${KC_DB_USERNAME:-agentpm}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    profiles: ["selfhost-data"]
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # worker: enabled from Phase 5 (reuses the api image; same DATABASE_URL/REDIS_URL)

volumes:
  postgres_data:
  redis_data:
```

> **depends_on + profiles:** keep the app services free of a hard `depends_on` on `postgres`/`redis` so the managed mode (profile off) never references an inactive service. Instead the API/worker should **retry their DB/Redis connection on startup** (Prisma + ioredis reconnect), and `restart: unless-stopped` (prod) lets a container that boots before the DB simply restart until it's reachable. The dev override re-adds `depends_on` with a healthcheck condition, which is safe there because dev always enables the profile.

### `docker-compose.override.yml` (dev — auto-applied; hot reload + ports)

Dev always self-hosts data (the local `.env` sets `COMPOSE_PROFILES=selfhost-data`), so the `postgres`/`redis` services from the base file start automatically. This override only *patches* them with published ports and wires hot reload + container endpoints into the app services.

```yaml
services:
  postgres:
    ports: ["5432:5432"]      # patch the base (profiled) service — expose for host tools
  redis:
    ports: ["6379:6379"]

  keycloak:
    # base already runs `start-dev`; just wire deps + publish the port.
    depends_on:
      postgres: { condition: service_healthy }
    ports: ["8080:8080"]

  # Dev-only: local dev is plain HTTP (no TLS). Keycloak's master realm ships with
  # sslRequired=external, which blocks the admin console over HTTP behind Docker's
  # published port. This one-shot flips master → NONE. NOT in the prod overlay, so
  # production keeps strict HTTPS (terminated by Caddy). Creds from .env.
  keycloak-init:
    image: quay.io/keycloak/keycloak:26.0
    network_mode: "service:keycloak"   # share KC's netns → localhost = loopback (bypasses sslRequired)
    depends_on:
      keycloak: { condition: service_started }
    restart: "no"
    entrypoint: ["bash", "-c"]
    command:
      - |
        kc=/opt/keycloak/bin/kcadm.sh
        until $$kc config credentials --server http://localhost:8080 --realm master \
              --user "$$KC_ADMIN" --password "$$KC_ADMIN_PASSWORD" >/dev/null 2>&1; do
          echo "waiting for keycloak…"; sleep 3; done
        $$kc update realms/master -s sslRequired=NONE
    environment:
      KC_ADMIN: ${KC_ADMIN}
      KC_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}

  api:
    build:
      target: builder          # stop at the build stage so dev deps are present
    command: pnpm --filter api dev   # tsx/nodemon watch
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://agentpm:localdev@postgres:5432/agentpm
      REDIS_URL: redis://redis:6379
    volumes:
      - ./apps/api:/app/apps/api
      - ./packages:/app/packages
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    ports: ["3001:3001"]

  web:
    image: node:20-alpine
    working_dir: /app
    command: sh -c "corepack enable && pnpm install && pnpm --filter web dev --host"
    environment:
      VITE_API_URL: http://localhost:3001
      VITE_WS_URL: ws://localhost:3001
      VITE_KEYCLOAK_URL: http://localhost:8080
      VITE_KEYCLOAK_REALM: agentpm
      VITE_KEYCLOAK_CLIENT: agentpm-web
    volumes:
      - ./:/app
    ports: ["3000:3000"]
```

> A committed `.env.example` (dev defaults; `cp .env.example .env`) sets `COMPOSE_PROFILES=selfhost-data` plus the local container connection strings, so `docker compose up` just works — Postgres, Redis, Keycloak as containers and API + web with **hot reload**. Only Docker required on the laptop. No Caddy in dev (talk to `localhost:3000/3001/8080` directly). The app images are identical to prod; only the endpoints and the (profiled) data containers differ.

### `docker-compose.prod.yml` (prod — built images + Caddy/TLS)

Adds Caddy + restart policies. Whether Postgres/Redis run here is decided by the `selfhost-data` profile at deploy time (see the toggle above), **not** by this file: the `restart` entries for `postgres`/`redis` are no-ops when the profile is off (managed mode) and apply when it's on (self-hosted mode).

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./infra/caddy/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data       # Let's Encrypt certs only — not app data
      - caddy_config:/config
    depends_on: [web, api, keycloak]

  keycloak:
    restart: unless-stopped
    command: start --optimized --import-realm   # production mode (overrides the dev-safe base)
    environment:
      KC_HOSTNAME: auth.agentpm.io
      KC_HTTP_ENABLED: "true"          # TLS is terminated by Caddy in front
      KC_PROXY_HEADERS: xforwarded
  api:      { restart: unless-stopped }
  web:      { restart: unless-stopped }
  # worker (Phase 5): { restart: unless-stopped }

  # Only created when --profile selfhost-data is active; ignored in managed mode.
  postgres: { restart: unless-stopped }
  redis:    { restart: unless-stopped }

volumes:
  caddy_data:
  caddy_config:
```

**Deploy — managed data (default):**
```bash
docker compose --env-file .env.managed -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose --env-file .env.managed -f docker-compose.yml -f docker-compose.prod.yml run --rm api pnpm prisma migrate deploy
docker compose --env-file .env.managed -f docker-compose.yml -f docker-compose.prod.yml up -d
# or: make up-managed
```

**Deploy — self-hosted data on the VM (cheapest dev/staging):**
```bash
docker compose --profile selfhost-data --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose --profile selfhost-data --env-file .env.selfhost -f docker-compose.yml -f docker-compose.prod.yml run --rm api pnpm prisma migrate deploy
# or: make up-selfhost
```

> **Managed mode — one-time DB bootstrap:** managed RDS won't run the local `init` script, so create the two databases once on the instance: `CREATE DATABASE agentpm;` and `CREATE DATABASE keycloak;` (plus the `vector`/`pgcrypto` extensions on `agentpm`). After that, Prisma migrations and Keycloak manage their own schemas. Restrict the RDS/ElastiCache security groups so only the VM can connect.
>
> **Self-hosted mode:** the `init` script creates both DBs automatically on first boot, and a `postgres_data` volume persists them on the VM — **you own backups** (`pg_dump` cron + offsite copy). Switching a running environment from self-hosted → managed later means a `pg_dump` → restore into RDS, then flip the env file + drop the profile.

## Database migrations (containerized)

Run Prisma migrations as a one-shot container before/with deploy, never by hand:

```bash
docker compose run --rm api pnpm prisma migrate deploy
```

Wire this as the first step of the deploy script (CI runs it after the new image is built, before traffic shifts).

## Secrets in the Docker world

- **Dev:** a local `.env` (gitignored) feeds Compose variable substitution. Values are dummy/local.
- **Prod (Compose on VM):** use Docker secrets or an `.env` file with locked-down file permissions on the host, injected via `env_file`. Do **not** bake secrets into images.
- **Prod (ECS path):** AWS Secrets Manager + the `loadSecrets()` loader, as in [05-environment-secrets.md](05-environment-secrets.md).
- Social-login client secrets always live inside Keycloak, never in app env.

## Production hardening checklist (Compose on VM)

- [ ] **No app data in containers** — Postgres on managed RDS, Redis on managed ElastiCache; only stateless app containers + Caddy run on the VM
- [ ] Managed DB/cache hardened: encryption at rest, TLS in transit (`sslmode=require` / `rediss://`), automated backups + PITR, security group locked to the VM only
- [ ] Pin image tags (no `:latest` in prod) — deploy by digest/SHA
- [ ] `restart: unless-stopped` on every long-lived service
- [ ] Caddy auto-HTTPS configured with real domains; HTTP→HTTPS redirect (Caddy default)
- [ ] Only `caddy_data` (TLS certs) persists on the VM — back it up or let Caddy re-issue; **no app-data volumes to manage**
- [ ] Resource limits (`deploy.resources` / `mem_limit`) so one container can't starve the host
- [ ] Log rotation configured (Docker `json-file` max-size/max-file or ship to a log service)
- [ ] Keycloak in production mode (`start --optimized`), admin console not exposed publicly

## Managed data providers

The app only needs a Postgres URL and a Redis URL — use whatever managed service fits:

| | AWS (default, in-plan) | Alternatives |
|---|---|---|
| PostgreSQL | RDS for PostgreSQL (enable `pgvector`) | Neon, Supabase, Aiven, Crunchy Bridge |
| Redis | ElastiCache for Redis | Upstash, Redis Cloud, Aiven |

Pick providers in the same region as the VM to keep latency low. Everything else (app containers, Caddy, deploy flow) is identical regardless of provider.

## When to graduate

This setup already keeps state off the VM — the single biggest risk of one host is gone. Compose-on-VM then scales vertically (bigger box) a long way. Move to **ECS Fargate** (same images — see [phase-3](../phases/phase-3-dev-deployment-cicd.md) alternative) or **Kubernetes** only when you need horizontal auto-scaling, zero-downtime rolling deploys across nodes, or multi-node HA for the *app tier*.
