# Phase 2.9.1 — Deployment Config: Dev vs Prod (env + infra)

> **Purpose:** the two environment configs you'll run with — **`.env` (local dev)** and **`.env.prod` (server)** — the full variable list for each, the infra you must create yourself, and a clear **mandatory vs. ok-to-defer** breakdown for an initial testing deploy. This is a *config reference*; the deploy *mechanics* (prod compose, Caddy, CI/CD) are Phase 3 — see [12-docker-and-deployment.md](../references/12-docker-and-deployment.md) and [phase-3](phase-3-dev-deployment-cicd.md).

---

## 1. Mental model (read this first)

- **Same Docker images run in dev and prod.** Only the **env values** and a couple of compose overlays differ.
- **Data placement is a one-flag toggle** (`COMPOSE_PROFILES=selfhost-data`):
  - **ON** → Postgres + Redis run as **containers** on the box (cheapest; good for dev + a testing server).
  - **OFF** → app points at **managed** Postgres/Redis (RDS/ElastiCache/Neon/Upstash) (durable; production-grade).
- **Two kinds of variables — don't mix them up:**
  - **Runtime** (api/keycloak): read when the container starts → live in the `.env` file (`DATABASE_URL`, `KEYCLOAK_*`, secrets…).
  - **Build-time** (`VITE_*`, the web SPA): **baked into the static bundle when the web image is built.** In **dev** `vite` reads them at runtime from `.env`; in **prod** they must be passed as **`--build-arg`s when building the web image** (CI does this). A prod web image is therefore environment-specific.

---

## 2. Dev config — `sourcecode/.env`

Everything local, in containers, dummy secrets, plain HTTP. This is exactly today's committed [`.env.example`](../../sourcecode/.env.example) — `cp .env.example .env` and you're done.

```bash
# ── Compose ──
COMPOSE_PROFILES=selfhost-data          # Postgres + Redis as containers
REGISTRY=ghcr.io/yourorg                # unused locally (build is local)
IMAGE_TAG=dev

# ── Data (containers) ──
POSTGRES_PASSWORD=localdev
DATABASE_URL=postgresql://agentpm:localdev@postgres:5432/agentpm
REDIS_URL=redis://redis:6379

# ── Keycloak (API only verifies tokens) ──
KEYCLOAK_ISSUER_URL=http://localhost:8080/realms/agentpm    # what tokens carry (browser-facing)
KEYCLOAK_INTERNAL_URL=http://keycloak:8080/realms/agentpm   # where the API fetches JWKS (container)
KEYCLOAK_API_AUDIENCE=agentpm-api
KC_DB_URL=jdbc:postgresql://postgres:5432/keycloak
KC_DB_USERNAME=agentpm
KC_DB_PASSWORD=localdev
KC_ADMIN=admin
KC_ADMIN_PASSWORD=admin
KEYCLOAK_HOSTNAME=localhost

# ── Social IdPs (optional in dev — empty = skipped, email/password still works) ──
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# ── API ──
NODE_ENV=development
PORT=3001
LOG_LEVEL=info
ALLOWED_ORIGINS=http://localhost:3000

# ── Web (Vite — read at runtime by `vite dev`) ──
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=agentpm
VITE_KEYCLOAK_CLIENT=agentpm-web
```

Run: `cd sourcecode && pnpm install --frozen-lockfile && docker compose up -d` → migrate + seed (first run).

---

## 3. Prod config — `sourcecode/.env.prod` (on the server, `chmod 600`, **never committed**)

Real domain, real secrets, TLS via Caddy. Shown with **self-hosted data** (simplest for a first testing server); the **managed-data** variant is the 3 lines noted below.

