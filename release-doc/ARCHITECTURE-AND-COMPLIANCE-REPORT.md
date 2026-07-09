# AgentPM — Architecture, SOLID & Standards Compliance Report

**Product:** AgentPM (PMAgent) — multi-tenant SaaS project-management platform
**Reviewed branch:** `dev`
**Report date:** 2026-07-08
**Scope:** `sourcecode/apps/api` (Fastify + Prisma), `sourcecode/apps/web` (React/Vite SPA), `sourcecode/packages/shared-types`, `sourcecode/infra` (Docker, Caddy, Keycloak), CI/CD.
**Method:** Static read of ~155 source files (~17.4k LOC of TS/TSX), schema, infra, and pipeline. No runtime pen-test was performed — findings marked *(unverified at runtime)* need a live check.

> **Verdict at a glance:** The codebase is **well-architected and largely SOLID-compliant** for its size, with clean layering, strong tenancy isolation, and disciplined transactional integrity. It is **partially compliant** with international/EU SaaS standards: security fundamentals (OIDC, JWKS, input validation, output sanitization, TLS, rate-limiting) are in place, but several **compliance-grade gaps** remain — most notably GDPR data-subject rights (export/erasure), an audit trail, HTTP security headers, and formal accessibility/quality conformance evidence.

---

## 1. System Architecture

### 1.1 High-level topology (C4 — Container view)

```
                          ┌─────────────────────────────────────────────┐
                          │                Browser (SPA)                │
                          │   React 18 + Vite + TanStack Query + WS      │
                          └───────────────┬──────────────┬──────────────┘
                                          │ HTTPS/REST    │ WSS (realtime)
                                          │ Bearer JWT    │
                 ┌────────────────────────▼──────────────▼───────────────┐
                 │              Caddy reverse proxy (TLS, ACME)           │
                 │        app.* → web:80   api.* → api:3001   auth.* → kc │
                 └───────┬───────────────────┬───────────────────┬───────┘
                         │                   │                   │
          ┌──────────────▼───┐   ┌───────────▼──────────┐   ┌────▼──────────┐
          │  web (nginx SPA) │   │  api (Fastify/Node)  │   │  Keycloak     │
          │  static assets   │   │  REST + WS + OpenAPI │   │  OIDC IdP     │
          └──────────────────┘   └───┬──────────┬───────┘   └───────────────┘
                                     │          │
                          ┌──────────▼──┐   ┌───▼─────────┐
                          │ PostgreSQL  │   │   Redis     │
                          │ (Prisma)    │   │ pub/sub bus │
                          └─────────────┘   └─────────────┘
```

- **Auth model:** Keycloak is the sole identity provider (OIDC). The API is a **pure OIDC resource server** — it verifies tokens against the realm JWKS and validates `iss`/`aud`; it never stores credentials (`apps/api/src/index.ts:68-95`). Users are **JIT-provisioned** on first authenticated request, keyed by the token `sub` (`auth.middleware.ts:25-41`). This is a clean separation of concerns and a security-positive design.
- **Realtime:** A Redis pub/sub **event bus** decouples producers (services) from consumers (WS fan-out + in-app notifications). Domain events are returned from services and published **after** the DB transaction commits, so subscribers never observe rolled-back state (`tickets.service.ts:203-206`, `342-373`). This is a textbook outbox-ish discipline.
- **Multi-tenancy:** Row-level tenancy via `orgId`/`projectId` foreign keys plus an explicit **authorization layer** (`services/authz.ts`, `middleware/auth.middleware.ts`). Cross-scope references are re-validated inside the transaction (`assertOrgMember`, `assertLabelsInOrg`, `assertSprintInProject`, `assertTicketsInProject`) — a strong defense against IDOR/tenant-bleed.

### 1.2 Layered structure (API)

