# Local runbook — Docker on this machine

> Owned by **DevOps**; used by every role. Run all commands from `sourcecode/` unless noted. If something here turns out wrong, fix this file in the same session.

## Prerequisites
- **Docker Desktop running:** `docker info` should print a server version.
- **Node 20+ and pnpm 9.12.0 on the host:** `corepack enable`. If corepack fails its signature check, prefix pnpm commands with `COREPACK_INTEGRITY_KEYS=0`.
- **`sourcecode/.env`**, copied from `.env.example`. It holds local, dummy values. `COMPOSE_PROFILES=selfhost-data` in it starts Postgres and Redis as containers. Never commit `.env`.

## First run on a fresh clone
```bash
cp .env.example .env
COREPACK_INTEGRITY_KEYS=0 pnpm install --frozen-lockfile   # host install (see "api/web exit at start")
docker compose up -d
docker compose exec api pnpm --filter @agentpm/api exec prisma migrate deploy
docker compose exec api pnpm --filter @agentpm/api exec tsx prisma/seed.ts   # optional demo data
bash infra/keycloak/seed-e2e-user.sh                                         # e2e/browser test user
```

## Daily use
- **Start / status / logs:** `docker compose up -d` · `docker compose ps` · `docker compose logs -f api`
- **Stop:** `docker compose stop` keeps everything. `docker compose down` removes the containers but keeps the data volumes.
- **URLs:**
  - app: http://localhost:3000
  - API: http://localhost:3001 (`/health`, `/ready`, `/documentation`)
  - Keycloak: http://localhost:8080 (admin login from `.env`: `KC_ADMIN` / `KC_ADMIN_PASSWORD`)
- **Services:** `postgres` (5432; databases `agentpm`, `keycloak`, `agentpm_test`), `redis` (6379), `keycloak` (8080), and `keycloak-init`, a one-shot that sets up dev realm bits and social IdPs and then exits. The `api` (3001) runs tsx watch; the `web` (3000) runs Vite.

## After you change…

| You changed | Then do |
|---|---|
| Any file under `apps/api/src` | `docker compose restart api`. tsx watch misses macOS bind-mount events, so restart before you verify. |
| `apps/api/prisma/schema.prisma` | Create the migration (`docker compose exec api pnpm --filter @agentpm/api exec prisma migrate dev --name <name>`, or hand-write it under `prisma/migrations/` as earlier phases did). Then run `docker compose exec api pnpm --filter @agentpm/api exec prisma generate` and `docker compose restart api`. A host-side generate doesn't reach the container. |
| A `package.json` (dependencies) | `pnpm install` on the host, then `docker compose build api web && docker compose up -d` |
| `infra/keycloak/realm-agentpm.json` | It only seeds a **new** Keycloak. Apply realm-level settings to the running one with kcadm (below), and add them to `keycloak-init` / `infra/keycloak/prod-bootstrap.sh` so they stick. |
| The Keycloak login theme (`infra/keycloak/themes/`) | It's mounted read-only, so `docker compose restart keycloak` and hard-refresh the login page. |
| `.env` | `docker compose up -d` (recreates the services whose config changed) |

## Keycloak: change or read realm settings (dev)
```bash
docker compose exec keycloak bash -c '
  kc=/opt/keycloak/bin/kcadm.sh
  $kc config credentials --server http://localhost:8080 --realm master \
      --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"
  $kc get realms/agentpm --fields rememberMe,ssoSessionIdleTimeout          # read
  # $kc update realms/agentpm -s rememberMe=true                           # write
'
```
To call authenticated API endpoints with curl, you need a token. The `agentpm-web` client has direct-access grants **off**: switch it on temporarily through the admin API and switch it back afterwards. Never edit the realm JSON for this.

## Tests
- **Typecheck everything:** `pnpm typecheck`
- **API tests:** `pnpm --filter @agentpm/api test`. They run on the host against `agentpm_test` on localhost:5432, so the postgres and redis containers must be up (realtime tests need Redis on 6379).
- **Web unit tests:** `pnpm --filter @agentpm/web test`
- **Web production build:** `pnpm --filter @agentpm/web build`
- **Everything via Turborepo:** `pnpm test` · `pnpm build`
- **e2e + accessibility (Playwright):**
  1. One time only: `pnpm --filter @agentpm/web exec playwright install`.
  2. Seed the e2e user (`bash infra/keycloak/seed-e2e-user.sh`; its defaults are in the script).
  3. With the stack up, run `pnpm --filter @agentpm/web test:e2e`. The env variable names are in `apps/web/e2e/global-setup.ts`.
- **AI eval** (spends real Bedrock tokens; needs AI configured): `pnpm --filter @agentpm/api ai:eval` writes `docs/reports/ai-eval-report.md`.

## AI features locally
AI is off unless `.env` sets `AI_PROVIDER=bedrock` plus the dev AWS key. With AI off, the AI buttons show as disabled with a reason. Whether to keep using Bedrock locally is an open owner decision (⛔3 on BOARD.md).

## Test users and data
- **e2e test user:** created by `infra/keycloak/seed-e2e-user.sh`. Use it for Tester and browser checks.
- **The owner's own dev data** (the org "Oracle", projects "Relationship Manager" and "New") is real working data. Restore anything you change there.
- **Disposable:** the demo org "Northwind Apps" (backlog D2).

## Reset (destructive — ask the owner first)
`docker compose down -v` deletes the Postgres and Redis volumes. That means **every local account** (the Keycloak database lives in the same Postgres) and all app data. Afterwards:
1. `docker compose up -d`. The realm re-imports on a fresh database.
2. `prisma migrate deploy`.
3. Optionally, the seed.
4. Re-run `seed-e2e-user.sh`.

## Troubleshooting
- **api/web exit at start with "tsx: not found" / "vite: not found":** run the host `pnpm install`. The dev override bind-mounts `apps/*` and `packages/*` over the image, which hides the image's package-level `node_modules`. The shims are relative symlinks into the root store, so the container still resolves them to its Linux store at runtime.
- **An endpoint serves stale code:** `docker compose restart api`.
- **`PrismaClientValidationError: Unknown field …`:** run prisma generate inside the container, then restart api.
- **The Keycloak admin console says "HTTPS required":** re-run the one-shot with `docker compose up keycloak-init`. It sets the master realm's `sslRequired=NONE`, for dev only.
- **Docker isn't running:** start Docker Desktop and wait for `docker info` to answer.
