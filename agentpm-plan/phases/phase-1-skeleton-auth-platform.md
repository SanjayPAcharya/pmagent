# Phase 1 — Frontend + Backend Skeleton, Login (Keycloak OIDC) & Platform Creation

> **Goal:** Stand up the monorepo skeleton (Fastify API + Vite/React SPA), wire login to a self-hosted **Keycloak** identity provider — self-service signup plus social login via **Google, Microsoft, and GitHub** — and let a user create the platform's core entities — **organizations and projects**. This is the foundation everything else attaches to.

**Depends on:** nothing (first phase).

**References:**
- [01-tech-stack.md](../references/01-tech-stack.md) — stack choices
- [02-repository-structure.md](../references/02-repository-structure.md) — monorepo layout to scaffold
- [03-data-models.md](../references/03-data-models.md) — needs `User`, `Organization`, `OrgMember`, `Project` (`Session` exists but is unused under Keycloak)
- [04-api-reference.md](../references/04-api-reference.md) — me/org/project route map + Zod validation pattern
- [05-environment-secrets.md](../references/05-environment-secrets.md) — `loadSecrets()`, Keycloak verification + GitHub env
- [10-local-dev-and-github-app.md](../references/10-local-dev-and-github-app.md) — local setup incl. local Keycloak container

---

## Deliverables

- [ ] Initialize monorepo with pnpm workspaces + Turborepo
- [ ] First Prisma migration (User, Organization, OrgMember, Project)
- [ ] Deploy/run Keycloak (realm `agentpm`, SPA + API clients, self-registration enabled)
- [ ] Configure Keycloak identity providers: Google, Microsoft (Azure AD), GitHub
- [ ] Fastify server setup with all middleware (CORS, JWKS-based JWT verify, rate-limit)
- [ ] Auth middleware (`requireAuth`, `requireOrgRole`) with just-in-time `User` provisioning by token `sub` (the OIDC redirect/callback is handled by keycloak-js in the SPA — the API has no callback route)
- [ ] `GET`/`PATCH /api/me` route (profile from the verified token)
- [ ] RBAC matrix enforced server-side
- [ ] Organizations CRUD + member management (new signup → create own org as OWNER)
- [ ] Projects CRUD (GitHub *repo* linking deferred to Phase 4 — distinct from GitHub login)
- [ ] Vite + React 18 + TypeScript + Tailwind + shadcn/ui setup (init, path alias)
- [ ] React Router setup (browser router, protected dashboard layout / auth guard)
- [ ] Frontend auth via `keycloak-js` / `oidc-client-ts` (login, signup, social buttons, silent token refresh)
- [ ] Dashboard + org/project navigation
- [ ] Typed API client that attaches the Keycloak access token + refreshes it

**Local container stack (so `docker compose up` works — Phase 3 builds the prod/deploy layer on top):**
- [ ] `apps/api/Dockerfile` + `apps/web/Dockerfile` (the multi-stage builds in [12-docker-and-deployment.md](../references/12-docker-and-deployment.md))
- [ ] `docker-compose.yml` (base) + `docker-compose.override.yml` (dev hot reload) + committed `.env.example` (dev defaults incl. `COMPOSE_PROFILES=selfhost-data`; `cp .env.example .env`)
- [ ] Postgres init script (`infra/postgres/init`) creating `agentpm` + `keycloak` DBs
- [ ] Local Keycloak container + committed `infra/keycloak/realm-agentpm.json` (clients, audience mapper, self-registration; social IdPs optional locally)

---

## Backend: server bootstrap

File: `apps/api/src/index.ts`

```typescript
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyWebsocket from '@fastify/websocket'
import fastifyRateLimit from '@fastify/rate-limit'
import { loadSecrets } from './config'

export async function buildServer() {
  await loadSecrets()  // hydrates process.env (DATABASE_URL, REDIS_URL, …) — see 05-environment-secrets

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty' }
        : undefined
    }
  })

  await app.register(fastifyCors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
  })

  // Tokens are issued by Keycloak (RS256), so the API does NOT sign tokens — it
  // only verifies them against Keycloak's public keys (JWKS), fetched + cached.
  // `buildGetJwks` (get-jwks) resolves the right key per token `kid`.
  const { default: buildGetJwks } = await import('get-jwks')
  const getJwks = buildGetJwks({ providerDiscovery: true })
  await app.register(fastifyJwt, {
    decode: { complete: true },
    secret: (request, token) => {
      const { header } = token as any
      return getJwks.getPublicKey({
        kid: header.kid,
        alg: header.alg,
        domain: process.env.KEYCLOAK_ISSUER_URL!  // e.g. https://auth.agentpm.io/realms/agentpm
      })
    },
    verify: {
      allowedIss: process.env.KEYCLOAK_ISSUER_URL!,
      allowedAud: process.env.KEYCLOAK_API_AUDIENCE!  // the API client id / configured audience
    }
  })

  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: getRedisClient()
  })

  await app.register(fastifyWebsocket)  // WS handlers land in Phase 2

  // Phase 1 routes (no /api/auth — login/signup are Keycloak's hosted pages):
  await app.register(import('./routes/me'), { prefix: '/api/me' })  // profile from verified token
  await app.register(import('./routes/organizations'), { prefix: '/api/orgs' })
  await app.register(import('./routes/projects'), { prefix: '/api/projects' })
  // tickets/sprints/agents/webhooks registered in later phases

  return app
}
```