| Layer | Location | Responsibility |
|---|---|---|
| **Bootstrap / composition root** | `index.ts`, `config.ts` | Wire plugins, error handler, routes, lifecycle (graceful shutdown, readiness/liveness). |
| **Transport / routes (controllers)** | `routes/*.ts` | Zod request/response schemas, auth guards, call services, publish events. Thin. |
| **Domain services** | `services/*.ts` | Business rules, invariants, transactions, event emission. |
| **Authorization** | `services/authz.ts`, `middleware/auth.middleware.ts` | Role hierarchy (`MEMBER<ADMIN<OWNER`), org-role gates, last-owner guard. |
| **Persistence** | `db/client.ts` + Prisma schema | Single Prisma client; typed models; cascade rules. |
| **Cross-cutting libs** | `lib/*` | `errors.ts` (typed `ApiError`), `pagination.ts` (cursor), `readiness.ts`, `slug.ts`. |
| **Contracts** | `packages/shared-types` | WS event envelope + shared enums shared by api & web to prevent drift. |

The separation is real and consistent: routes validate & delegate; services own the rules and own the transaction boundary. Error mapping is centralized in one handler (`index.ts:98-111`) that translates `ApiError` and `ZodError` into stable JSON shapes.

### 1.3 Frontend structure (web)

- `pages/*` (route screens) → `components/*` (feature widgets) → `components/ui/*` (design-system primitives, shadcn-style).
- A single typed **API client** (`lib/api.ts`) centralizes fetch, token refresh (`keycloak.updateToken`), and error normalization; one 401→refresh→retry path.
- Domain-free utility modules (`lib/csv.ts`, `gantt.ts`, `frecency.ts`, `parseQuickCreate.ts`, `markdown.ts`) are individually unit-tested.
- Product-wide UI/UX standards (inline validation, `EmptyState`, destructive token, spinner, confirm, focus-ring) are applied as reusable primitives.

### 1.4 Quality & delivery infrastructure

- **CI/CD** (`.github/workflows/deploy.yml`): lint → typecheck → test on every PR; on `main`, build+push images to GHCR → SSH deploy to EC2 with `prisma migrate deploy`. Postgres + Redis service containers back the test job. Uses `--frozen-lockfile` (reproducible installs) and immutable SHA image tags.
- **Tests:** 24 test files — API integration tests per route domain (auth, tickets, sprints, org, invites, notifications, gantt, archive, workflow, pm-depth…), web unit tests, plus a Playwright `core-flow` E2E.
- **Docs:** OpenAPI/Swagger auto-generated from Zod at `/documentation`. Living `PROGRESS.md`, `FEATURES.md`, and phased spec under `agentpm-plan/`.
- **Config/secrets:** 12-factor style env loading (`config.ts`); `.env.example` committed, `.env` git-ignored; prod images bake only non-secret `VITE_*` build args.

---

## 2. SOLID Assessment

**Overall: Good.** The service/route/lib split and the plugin/event-bus seams give the system most SOLID properties structurally. Scoring below is qualitative (● strong / ◐ partial / ○ weak).

### 2.1 Single Responsibility Principle — ● Strong
- Routes do transport, services do domain, `authz.ts` does authorization, `lib/*` each do one thing (errors, pagination, readiness, slug). No "god" modules.
- Services split by aggregate: `tickets.service.ts`, `relations.service.ts`, `notifications.service.ts`, `stats.service.ts`, `gantt.service.ts`, `reports.service.ts`, `overview.service.ts`, `activity.service.ts`.
- **Minor pressure:** `tickets.service.ts` `updateTicket` (~140 lines) carries several concerns — invariant coercion, activity diffing, watcher upserts, and automation-nudge side effects. Still cohesive, but the nudge/automation block is a candidate for extraction into an `automation.service` as it grows.

### 2.2 Open/Closed Principle — ◐ Partial→Strong
- **Strong:** Fastify plugin registration and the Redis event bus are genuine extension points — new event types, routes, or subscribers are added without editing existing consumers. `shared-types` `WSEventType` is the single seam both sides extend.
- **Partial:** Domain enums (status/priority/type/workstream) are duplicated as literal unions in three places — Prisma schema, service interfaces, and Zod route schemas (`tickets.ts:22-26`). Adding a status means editing all three. A generated single-source-of-truth (Prisma enum → Zod) would restore true OCP here.

