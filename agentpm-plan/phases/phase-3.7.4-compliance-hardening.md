# Phase 3.7.4 — Compliance & Security Hardening (SOLID/standards gap closure)

> **Status: 📋 OPEN** (specced 2026-07-08). Source: the architecture & standards audit in [`release-doc/ARCHITECTURE-AND-COMPLIANCE-REPORT.md`](../../release-doc/ARCHITECTURE-AND-COMPLIANCE-REPORT.md). The audit found the codebase architecturally sound (SOLID ★★★★☆) but **missing the compliance-grade layer** an EU/international SaaS needs: HTTP security headers, GDPR data-subject rights (export + erasure), an audit trail, a dependency-scanning CI gate, distributed rate limiting, automated accessibility checks, and a data-retention job.
>
> **What this phase does:** closes every *code-level* gap from the report's P0/P1 backlog. After it lands, the product satisfies the OWASP secure-headers baseline, GDPR Articles 15/17/20 (access, erasure, portability) at the API+UI level, GDPR Art. 30-style audit logging, supply-chain scanning in CI, and has axe-core accessibility regression tests. **Ops-only items (HA, backups/DR, SOC 2 org controls) are explicitly out of scope** — they live in infra/runbooks, not this repo's code.

## Current state (what already exists — do not rebuild)

- **Auth:** Keycloak OIDC; the API verifies JWT via JWKS + `iss`/`aud` (`apps/api/src/index.ts:68-95`); users are JIT-provisioned (`middleware/auth.middleware.ts:25-41`). The API **cannot** delete Keycloak accounts (it holds no admin credentials, by design) — erasure below anonymizes the local row only; the Keycloak account is noted as a manual step.
- **Rate limiting:** global in-process `100 req/min` (`index.ts:47`). Redis is already wired for the event bus (`events/event-bus.ts`, `REDIS_URL` optional → tests stay hermetic).
- **Error handling:** central handler maps `ApiError`/`ZodError` (`index.ts:98-111`). New endpoints must throw `ApiError` (`lib/errors.ts`), never hand-roll responses.
- **Soft-archive:** `Ticket.archivedAt` + `Project.archivedAt` (Phase 3.7.3) — restore + permanent-delete endpoints exist. This phase's retention job does **not** touch archived rows (owner decision: archives keep forever; only notifications + expired invites get purged).
- **Activity pattern to copy:** `TicketActivity` (schema ~line 270) is the in-house precedent for an append-only event table; `AuditLog` (Part C) follows it but with **no FK relations** so audit rows survive org/user deletion.
- **Sanitization:** user markdown already goes through DOMPurify (`web/src/lib/markdown.ts`) — nothing to add there.
- **Critical schema fact:** `Ticket.createdBy` is `onDelete: Restrict` (schema line 175) — a hard `prisma.user.delete` **fails** for any user who created tickets. Erasure (B2) must therefore **anonymize**, not delete. `Comment.author` and `TicketActivity.actor` are `SetNull`; `OrgMember`/`TicketWatcher`/`Notification`/`CommentReaction` user relations are `Cascade`.
- **Prod topology:** Caddy terminates TLS for `{$APP_DOMAIN}`/`{$API_DOMAIN}`/`{$AUTH_DOMAIN}` (`infra/caddy/Caddyfile`); the SPA is nginx behind it. Dev has no Caddy — header changes are verified by config validation, not browser.

## Conventions (read once)