> See [04-api-reference.md](../references/04-api-reference.md) for the full route registration list (later phases append to this same file).

---

## Authentication & authorization

Auth is delegated to a self-hosted **Keycloak** instance. The API and SPA never see passwords — Keycloak owns credentials, registration, and social login. The API is purely an **OIDC resource server**: it validates the access token and provisions a local `User` row on first sight.

### Keycloak setup (realm `agentpm`)

- **Clients:**
  - `agentpm-web` — public client (PKCE, no secret) for the SPA. Standard flow enabled.
  - `agentpm-api` — bearer-only client representing the API audience.
  - **Audience gotcha:** Keycloak won't put `agentpm-api` in the token's `aud` claim automatically. Add an **Audience mapper** (on a client scope the SPA requests, or on `agentpm-web`) that includes `agentpm-api`, otherwise the API's `allowedAud` check rejects every token.
- **Self-registration:** Realm → Login → **User registration: ON**. This gives a hosted signup page out of the box.
- **Identity providers (social login + signup):** add under Realm → Identity Providers:
  - **Google** — OIDC, client id/secret from Google Cloud console.
  - **Microsoft / Azure AD** — OIDC, client id/secret from an Azure App Registration (supports both work/school and personal accounts depending on the tenant setting).
  - **GitHub** — built-in GitHub provider, client id/secret from a GitHub OAuth App.
  - Enable **"trust email"** + first-login flow so social signups land directly in the app without an extra confirmation step.
- All three providers and Keycloak-native email/password feed the **same** login/registration screen — "Sign up", "Continue with Google", "Continue with Microsoft", "Continue with GitHub".

### Auth flow

```
Sign up / Sign in (all handled by Keycloak's hosted pages):
  SPA → redirect to Keycloak authorize endpoint (Authorization Code + PKCE)
      → user signs up or logs in (email/password, Google, Microsoft, or GitHub)
      → Keycloak redirects back to SPA with code → SPA exchanges for { access_token (JWT, RS256), refresh_token, id_token }

API requests:
  Authorization: Bearer <access_token>
      → API verifies signature via Keycloak JWKS + checks iss/aud (see server bootstrap)
      → first request from a new subject: JIT-provision a User row (see middleware)
      → attach userId to request context

Token refresh:
  SPA refreshes the access token against Keycloak using the refresh token
  (handled by keycloak-js / oidc-client-ts — no custom /api/auth/refresh endpoint).
```

> **Login identity vs. GitHub repo access (important):** signing in *with GitHub* via Keycloak only establishes **who the user is**. It does **not** grant the Code Agent access to any repository. Repo read/write is a separate **GitHub App installation** the user performs per project in Phase 4. A user who signs up with Google or Microsoft uses the board fully in Phases 1–3 and only connects GitHub when they want the Code Agent.

> **Schema note:** with Keycloak owning credentials, `User.passwordHash` is unused (leave nullable or drop it). Add a stable link to the IdP subject — reuse a column or add `idpSub String? @unique`. `User.githubId` / `githubLogin` stay, but are populated from the **GitHub App** connection in Phase 4, not from login. The `Session` model (DB refresh tokens) is also unused — refresh is handled by Keycloak.

> **Open-signup cost guard (product constraint):** because anyone can self-register, agent runs (Phase 4) must be gated behind a verified org with trial limits or billing — open signup must not mean uncapped Anthropic spend. See [01-tech-stack.md](../references/01-tech-stack.md) and [09-cost-estimates.md](../references/09-cost-estimates.md).

### RBAC — authorization matrix