```bash
# ── Compose ──
COMPOSE_PROFILES=selfhost-data          # self-hosted data on the VM (omit for managed)
REGISTRY=ghcr.io/<your-gh-username>      # registry the images are pushed to/pulled from
IMAGE_TAG=<git-sha-or-version>           # pinned, never :latest in prod

# ── Data ──
#   Self-hosted (containers on the VM):
POSTGRES_PASSWORD=<STRONG_1>
DATABASE_URL=postgresql://agentpm:<STRONG_1>@postgres:5432/agentpm
REDIS_URL=redis://redis:6379
KC_DB_URL=jdbc:postgresql://postgres:5432/keycloak
#   Managed variant instead (drop COMPOSE_PROFILES above):
#   DATABASE_URL=postgresql://agentpm:<pw>@<rds-host>:5432/agentpm?sslmode=require
#   REDIS_URL=rediss://<elasticache-host>:6379
#   KC_DB_URL=jdbc:postgresql://<rds-host>:5432/keycloak

# ── Keycloak ──
KEYCLOAK_ISSUER_URL=https://auth.<domain>/realms/agentpm    # public issuer (in the JWT)
KEYCLOAK_INTERNAL_URL=http://keycloak:8080/realms/agentpm   # internal JWKS (stays container)
KEYCLOAK_API_AUDIENCE=agentpm-api
KC_DB_USERNAME=agentpm
KC_DB_PASSWORD=<STRONG_1>
KC_ADMIN=admin
KC_ADMIN_PASSWORD=<STRONG_2>
KC_HOSTNAME=auth.<domain>                # prod Keycloak hostname (prod compose runs start --optimized)

# ── Social IdPs (real values once OAuth apps are registered) ──
GOOGLE_CLIENT_ID=...        GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...     MICROSOFT_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...        GITHUB_CLIENT_SECRET=...

# ── API ──
NODE_ENV=production
PORT=3001
LOG_LEVEL=info
ALLOWED_ORIGINS=https://<domain>

# ── ACME / TLS (Caddy needs an email for Let's Encrypt) ──
ACME_EMAIL=you@<domain>

# ── Phase 5 (agents) — NOT needed for the PM-platform deploy ──
# ANTHROPIC_API_KEY=
# GITHUB_APP_ID= / GITHUB_APP_PRIVATE_KEY= / GITHUB_WEBHOOK_SECRET=
```

> **`VITE_*` are NOT in this runtime file for prod.** They're passed as `--build-arg`s when building the **web** image (CI), with prod values:
> `VITE_API_URL=https://api.<domain>` · `VITE_WS_URL=wss://api.<domain>` · `VITE_KEYCLOAK_URL=https://auth.<domain>` · `VITE_KEYCLOAK_REALM=agentpm` · `VITE_KEYCLOAK_CLIENT=agentpm-web`.

