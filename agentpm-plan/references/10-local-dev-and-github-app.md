# Reference: Local Development & GitHub App Setup

> Stable reference. Source: Appendices A & B of the original plan.

## Local development setup

> **Everything runs in Docker.** The canonical container topology, Dockerfiles, and the three Compose files are in [12-docker-and-deployment.md](12-docker-and-deployment.md). Local dev uses the same images as prod, with bind mounts + hot reload layered on via `docker-compose.override.yml`.

```bash
# Prerequisites: Docker + Docker Compose. (Node.js 20+/pnpm 8+ only needed if you
# want to run tooling outside containers; the stack itself needs neither on the host.)

# 1. Clone
git clone https://github.com/yourorg/agentpm
cd agentpm

# 2. Copy and fill env (local/dummy values; real secrets only in staging/prod)
cp .env.example .env

# 3. Bring up the whole stack (postgres, redis, keycloak as containers;
#    api + web with hot reload). override.yml is auto-merged in dev.
docker compose up

# 4. Run migrations (one-shot container)
docker compose run --rm api pnpm prisma migrate deploy

# Web:      http://localhost:3000
# API:      http://localhost:3001
# Keycloak: http://localhost:8080   (admin/admin)
# Docs:     http://localhost:3001/documentation   (Fastify swagger)
```

> Prefer running api/web on the host for the fastest reload? You still get parity for backing services: `docker compose up postgres redis keycloak` and run `pnpm --filter api dev` / `pnpm --filter web dev` locally. The all-container `docker compose up` is the default so dev matches prod exactly.

## Accessing the staging/production database

> Applies to the **AWS ECS scale-up path** (managed RDS). On the primary Compose-on-VM path, Postgres is a container on the VM — reach it over an SSH tunnel to the host, never a published port.

RDS lives in an isolated subnet with no public endpoint (by design). For the occasional need to inspect staging data, use **AWS SSM Session Manager port forwarding** through the ECS task (or a tiny throwaway SSM-enabled instance) — no bastion host, no open SSH port, no inbound security-group rule, no added monthly cost:

```bash
# Forward local port 5433 → staging RDS:5432 via SSM (example)
aws ssm start-session \
  --target <ssm-managed-instance-or-ecs-task-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5433"]}' \
  --region ap-south-1

# Then connect locally: postgresql://USER:PASS@localhost:5433/agentpm
```

Day-to-day development never touches RDS — it uses the local Docker Postgres above.

## Docker Compose

The Compose files (base + dev override + prod) are the single source of truth in **[12-docker-and-deployment.md](12-docker-and-deployment.md)** — not duplicated here. They define postgres, redis, keycloak, api, web, and (prod) Caddy.

> **Local Keycloak:** runs at `http://localhost:8080`, admin console at `/admin` (admin/admin in dev). Import a committed `infra/keycloak/realm-agentpm.json` so the `agentpm` realm, the `agentpm-web` / `agentpm-api` clients, self-registration, and the Google/Microsoft/GitHub identity providers come up preconfigured. Export it after configuring:
> `docker compose exec keycloak /opt/keycloak/bin/kc.sh export --realm agentpm --file /tmp/realm.json`
> For purely local testing you can use Keycloak-native email/password without configuring the social providers; wire real Google/Microsoft/GitHub OAuth credentials in staging/prod.

## GitHub App setup (needed for Phase 4)

1. Go to GitHub Settings → Developer Settings → GitHub Apps → New GitHub App
2. Set:
   - **Homepage URL:** `https://agentpm.io`
   - **Webhook URL:** `https://api.agentpm.io/webhooks/github`
   - **Webhook Secret:** generate 32-char random string, save to Secrets Manager
3. Repository permissions:
   - **Contents:** Read & Write (create branches, push commits)
   - **Pull Requests:** Read & Write (open PRs, add comments)
   - **Metadata:** Read
   - **Workflows:** Read & Write (trigger CI)
4. Subscribe to events: `pull_request`, `push`, `check_run`
5. Generate a private key, base64-encode it: `base64 -w 0 private-key.pem`
6. Save App ID and base64 private key to Secrets Manager

> The same GitHub App backs both **OAuth login** (Phase 1, via Client ID/Secret) and **repo access for agents** (Phase 4, via installation tokens).