```
Resource: Organization
  OWNER can:  all actions including delete org, change member roles, billing
  ADMIN can:  all except delete org and billing
  MEMBER can: read only; create/edit tickets in projects they're added to

Resource: Project
  OWNER/ADMIN: full CRUD on project, settings, integrations, autonomy dial
  MEMBER: create/edit/view tickets, view agent feed, approve gates

Resource: Ticket           (enforced from Phase 2)
  Creator: full edit
  Project member: comment, view, change own assignments
  Admin+: delete, rollback, override status

Resource: AgentAction      (enforced from Phase 4)
  MEMBER: view only
  ADMIN+: rollback, retry

Resource: AutonomySettings (enforced from Phase 6)
  OWNER only: can change production autonomy level
```

### Auth middleware

File: `apps/api/src/middleware/auth.middleware.ts`

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
    userRole?: OrgRole
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()  // verifies signature + iss/aud against Keycloak (see bootstrap)
    // Keycloak token claims: sub (stable IdP id), email, name, preferred_username
    const claims = request.user as { sub: string; email: string; name?: string; preferred_username?: string }

    // Just-in-time provisioning: map the Keycloak subject to a local User row.
    // Provision ONCE (read-first, create only on first sight) — do NOT upsert on
    // every request, or every authenticated call becomes a DB write. Cache the
    // sub→userId mapping (Redis or an in-process LRU) to skip even the read on hot paths.
    let user = await prisma.user.findUnique({ where: { idpSub: claims.sub } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          idpSub: claims.sub,
          email: claims.email,
          name: claims.name ?? claims.preferred_username ?? claims.email
        }
      })
    }
    request.userId = user.id  // local DB id — everything downstream keys off this, not the Keycloak sub
  } catch {
    reply.status(401).send({ error: 'Unauthorized', code: 'INVALID_TOKEN' })
  }
}

export async function requireOrgRole(minRole: OrgRole) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.params as { orgId?: string }
    const { slug } = request.params as { slug?: string }

    const org = orgId
      ? await prisma.organization.findUnique({ where: { id: orgId } })
      : await prisma.organization.findUnique({ where: { slug } })

    if (!org) return reply.status(404).send({ error: 'Organization not found' })

    const membership = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: request.userId } }
    })

    if (!membership || !hasRole(membership.role, minRole)) {
      return reply.status(403).send({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
    }

    request.userRole = membership.role
  }
}

const roleHierarchy: Record<OrgRole, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 }
const hasRole = (actual: OrgRole, required: OrgRole) => roleHierarchy[actual] >= roleHierarchy[required]
```

### Security requirements active in Phase 1

From [06-security-checklist.md](../references/06-security-checklist.md):
- **Credentials live in Keycloak** — the API/SPA store no passwords (bcrypt/refresh-token handling is Keycloak's job now).
- API validates every access token's **signature (JWKS), issuer, and audience**; reject tokens with the wrong `aud`.
- All routes require a valid bearer token (there is no public `/api/auth/*` surface — auth pages are served by Keycloak).
- Keycloak runs over HTTPS only; its admin console is not publicly exposed.
- Zod validation on every request body.
- CORS limited to `agentpm.io` + `localhost:3000`; same allowed-origins list configured as valid redirect URIs on the `agentpm-web` Keycloak client.

---

## Frontend: skeleton

### Vite configuration

File: `apps/web/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }   // shadcn/ui import alias
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3001', ws: true }   // used from Phase 2
    }
  },
  build: { outDir: 'dist', sourcemap: true }
})
```

Environment variables are exposed via Vite's `import.meta.env` and must be prefixed with `VITE_` (e.g. `VITE_API_URL`, `VITE_WS_URL`, `VITE_KEYCLOAK_*`). They are read **at build time** (baked into the image as `--build-arg`s). The app is a pure SPA — it builds to static assets in `dist/`, which are served by an **nginx container** (see [12-docker-and-deployment.md](../references/12-docker-and-deployment.md)); Caddy sits in front for TLS + routing.

shadcn/ui setup (Vite): configure Tailwind, set the `@/` path alias in both `vite.config.ts` and `tsconfig.json`, then run `npx shadcn@latest init` and add components with `npx shadcn@latest add button dialog sheet ...` as needed.

### Routing & auth guard (Keycloak)

Use React Router `createBrowserRouter` (`src/routes/router.tsx`). Auth is handled by `keycloak-js` (or `oidc-client-ts`): on app load the client initializes with `onLoad: 'check-sso'`; protected routes under `DashboardLayout.tsx` call `keycloak.login()` (which redirects to Keycloak's hosted login/registration page with the Google/Microsoft/GitHub buttons) when there is no valid token. There are no in-app `LoginPage`/`RegisterPage` forms — Keycloak hosts those. A "Sign up" CTA simply calls `keycloak.register()`. The library auto-refreshes the access token before expiry.

```typescript
// apps/web/src/lib/auth.ts
import Keycloak from 'keycloak-js'

export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL!,        // https://auth.agentpm.io
  realm: import.meta.env.VITE_KEYCLOAK_REALM!,    // agentpm
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT! // agentpm-web
})
// init({ onLoad: 'check-sso', pkceMethod: 'S256' }) on startup; getAccessToken() reads keycloak.token
```

### Typed API client

File: `apps/web/src/lib/api-client.ts`

```typescript
/**
 * Typed API client. The Keycloak access token is read from the keycloak-js
 * instance, which keeps it fresh; on a 401 we ask Keycloak to refresh once and retry.
 * All methods throw typed errors on non-2xx responses.
 */