### Prod-only config tasks the env file does NOT cover (must be handled at deploy)
These are **dev-only today** (they live in `docker-compose.override.yml`'s `keycloak-init`) and need a prod equivalent — **flagged so they're not forgotten** (Phase 3 work):
1. **Realm has `localhost:3000` baked in** (`redirectUris`, `rootUrl`, `baseUrl`). Prod must use `https://<domain>` — update the realm for prod or `kcadm` it post-import, else login + the "‹ Back" link break.
2. **Social IdPs + first-login "Review Profile" disable** are applied via the dev `keycloak-init` only. Prod needs the same `kcadm` bootstrap (the committed realm JSON has branding/theme/client-baseURL, but **no identity providers**).
3. **Keycloak prod mode** (`start --optimized`, `KC_PROXY_HEADERS=xforwarded`, `KC_HTTP_ENABLED=true` behind Caddy) — lives in `docker-compose.prod.yml` (to be created in Phase 3).
4. **Run migrations** on deploy: `docker compose run --rm api pnpm prisma migrate deploy`.

---

## 4. Infra you must create yourself

| # | Thing | Needed for | Notes |
|---|---|---|---|
| 1 | **Domain name** + DNS access | testing + prod | e.g. `pmagent.app`; 3 A-records → VM IP: apex/`www` (web), `api.`, `auth.` |
| 2 | **A VM** (Docker + Compose) | testing + prod | ~2 vCPU / 4 GB (e.g. Hetzner CX22, DO droplet, EC2). SSH key. Firewall: open **22, 80, 443**. |
| 3 | **TLS certs** | testing + prod | **Automatic** via Caddy (Let's Encrypt) — you just need DNS pointed + ports 80/443 open + `ACME_EMAIL`. |
| 4 | **Container registry** | if using CI | **GHCR** (free with your GitHub repo) for the `api`/`web` images. Or build on the VM (no registry). |
| 5 | **Managed Postgres + Redis** | prod (optional) | RDS+ElastiCache / Neon + Upstash. Enable **pgvector**; create `agentpm` + `keycloak` DBs. Skip if self-hosting data on the VM. |
| 6 | **Social OAuth apps** | social login | Google Cloud / Azure AD / GitHub — see [13-social-login-setup.md](../references/13-social-login-setup.md). **Optional** (email/password works without). |
| 7 | **GitHub Actions secrets** | CI/CD (optional) | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (registry login uses the built-in `GITHUB_TOKEN`). |
| 8 | **Strong secrets** | testing + prod | `openssl rand -base64 32` for `POSTGRES_PASSWORD`, `KC_ADMIN_PASSWORD`. |
| 9 | **Anthropic API key + GitHub App** | Phase 5 only | **Not needed** for the PM-platform deploy. |
| 10 | **Email provider** (SES/Resend) | Phase 4 only | **Not needed** now (in-app notifications work). |
| 11 | **Sentry DSN** | optional | Error tracking; defer. |

---

## 5. Mandatory vs. ok-to-defer

### Tier A — Local dev (your laptop)
**Mandatory:** Docker only. Nothing external. Email/password sign-up works out of the box.
**Defer:** everything else. (Social login optional — leave the `*_CLIENT_ID` blank.)

### Tier B — Shared testing deploy (for the testing team) ✅ *the realistic first deploy*
**Mandatory:**
- VM + **domain + TLS** (Keycloak is painful over plain IP/HTTP — a real hostname + Caddy TLS is effectively required for a shared, internet-reachable test).
- **Strong** `POSTGRES_PASSWORD` + `KC_ADMIN_PASSWORD` (it's internet-exposed).
- `.env.prod` with the prod domain in `ISSUER_URL`/`ALLOWED_ORIGINS` and the **web image built with prod `VITE_*`**.
- The **realm prod-URL fix** + **migrations** (§3 tasks 1 & 4).

**OK to defer for testing:**
- **Social OAuth** (Google/MS/GitHub) — testers sign up with **email/password**; wire social later.
- **Managed data** — run **self-hosted** (`selfhost-data`) on the VM; cheaper, fine for testing (just take a `pg_dump` now and then).
- **CI/CD** — deploy **manually** (build → `compose up -d`) for the first round; automate in Phase 3.
- **Email notifications, Code Agent, monitoring, automated backups** — not built / not needed for functional testing.

### Tier C — Production (real users) — adds on top of Tier B
**Now mandatory:**
- **Managed data _or_ a real backup plan** (don't lose the testing-server volume).
- **Social OAuth wired** (if it's part of the offering) + IdP secrets injected at runtime (not committed).
- **Keycloak prod hardening** — `start --optimized`, admin console not publicly exposed, prod `kcadm` bootstrap (§3 tasks 2 & 3).
- **Backups + log rotation + uptime/monitoring**, pinned image tags, the [12-docker-and-deployment.md](../references/12-docker-and-deployment.md) hardening checklist.

**Still deferrable:** Code Agent/email (until Phases 4–5), Sentry, S3.

---

## 6. Deploy commands (reference — full mechanics in Phase 3)

```bash
# Dev (laptop)
cd sourcecode && cp .env.example .env && pnpm install --frozen-lockfile && docker compose up -d

# Prod (on the VM) — self-hosted data
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml pull   # or build
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml run --rm api pnpm prisma migrate deploy
docker compose --profile selfhost-data --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d
```

> `docker-compose.prod.yml`, the Caddyfile, and the `Makefile` wrappers (`make up-selfhost` / `up-managed`) don't exist yet — they're created in **Phase 3**. Until then a prod deploy is manual.

## Definition of Done (this doc)
- Both `.env` shapes are documented with every variable and its dev vs prod value.
- The infra-to-create list and the mandatory/ok-to-defer tiers are explicit.
- The dev-only prod-config gaps (realm URLs, IdP/Keycloak bootstrap) are flagged so Phase 3 closes them.