### 2.3 Liskov Substitution Principle — ● Strong (limited surface)
- Few class hierarchies (this is a mostly-functional codebase). Where polymorphism exists it's clean: `ApiError` extends `Error` and is handled uniformly; the `Db = PrismaClient | Prisma.TransactionClient` union (`tickets.service.ts:27`) lets validation helpers run identically standalone or inside a transaction — a correct, substitutable abstraction.

### 2.4 Interface Segregation Principle — ● Strong
- Prisma `include`/`select` projections are tailored per use case (`ticketInclude` vs `ticketIncludeWithOrg`) so callers never over-fetch. Response DTOs (`serializeTicket`) expose only the contract fields. Frontend types in `lib/api.ts` are explicit subsets of API responses, not leaked ORM shapes.

### 2.5 Dependency Inversion Principle — ◐ Partial
- **Good:** Config is injected via `loadConfig()`; the event bus is imported behind a small functional interface (`publishEvent`, `initEventBus`); auth depends on an abstract JWKS resolver.
- **Weak spot:** Services import the **concrete singleton** `prisma` directly (`import { prisma } from '../db/client.js'`) rather than receiving a repository/port. This is pragmatic and common, but it couples the domain to Prisma and makes pure unit testing of services (without a DB) hard — the test strategy is integration-first as a result. Acceptable for the current size; would matter if you needed to swap data stores or unit-isolate rules.

**SOLID bottom line:** No architectural violations; the two soft spots are (a) enum duplication (OCP) and (b) direct ORM coupling in services (DIP). Both are refactors, not defects.

---

## 3. International & European Standards Compliance

Legend: ✅ met · ◐ partial · ❌ gap · ➖ N/A

### 3.1 Security — OWASP ASVS / OWASP Top 10, ISO/IEC 27001 controls

| Area | Status | Evidence / Notes |
|---|---|---|
| Authentication (OIDC, no local creds) | ✅ | Keycloak IdP; API verifies JWT sig via JWKS + `iss`/`aud` (`index.ts:68-95`). |
| Authorization / access control (A01) | ✅ | Role hierarchy + per-request org gates + cross-scope re-validation inside tx. Last-owner guard prevents lockout. |
| Injection (A03) | ✅ | Prisma parameterized queries throughout; no raw string SQL except `SELECT 1` health probe. |
| Input validation | ✅ | Zod schemas on every route body/query; typed error responses. |
| XSS / output encoding (A03) | ✅ | User markdown rendered via `marked` → **DOMPurify sanitize** (`web/src/lib/markdown.ts`). React escapes by default. |
| Transport security | ✅ | Caddy automatic HTTPS/ACME; WSS. |
| Rate limiting / DoS | ◐ | Global `100 req/min` (`index.ts:47`) — coarse; no per-route or per-identity tiers, and the limiter is in-process (not shared across API replicas via Redis). |
| **HTTP security headers** | ❌ | No `helmet`, no CSP/HSTS/X-Frame-Options/X-Content-Type-Options at API or Caddy. **OWASP-recommended baseline missing.** |
| Secrets management (A05) | ✅ | Env-based; `.env` git-ignored; config loader is the documented secrets-injection point. |
| Vulnerable dependencies (A06) | ◐ | `--frozen-lockfile` gives reproducibility, but **no `pnpm audit` / Dependabot / SCA gate** in CI. |
| CORS | ✅ | Origin allow-list from config, `credentials:true` (not wildcard). |
| Logging/monitoring (A09) | ◐ | Structured pino logs + readiness/liveness; **no security/audit event logging**, no alerting/tracing. |
| SSRF / CSRF | ✅ | No user-controlled outbound fetch; auth is Bearer-token (not cookie) so classic CSRF surface is minimal. |

### 3.2 Data protection — GDPR (Regulation (EU) 2016/679)

