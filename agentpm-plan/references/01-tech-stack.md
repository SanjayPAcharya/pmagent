# Reference: Tech Stack & Architecture Decisions

> Stable reference. Every phase assumes these choices. Source: §2 of the original plan.

## Technology stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vite + React 18 + TypeScript (SPA) | Fast dev/build, lightweight, no SSR overhead — backend is a separate Fastify API |
| Routing | React Router | Client-side routing for the SPA |
| UI components | shadcn/ui (Radix UI primitives) + Tailwind CSS | Composable, accessible, fully customizable (own the code), lightweight |
| Drag & drop | dnd-kit | Trello/Jira-style kanban board; current standard (react-beautiful-dnd deprecated) |
| Data tables | TanStack Table (headless) | Dense Jira-like backlog/list views, styled with shadcn |
| Backend API | Node.js + Fastify + TypeScript | Fast, low overhead, good plugin system |
| Database | PostgreSQL 15 — managed for prod (AWS RDS / Neon / Supabase); container in dev or cheap staging | ACID, pgvector for embeddings, mature. Container-vs-managed is a one-flag toggle (`selfhost-data` Compose profile). |
| Cache / Queues | Redis 7 — managed for prod (AWS ElastiCache / Upstash); container in dev or cheap staging | Job queues (BullMQ), session cache, pub/sub. Same `selfhost-data` toggle. |
| Agent runtime | In-process BullMQ worker (Phase 1) → ECS Fargate isolation (later) | Simple/cheap for MVP; isolation added when agents execute code |
| File storage | AWS S3 | PR diffs, attachments, agent outputs |
| Real-time | WebSockets via @fastify/websocket + Redis pub/sub | Runs in the existing API container (no extra cost); Redis fans events across clients |
| Auth / Identity | **Keycloak** (self-hosted, OIDC) — Apache 2.0 | Single identity provider for the platform. Handles self-registration + social login (Google, Microsoft/Azure AD, GitHub) and is SAML-ready for enterprise SSO later. The Fastify API is an **OIDC client** that validates Keycloak-issued JWTs via JWKS — it no longer owns passwords. Enterprise-standard and recognized in security procurement. |
| Frontend hosting | **nginx container** (serves the built Vite SPA) | Containerized like everything else for dev/prod parity (replaces S3+CloudFront) |
| Reverse proxy / TLS | **Caddy** (container) | Single edge: HTTPS (auto Let's Encrypt) + routing to web/api/keycloak |
| Containerization | Docker + Docker Compose | **Every service is a container; the same images run in dev and prod** (see [12-docker-and-deployment.md](12-docker-and-deployment.md)) |
| Deployment (primary) | Docker Compose on a VM | Cheapest, simplest, full parity. ECS Fargate / k8s are documented scale-up paths |
| Infrastructure (scale-up) | AWS CDK v2 (TypeScript) | Optional: code-defined ECS Fargate path when horizontal scaling/managed HA is needed |
| CI/CD | GitHub Actions | Build + push images, run migrations, redeploy |
| Monitoring | AWS CloudWatch + Sentry | Unified logging + error tracking |
| Email | AWS SES | Cost-effective, reliable, in-ecosystem |
| Secrets | AWS Secrets Manager | Centralized, rotatable |

## Identity: Keycloak (added decision)

Auth is delegated to a self-hosted **Keycloak** instance rather than hand-rolled in the API. This adds one service to run from day one, but buys: self-service signup, social login (Google, Microsoft, GitHub) with no per-provider code, and a clean upgrade path to enterprise SAML/OIDC SSO. Two consequences worth internalizing:

- **Login identity ≠ GitHub repo access.** Keycloak handles *who you are* (sign in/up via Google/Microsoft/GitHub/email). The **GitHub App installation** for repo read/write by the Code Agent (Phase 4) is a *separate* connection a user makes per project. A user can sign up with Google and use the board immediately; they only need GitHub when assigning the Code Agent.
- **Open signup needs a cost guard.** Because anyone can self-register and agent runs cost real Anthropic spend, agent execution must be gated behind a verified org with trial limits or billing (see [09-cost-estimates.md](09-cost-estimates.md)). This is a product constraint, enforced before the Code Agent ships (Phase 4).

## Core architecture principles

**Principle 1 — Agents are decoupled via the queue.** Agents never call each other directly — all agent work flows through the job queue (Redis BullMQ), which prevents cascading failures and keeps the API responsive. Early on the Code Agent runs in-process inside the BullMQ worker; the agent logic is a self-contained function so it can later move into isolated per-run ECS Fargate tasks without changing the agent code.

**Principle 2 — Every agent action is logged.** Before an agent modifies anything, it writes an `AgentAction` record with its reasoning. After completion, it writes the outcome. Early on the only reversible side effect is a GitHub PR — rollback means closing that PR and deleting its branch. Release and deployment are manual until the Deploy Agent (Phase 6).

**Principle 3 — Events drive notifications.** A single `EventBus` (Redis pub/sub) handles all state changes. Notification workers subscribe and fan out to channels. No direct coupling between board logic and messaging.

**Principle 4 — Human gates are enforced server-side.** The autonomy dial settings are checked server-side on every phase transition. Frontend cannot bypass gates. Agents cannot self-promote past a human gate.

**Principle 5 — Secrets never in code.** All API keys, credentials, and tokens live in AWS Secrets Manager. Code reads them at runtime. Never hardcoded, never in committed `.env` files.

**Principle 6 — Containerized app, managed data; runs lean, scales up deliberately.** The app (web, api, worker, keycloak, caddy) runs as Docker containers — the **same images in dev and prod** for true parity — deployed via **Docker Compose on a single right-sized VM**. **Data placement is a one-flag toggle (`selfhost-data` Compose profile):** production defaults to **managed cloud** Postgres + Redis (AWS RDS + ElastiCache; Neon/Supabase/Upstash also work) so losing the VM never loses data; **local dev and cost-sensitive staging** flip the profile to run Postgres + Redis as containers on the box (cheaper, you own backups). A laptop needs only Docker. The stateless app tier can later graduate to ECS Fargate or Kubernetes for horizontal auto-scaling/HA when paying users justify it — without touching the data tier. See [12-docker-and-deployment.md](12-docker-and-deployment.md) and [09-cost-estimates.md](09-cost-estimates.md).

## AWS region

- **Primary:** `ap-south-1` (Mumbai) — closest to Devanahalli, Karnataka.
- **Optional CDN/WAF:** CloudFront (or Cloudflare) can sit in front of the VM/ALB later — not required for the MVP, since Caddy/ALB serve the nginx web container directly.

## Data flow — ticket execution

```
User creates ticket
  → POST /api/tickets
  → DB: insert ticket (status=backlog)
  → If agent assigned:
      → BullMQ: enqueue job { ticketId, agentType: 'code' }
      → DB: update ticket status=queued
      → WS: broadcast ticket_updated to room:project:{projectId}

BullMQ worker picks up job
  → Worker invokes the agent in-process: runCodeAgent(payload)
  → Agent reads ticket from DB
  → Agent calls GitHub API: read repo tree, read relevant files
  → Agent calls Anthropic API: generate implementation
  → Agent calls GitHub API: create branch, push commits, open PR
  → Agent writes AgentAction record to DB
  → Agent updates ticket: status=in_review, prUrl=...
  → WS: broadcast ticket_updated + agent_action_completed

Notification worker picks up event
  → Reads user preferences + channel configs
  → Sends email to relevant users
  → Logs notification_sent record
```