- Workspace root = `sourcecode/` (all `pnpm`/`docker compose` from there). api = Fastify + Zod (`fastify-type-provider-zod`) + Prisma; web = React 18 + react-query + react-router v6 + i18next (strings via `t()`, new keys in `apps/web/src/locales/en.json`). Apply the [product UI/UX standards](phase-3.7.2-ui-ux-polish.md): shared `EmptyState`, `Loader2` on async buttons, inline two-click confirm (4s reset), `--destructive` token for destructive actions, `:focus-visible` ring.
- **Schema changes (C1):** after editing `schema.prisma` + `prisma migrate dev`, run `docker compose exec api pnpm --filter @agentpm/api exec prisma generate && docker compose restart api` — host-side generate doesn't reach the container. **New api source files** also need `docker compose restart api` (tsx watch misses them). **Dependency changes (A1, D2, E1): rebuild the container** (`docker compose build api && docker compose up -d api`).
- Test baselines entering this phase: **api 81, web 32** (+ Playwright e2e separate). One step = one local commit that ticks its box here + a `PROGRESS.md` Now/Next + Log row (+ `FEATURES.md` for the user-facing B3). **Never `git push`** unless the owner asks.
- New api tests: follow the existing per-domain pattern — put Part B tests in a new `src/test/gdpr.test.ts`, Part C in `src/test/audit.test.ts`, using `auth-test-kit.ts` helpers like the 3.7.3 `archive.test.ts` did.

---

## Part A — HTTP security headers (P0 · OWASP baseline)

### - [ ] A1 — API: `@fastify/helmet` (S)
- `pnpm --filter @agentpm/api add @fastify/helmet` (v13.x — Fastify v5 compatible). Rebuild the api container (dep change).
- In `index.ts`, register **before** the routes, right after `rateLimit`:
  ```ts
  await app.register(helmet, {
    contentSecurityPolicy: false, // API serves JSON + Swagger UI; CSP for the SPA is set at Caddy (A2)
    hsts: false,                  // TLS terminates at Caddy; HSTS is set there (A2)
  })
  ```
  This yields `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, `X-DNS-Prefetch-Control`, etc. CSP stays off at the API layer — a default CSP breaks Swagger UI at `/documentation`, and the API returns no user-facing HTML.
- Test (append to `src/health.test.ts`): inject `GET /health`, assert `x-content-type-options: nosniff` and `x-frame-options` present. **api 81 → 82.**
- Verify: `curl -i http://localhost:3001/health` shows the headers; `/documentation` still renders.

### - [ ] A2 — Caddy: HSTS + CSP for the SPA (S)
- In `infra/caddy/Caddyfile`, add a `header { … }` block to each site:
  - **All three domains:** `Strict-Transport-Security "max-age=31536000; includeSubDomains"`, `X-Content-Type-Options "nosniff"`, `Referrer-Policy "strict-origin-when-cross-origin"`.
  - **`{$APP_DOMAIN}` only** — SPA CSP (start in **Report-Only** to avoid bricking login on first deploy; promote to enforcing after one verified prod session):
    ```
    Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://{$API_DOMAIN} wss://{$API_DOMAIN} https://{$AUTH_DOMAIN}; frame-src https://{$AUTH_DOMAIN}; frame-ancestors 'none'; base-uri 'self'"
    ```
    Notes baked into the choices: `style-src 'unsafe-inline'` — Tailwind/inline styles; `connect-src` — REST + WS + Keycloak token calls; `frame-src` auth domain — keycloak-js check-sso iframe; `frame-ancestors 'none'` supersedes X-Frame-Options for the app.
  - **`{$AUTH_DOMAIN}`:** do **not** set `frame-ancestors 'none'` (the SPA iframes it); leave Keycloak's own CSP alone, add only HSTS/nosniff/referrer.
- Verify (no Caddy in dev): `docker run --rm -v "$PWD/infra/caddy/Caddyfile:/etc/caddy/Caddyfile" -e ACME_EMAIL=x@x.co -e APP_DOMAIN=app.local -e API_DOMAIN=api.local -e AUTH_DOMAIN=auth.local caddy:2 caddy validate --config /etc/caddy/Caddyfile`.
- Add a Log note: **after the next prod deploy**, check DevTools console for CSP-report violations during login + board + WS, then flip `Content-Security-Policy-Report-Only` → `Content-Security-Policy`.

---

## Part B — GDPR data-subject rights (P0 · Art. 15/17/20)