| Requirement | Status | Notes |
|---|---|---|
| Lawful, minimal PII collection (Art. 5) | ◐ | Stores email + display name + avatar only — minimal. No documented lawfulness basis / processing register. |
| Right of access & **data portability** (Art. 15, 20) | ❌ | No "export my data" endpoint/feature found. |
| Right to **erasure** ("right to be forgotten", Art. 17) | ❌ | No account-deletion / user-erasure path. Soft-archive exists for **tickets/projects** only (`archivedAt`), not for personal data. |
| Rectification (Art. 16) | ◐ | Account settings page allows profile edits; adequate for name/email. |
| Records / audit of processing (Art. 30) | ❌ | No audit log of who accessed/changed what. |
| Data-retention policy | ❌ | No retention/TTL for archived rows, notifications, or activity. |
| Breach-notification readiness (Art. 33) | ❌ | No security event logging to detect/report a breach in 72h. |
| Privacy policy / consent surfaces | ❌ | Not present in-app (may live outside repo). |
| Data residency | ➖ | Single-region EC2/RDS deploy; EU-residency claims would need infra placement + DPA with sub-processors (Keycloak, AWS). |

> GDPR is the **largest compliance cluster of gaps.** None are architecturally hard — the tenancy model already scopes all personal data by `userId`/`orgId`, so export and erasure are additive endpoints.

### 3.3 Accessibility — WCAG 2.1 AA / EN 301 549 (EU) / EAA 2025

| Aspect | Status | Notes |
|---|---|---|
| Semantic/ARIA usage | ◐ | 42 components use `aria-*`/`role`; a product-wide `:focus-visible` ring standard is in place. |
| Keyboard navigation | ◐ | Command palette, keyboard-help, focus ring suggest keyboard support — **not formally audited**. |
| Automated a11y testing | ❌ | No axe-core / Lighthouse a11y gate in CI or E2E. |
| Conformance evidence (VPAT/ACR) | ❌ | None. **EN 301 549 / European Accessibility Act (in force June 2025)** would require this for EU market SaaS. |
| i18n readiness | ◐ | i18n scaffolding present (`lib/i18n.ts`) but only `en.json` locale — single-language today. |

### 3.4 Software product quality — ISO/IEC 25010

| Characteristic | Assessment |
|---|---|
| Functional suitability | ✅ Broad, spec-driven feature set with tests. |
| Performance efficiency | ◐ Indexed queries, cursor pagination, lean projections; **no load testing / SLOs / query budgets** documented. |
| Compatibility | ✅ Standard REST + OpenAPI + WS; shared contracts prevent drift. |
| Usability | ◐ Strong UX standards; no formal usability/a11y validation. |
| Reliability | ◐ Graceful shutdown, readiness drain, transactional integrity; **single-node deploy = no HA/failover; no documented backup/restore/DR**. |
| Security | ◐ Strong auth/z & validation; header/audit/SCA gaps (§3.1). |
| Maintainability | ✅ Clean layering, typed end-to-end, tests, living docs. |
| Portability | ✅ Fully containerized; managed-store profile toggle for prod. |

### 3.5 Process, lifecycle & delivery — ISO/IEC/IEEE 12207, SemVer, C4, SOC 2 (readiness)

| Item | Status | Notes |
|---|---|---|
| Version control & branch protection | ◐ | Git + PR-gated CI; branch-protection rules not verifiable from repo. |
| Reproducible builds & immutable artifacts | ✅ | Frozen lockfile; SHA-tagged images. |
| Automated migrations | ✅ | `prisma migrate deploy` in pipeline. |
| API versioning | ◐ | OpenAPI `version:0.2.0`, `/api/*` prefix, but **no explicit API version namespace** (`/v1`). |
| Change/traceability | ✅ | `PROGRESS.md` log + phased spec give strong traceability. |
| SOC 2 / ISO 27001 org controls | ❌ | Access reviews, audit logs, IR runbook, data-retention, backup policy not evidenced — these are **operational**, not code, but required for enterprise/EU B2B trust. |
| PCI DSS | ➖ | No payment/card handling in code (`plan` is an enum only). N/A unless billing is added. |

---

## 4. Gaps To Fill — Prioritized Backlog

Ranked by risk × effort. Each is additive; none requires re-architecting.