const API_URL = import.meta.env.VITE_API_URL!

class ApiClient {
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = getAccessToken()

    let res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })

    if (res.status === 401) {
      const refreshed = await keycloak.updateToken(5).then(() => true).catch(() => false)
      if (refreshed) {
        res = await fetch(`${API_URL}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getAccessToken()}`
          },
          body: body ? JSON.stringify(body) : undefined
        })
      }
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }))
      throw new ApiError(res.status, error.message, error)
    }
    return res.json()
  }

  // Phase 1 methods (me/org/project). Ticket/agent methods are added in later phases.
}

export const api = new ApiClient()
```

---

## Blockers & gotchas to resolve (read before building auth)

1. **Keycloak issuer/hostname must be identical from the browser AND the API container (the #1 dev blocker).** The browser reaches Keycloak at one URL while the API container reaches it at another (`localhost:8080` vs the `keycloak` service name). If they differ, the token's `iss` won't match what the API validates / what JWKS discovery resolves, and **every token is rejected**. Fix it by using **one hostname everywhere**: add `127.0.0.1 keycloak` to the host's `/etc/hosts`, set `KC_HOSTNAME`/`VITE_KEYCLOAK_URL`/`KEYCLOAK_ISSUER_URL` all to `http://keycloak:8080`, so the browser and the API container resolve the same issuer. (In prod this is a non-issue — everyone uses `https://auth.agentpm.io`.)
2. **Audience mapper** — without it, `agentpm-api` never lands in the `aud` claim and `allowedAud` rejects every token (see Keycloak setup above).
3. **Commit the realm export** (`infra/keycloak/realm-agentpm.json`) — clients, audience mapper, registration, and the Google/Microsoft/GitHub IdPs must come up reproducibly, not be clicked in by hand each environment.
4. **Provision once, not per request** — the auth middleware reads-then-creates the `User` (see code); don't regress to an upsert on every call.
5. **Prerequisite external apps** — Google OAuth client, Azure App Registration, and a GitHub OAuth App must exist to wire the social IdPs (local-only testing can use Keycloak email/password without them).

> **Dev networking note:** the Vite proxy in `vite.config.ts` is for non-container dev. In the containerized dev stack the browser calls the API and Keycloak via their **published host ports** using absolute `VITE_API_URL` / `VITE_KEYCLOAK_URL`, so the proxy isn't exercised — leave it for `pnpm dev`-on-host workflows.

> **Snippet note:** the code blocks elide obvious imports (`prisma`, `keycloak`, `getAccessToken`, `getRedisClient`, `OrgRole`, `ApiError`) for readability — they are not missing dependencies.

## Definition of Done

- A brand-new person can **sign up** from the landing page via Keycloak — using **email/password, Google, Microsoft, or GitHub** — and lands in the app, with a `User` row JIT-provisioned by their token `sub`.
- They stay logged in across refreshes (keycloak-js silently refreshes the token).
- A logged-in user can create an organization (becomes OWNER), invite a member, create a project inside it, and navigate the dashboard.
- All Phase 1 routes verify the Keycloak token (signature via JWKS + iss + aud), are Zod-validated, and are covered by the auth + org/project test cases in [07-testing-strategy.md](../references/07-testing-strategy.md).
- Runs locally via `docker compose up` — the full stack (postgres, redis, keycloak as containers; api + web with hot reload) per [12-docker-and-deployment.md](../references/12-docker-and-deployment.md). Same images run in prod.
- The first migration is applied (`docker compose run --rm api pnpm prisma migrate dev` locally; `migrate deploy` in CI/prod) and the realm imports cleanly from the committed `realm-agentpm.json`.