### - [x] B1 — API: `GET /api/me/export` (M) *(done 2026-07-08)*
- In `routes/me.ts` (all `/api/me` routes already run behind `requireAuth` — confirm the plugin-level hook; if guards are per-route, add one). New handler gathers, in one `Promise.all`:
  - profile (`id,email,name,avatarUrl,createdAt`),
  - memberships → `{ org: {name, slug}, role, joinedAt }`,
  - created + assigned tickets → `{ key: PROJ-n, title, status, createdAt }` (reuse `ticketInclude`'s project select for the key),
  - authored comments → `{ ticketId, body, createdAt }`,
  - watched ticket ids,
  - notifications → `{ type, subject, body, readAt, createdAt }`.
- Respond with `reply.header('Content-Disposition', 'attachment; filename="agentpm-export-<yyyy-mm-dd>.json"')` and the JSON bundle wrapped as `{ exportedAt, format: 'agentpm/v1', data: {…} }`.
- Test (`src/test/gdpr.test.ts`): seed a user with an org + a ticket + a comment; assert the export contains each section and **no other user's data**. **api 82 → 83.**

### - [ ] B2 — API: `DELETE /api/me` — erasure by anonymization (M)
- **Guard first:** find memberships where `role: 'OWNER'`; for each, count owners in that org. If any org would be left ownerless → `throw new ApiError(409, 'Transfer ownership or delete these organizations first: <slugs>', 'SOLE_OWNER')`. (Mirrors `guardLastOwner` in `services/authz.ts` — reuse `roleAtLeast`/patterns, don't duplicate the message style.)
- Then one `prisma.$transaction`:
  1. `ticket.updateMany({ where: { assignedToId: userId }, data: { assignedToId: null } })` — don't leave live work assigned to a tombstone,
  2. delete rows: `orgMember`, `ticketWatcher`, `notification`, `commentReaction` (all `where: { userId }`),
  3. anonymize the user row: `email: deleted-${userId}@anonymized.invalid` (keeps the unique constraint), `name: 'Deleted user'`, `avatarUrl: null`, `idpSub: null`.
  - **Kept by design:** created tickets (`Restrict`), authored comments, and activity — now attributed to "Deleted user". This is the standard GDPR anonymization posture: the personal identifiers are gone; the work product remains.
- Write an audit row (`account.erased`, `orgId: null`) — do this *after* C2 lands, or land B2 after Part C (see sequencing).
- Return `204`. Note in the handler comment: the **Keycloak account is not deleted** (API holds no IdP admin credentials); if the person signs in again a fresh blank account is JIT-provisioned — acceptable and documented in FEATURES.
- Tests: (1) sole-owner → 409 `SOLE_OWNER`; (2) after adding a second owner, erasure succeeds → user row anonymized, memberships/watchers/notifications gone, their created ticket still exists with author "Deleted user". **api 83 → 85.**

### - [ ] B3 — Web: export + delete-account in Account Settings (M)
- `lib/api.ts`: add `exportMyData()` (fetch → `blob` → programmatic `<a download>` click; must go through the shared `request` path for the auth header — add a `requestBlob` variant rather than duplicating token logic) and `deleteMyAccount()`.
- `pages/AccountSettings.tsx`:
  - **"Download my data"** button (`Download` icon, `Loader2` while fetching, toast on success).
  - **Danger Zone** card (copy the `DangerZone.tsx` pattern): "Delete my account" — explain anonymization ("your name and email are removed; tickets and comments you wrote remain, attributed to 'Deleted user'"). Gate with the typed-confirm pattern (type your email). On success → `keycloak.logout()`. On 409 `SOLE_OWNER` → inline error listing the orgs to hand off first (`FieldError`, not a toast).
- i18n under `account.export*` / `account.delete*`. **FEATURES.md** gets a "Your data & privacy" paragraph (export, delete, what's kept). Browser-verify with a throwaway user: export downloads a sane JSON; sole-owner block shows; after adding a second owner the deletion logs out and the old profile shows "Deleted user" on its comments. web 32 (no new unit tests required; e2e untouched).

---

## Part C — Audit log (P0 · GDPR Art. 30 / SOC 2 evidence)

### - [x] C1 — Schema: `AuditLog` + migration (S) *(done 2026-07-08)*
```prisma
// 3.7.4 — append-only security audit trail. Deliberately NO relations: rows must
// survive org deletion and user erasure (plain uuid columns, no FK cascade).
model AuditLog {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId      String?  @db.Uuid // null = account-level action (export/erasure)
  actorId    String?  @db.Uuid
  action     String   // dot-namespaced, e.g. "member.role_changed"
  targetType String   // "org" | "member" | "invite" | "project" | "ticket" | "account"
  targetId   String?
  meta       Json?    // small diffs, e.g. { from: "MEMBER", to: "ADMIN" }
  createdAt  DateTime @default(now())

  @@index([orgId, createdAt])
}
```
- `prisma migrate dev --name audit_log` (additive), then the **container generate + restart** dance (Conventions). api 81-suite unchanged.

### - [x] C2 — Service + wire the call sites (M) *(done 2026-07-08)*
- New `services/audit.service.ts`: `export async function audit(entry: {orgId?: string; actorId?: string; action: string; targetType: string; targetId?: string; meta?: object})` → `prisma.auditLog.create` wrapped in `try/catch` that only `logger.error`s — **an audit failure must never fail the user's request**. Fire it *after* the mutation succeeds (post-transaction, like event publishing).
- Wire exactly these sites (grep-verified locations):

  | Action | Site |
  |---|---|
  | `org.created` / `org.deleted` | `routes/organizations.ts:61` / `:149` |
  | `member.role_changed` (meta from→to) | `organizations.ts:198` |
  | `member.removed` | `organizations.ts:210` |
  | `invite.created` / `invite.revoked` | `organizations.ts:219` / `:256` |
  | `project.archived` / `project.restored` / `project.deleted` | `routes/projects.ts:165` / `:170` / `:177` |
  | `ticket.permanently_deleted` | `routes/tickets.ts` — the 3.7.3 `DELETE /:ticketId/permanent` handler |
  | `account.exported` / `account.erased` (`orgId: null`) | the B1/B2 handlers |

- Test (`src/test/audit.test.ts`): role-change a member → one `member.role_changed` row with correct meta; delete a project permanently → row exists. **api 85 → 87** (2 tests; assert directly via `prisma.auditLog.findMany` in the test db).

### - [x] C3 — API: `GET /api/orgs/:slug/audit` (S) *(done 2026-07-08)*
- In `routes/organizations.ts`, `preHandler: requireOrgRole('ADMIN')`. Cursor-paginated (reuse `lib/pagination.ts` exactly like the activity list at `:136`), newest first, optional `?action=` prefix filter. Resolve actor display names in the handler (batch `user.findMany` on the distinct `actorId`s — no FK, so no include) and return `{ id, action, targetType, targetId, meta, createdAt, actor: {name} | null }`.
- Test: list returns the C2 rows, MEMBER role gets 403. **api 87 → 88.** *(Web viewer = out of scope this phase — the endpoint is the deliverable; a settings page can consume it later.)*

---

## Part D — Supply chain + rate-limit maturity (P1)

### - [ ] D1 — CI: SCA gate + Dependabot (S)
- `.github/workflows/deploy.yml`, test job, after `pnpm install`: add `- run: pnpm audit --prod --audit-level high` (blocking; if a finding has no upstream fix, the escape hatch is a documented `pnpm audit --prod --audit-level critical` downgrade in that commit's message — owner decides).
- New `.github/dependabot.yml`: `npm` ecosystem, `directory: /sourcecode`, weekly; `github-actions`, `directory: /`, weekly; both `open-pull-requests-limit: 5`.
- Verify: run the audit command locally from `sourcecode/` and record the result in the Log (if it fails today, fixing/updating the offenders is **in scope** for this step).

### - [ ] D2 — Redis-backed + tiered rate limiting (M)
- Problem: the in-process store resets per replica and per restart. `@fastify/rate-limit` accepts an **ioredis** client via its `redis` option (the app's `redis` v4 client is not compatible — don't try to adapt it).
- `pnpm --filter @agentpm/api add ioredis` (+ container rebuild). In `index.ts`:
  ```ts
  const rlRedis = config.REDIS_URL
    ? new Redis(config.REDIS_URL, { connectTimeout: 500, maxRetriesPerRequest: 1 })
    : undefined // tests/dev-without-redis stay hermetic on the in-memory store
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute', redis: rlRedis })
  ```
  Close `rlRedis` in the existing `onClose` hook.
- Stricter per-route tiers via route `config: { rateLimit: { max, timeWindow } }` on the abuse-prone writes: org create (`organizations.ts:61`) and invite create (`:219`) → `20/min`; invite accept (`routes/invites.ts`) → `30/min`.
- Verify: suite still green with no `REDIS_URL` (hermetic); with the dev stack up, hammer org-create 21× → 429. No new unit tests required (the plugin is upstream-tested); **api stays 88.**

---

## Part E — Accessibility gate + data retention (P1)

### - [ ] E1 — axe-core in Playwright (M)
- `pnpm --filter @agentpm/web add -D @axe-core/playwright`. New `e2e/a11y.spec.ts` reusing `e2e/global-setup.ts` auth: for each of **Dashboard, project Board, project List, Account Settings**, run `new AxeBuilder({ page }).analyze()` and assert zero violations with `impact` `critical` or `serious` (log lesser ones, don't fail).
- **Fixing what it flags is in scope** (expect small stuff: contrast on muted text, missing `aria-label` on icon-only buttons, landmark order). If a finding needs a design decision, exclude it with a `// a11y-debt:` comment + a note in this file rather than silently disabling the rule.
- This is the regression gate the EN 301 549/EAA evidence trail starts from; record "axe: 0 serious+ on 4 core pages" in the Log.

### - [ ] E2 — Retention job: purge stale notifications + expired invites (S)
- New `services/retention.service.ts`:
  ```ts
  export async function purgeExpired(now = new Date()) → { notifications, invites }
  ```
  - notifications: delete where `readAt != null` AND `createdAt < now − RETENTION_NOTIFICATION_DAYS` (config, default **90**),
  - invites: delete where `acceptedAt == null` AND `expiresAt < now − 30 days`.
  - Returns delete counts; caller logs them.
- Add `RETENTION_NOTIFICATION_DAYS` to `config.ts` + `.env.example`.
- Schedule in `start()` (**not** `buildServer()` — keeps tests timer-free): run once on boot, then `setInterval(…, 24h).unref()`.
- Test: seed an old read notification + a fresh one + a long-expired invite → `purgeExpired()` removes exactly the stale two. **api 88 → 89.**
- Explicitly **not** purged: archived tickets/projects (owner keeps forever), audit rows (compliance evidence), unread notifications.

---

## Sequencing & scope notes

- Order: **C1 → C2 → C3** first (B2 writes an audit row, so the trail must exist), then **B1 → B2 → B3**, then **A1 → A2**, then **D1 → D2 → E1 → E2**. Each step is an independent commit; nothing here blocks on prod access except the A2 CSP promotion note.
- Expected exit state: **api ~89, web 32, e2e +1 spec**, all green; `PROGRESS.md` phase section added; `FEATURES.md` gains "Your data & privacy".
- **Out of scope (deliberately):** HA/multi-replica infra, backup/DR runbooks, SOC 2 org controls (ops, not code) · web audit-log viewer UI (endpoint only) · Keycloak account auto-deletion (no admin creds by design) · privacy-policy/consent page copy (legal text is the owner's) · P2 refactors from the report — Prisma-enum→Zod single-sourcing, repository seam for DIP, `/api/v1` namespace, OpenTelemetry (each is its own future phase if wanted).
- Report cross-reference: this phase closes report items **P0 1–3** and **P1 4–6, 8** in full, and starts **P1 5** (a11y gate = the evidence mechanism; a formal WCAG self-assessment doc remains a follow-up).