### P0 — Compliance-blocking / security baseline
1. **HTTP security headers.** Add `@fastify/helmet` (or set headers in Caddy): CSP, HSTS, X-Content-Type-Options, X-Frame-Options/`frame-ancestors`, Referrer-Policy. *(Low effort, high impact.)*
2. **GDPR data-subject rights.** Add `GET /api/me/export` (portable JSON of the user's personal data) and `DELETE /api/me` (erasure/anonymization honoring last-owner and tenancy rules). *(Medium.)*
3. **Audit log.** Append-only record of security-relevant actions (auth, role changes, invites, deletes, archives) with actor, timestamp, target — needed for GDPR Art. 30/33 and SOC 2. A `TicketActivity`-style table already sets the pattern. *(Medium.)*

### P1 — Standards hardening
4. **Dependency/SCA gate in CI.** `pnpm audit --audit-level=high` + Dependabot/Renovate. *(Low.)*
5. **Accessibility conformance.** axe-core in Playwright E2E + a WCAG 2.1 AA self-assessment (ACR/VPAT) to satisfy EN 301 549 / EAA. *(Medium.)*
6. **Rate-limiting maturity.** Move to a Redis-backed store (so limits hold across replicas) and add stricter tiers on auth/invite/write endpoints. *(Low–Medium.)*
7. **Backup / restore / DR runbook** for Postgres, and document RPO/RTO. *(Medium, mostly ops.)*
8. **Retention policy** for archived tickets/projects, notifications, and activity (TTL or scheduled purge). *(Low–Medium.)*

### P2 — Engineering quality / SOLID polish
9. **Single-source enums.** Generate Zod/TS enums from the Prisma enums to remove the 3-way duplication (OCP). *(Medium.)*
10. **Repository/port seam for Prisma** in the hottest services to enable pure-unit domain tests and satisfy DIP more fully. *(Medium — optional.)*
11. **Extract automation/nudge logic** out of `updateTicket` into `automation.service.ts` as it grows (SRP). *(Low.)*
12. **API versioning namespace** (`/api/v1/...`) before the first external/public consumer. *(Low.)*
13. **Observability:** request tracing (OpenTelemetry), metrics, and error alerting; SLOs + a lightweight load test. *(Medium.)*
14. **HA:** more than one API replica behind the proxy + managed multi-AZ Postgres for production reliability. *(Ops.)*

---

## 5. Summary Scorecard

| Dimension | Rating | One-line |
|---|---|---|
| **SOLID adherence** | ★★★★☆ | Clean layering; only enum-duplication (OCP) and direct ORM coupling (DIP) to polish. |
| **Architecture quality** | ★★★★☆ | Sound separation, event-driven realtime, strong tenancy isolation; single-node reliability is the ceiling. |
| **Security baseline (OWASP/27001)** | ★★★☆☆ | Auth/z, validation, sanitization, TLS solid; **missing security headers, audit log, SCA gate**. |
| **GDPR / EU data protection** | ★★☆☆☆ | Minimal PII collection, but **no export/erasure/audit/retention** — the biggest cluster to close. |
| **Accessibility (WCAG/EN 301 549)** | ★★★☆☆ | Good primitives; **no automated testing or conformance evidence** (EAA 2025 relevant). |
| **ISO 25010 product quality** | ★★★★☆ | High maintainability/portability; reliability & performance need HA + load/SLO evidence. |
| **Process / delivery (12207)** | ★★★★☆ | Reproducible CI/CD, migrations, docs; needs SCA + org-level SOC 2/27001 controls. |

**Bottom line:** Engineering foundations are strong and standards-aware. To credibly claim conformance with EU/international SaaS standards, the priority is the **P0 compliance triad — security headers, GDPR export/erasure, and an audit log** — followed by SCA, accessibility conformance evidence, and a documented backup/DR + retention policy. These are additive to an already-clean design, not rewrites.

---

*Generated from static analysis of the `dev` branch on 2026-07-08. Items marked "not verifiable from repo" (branch protection, infra placement, DPAs, privacy policy) may already exist outside `sourcecode/` and should be confirmed before publishing any formal compliance claim.*
