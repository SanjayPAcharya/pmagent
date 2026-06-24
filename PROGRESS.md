# AgentPM — Implementation Progress

> **Live status of the monorepo build.** The plan (what to build) lives in [`agentpm-plan/`](agentpm-plan/README.md); the code lives in [`sourcecode/`](sourcecode/README.md) (the pnpm workspace root — all paths below are relative to it). This file tracks **what's actually been done**. Load this first each session to see where things stand.

## How to use this file (the convention)

- **Update it after every implemented step** — same commit as the code. A "step" = one checkbox below.
- Status markers: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked.
- When you finish a step: tick its box, and add a one-line entry to the **Log** (newest first) with the date + commit/PR.
- Keep **Now / Next / Blocked** current — it's the 5-second answer to "where are we?".
- Don't duplicate plan detail here; link to the phase file for the how.

---

## Now / Next / Blocked

- **Current phase:** Phase 2 — PM Core
- **Now:** ✅ **Phase 2 COMPLETE (2A–2E) + Phase 2F gap closure committed (`3db2df1`).** 2F closed all 11 plan-vs-build gaps: drawer sprint/label pickers + delete, per-card status menu, board search/filter/sort, Members & invites page (add-by-email + links), sprint↔tickets + move-between-sprints, labels API/UI, @mention picker, Keycloak check-sso, within-column reorder, drawer optimistic updates (+ 2E drag polish & empty-body fix). **35 API tests** + typecheck/build green.
- **Next:** **Browser-verify the 2F items** (C9 refresh-persistence — cookie-dependent; C10 reorder feel; mention→notification chain), then **Phase 2.5** (dark mode/i18n/mobile/Cmd-K/Playwright) or **Phase 3** (deploy/CI-CD).
- **Blocked:** none. Notes: **after changing app deps, rebuild that container** (`docker compose build api|web && up -d`) — `node_modules` is in the image (only source is mounted). **API source-only edits need `docker compose restart api`** — macOS bind-mount inotify doesn't reach `tsx watch` (Vite/web HMR is fine). `corepack` flake — pin `corepack pnpm@9.12.0`; `COREPACK_INTEGRITY_KEYS=0` for install. Realtime tests need Redis (host `:6379`). CI finalized in Phase 3.

---

## Phase 1 — Skeleton, Auth (Keycloak), Platform → [plan](agentpm-plan/phases/phase-1-skeleton-auth-platform.md)
**Status:** ✅ **COMPLETE (Stages A–E)** — boots, auth, platform CRUD, frontend, tests green. (Optional: social IdP external apps.)

Scaffold & data
- [x] Monorepo: pnpm workspaces + Turborepo (`package.json`, `pnpm-workspace.yaml`, `turbo.json`)
- [x] Prisma schema + first migration (User, Organization, OrgMember, Project) — applied to Postgres

Local container stack (so `docker compose up` works)
- [x] `apps/api/Dockerfile` + `apps/web/Dockerfile`
- [x] `docker-compose.yml` (base) + `docker-compose.override.yml` (dev) + `.env.example`
- [x] Postgres init script (`agentpm` + `keycloak` DBs)
- [x] Local Keycloak container + committed `realm-agentpm.json` (clients, audience mapper, self-registration)

Backend
- [x] Fastify bootstrap + middleware — CORS, rate-limit, websocket, `/health`, **JWKS token verification (iss + aud)**
- [x] Auth middleware (`requireAuth` + JIT user provisioning, `requireOrgRole`) + RBAC
- [x] `GET`/`PATCH /api/me`
- [x] Organizations CRUD + member management
- [x] Projects CRUD (no GitHub repo link yet)

Frontend
- [x] Vite + React 18 + TS + Tailwind (shadcn/ui deferred — plain Tailwind for now)
- [x] React Router + protected layout / auth gate
- [x] keycloak-js auth (login, signup, PKCE, token auto-refresh; social shown on the KC page once IdPs added)
- [x] Dashboard + org/project navigation
- [x] Typed API client (attaches token + refresh-before / retry-on-401)

Identity (external prereqs)
- [x] Keycloak realm running locally (email/password first)
- [ ] Google OAuth client · Azure App Registration · GitHub OAuth App → wired as Keycloak IdPs (optional)

Tests (Stage E)
- [x] Hermetic auth harness (RSA keypair + static JWKS stand-in; no Keycloak in CI)
- [x] API tests green — auth middleware (6), organizations (4), projects (2), health (1) = 13

**Exit:** sign up (email/Google/Microsoft/GitHub) → create org → create project; `docker compose up` runs the full stack; auth + org/project tests pass.

---

## Phase 2 — PM Core (tickets, board, sprints, realtime) → [plan](agentpm-plan/phases/phase-2-pm-core.md)
**Status:** ✅ **COMPLETE (2A–2E)** — tickets/board/sprints/realtime/notifications/invites, verified in-browser.
- [x] **2A** Migration: ticket/sprint/label(+org rel)/comment + `TicketWatcher`/`TicketActivity`/`OrgInvite`/in-app `Notification`; ticket `dueDate`/`archivedAt`; `Project.key`+`ticketCounter` (+backfill); onDelete clauses; project-create derives key; idempotent seed; test truncation extended
- [x] **2B** Tickets backend: transactional create + atomic numbering, `updateTicket` service + activity, comments, assignee/watchers, cross-scope validation, search/filter/sort (whitelist) + cursor pagination, Swagger (zod-provider), `/ready` + graceful shutdown
- [x] **2C** Sprints + completion counts; event bus init/dispose; WS server (project+user rooms, presence, hardened handshake) + shared `WSMessage`; caller-scoped in-app notifications; org invite tokens (role-capped, single-use)
- [x] **2D** Frontend foundation: **shadcn/ui**, routing restructure (public `/invite/:token` vs gated), members endpoint + `api.listMembers`, typed WS client (refresh + reconnect-refetch + echo-dedupe)
- [x] **2E** Board (dnd-kit + position) + quick-add + drawer (comments/activity/assignee/watchers/labels/due) + sprint view + completion bars + optimistic UI/toasts/skeletons + notification bell + deep-link; **verified in-browser**
- [x] API + WS tests (CRUD, RBAC, pagination round-trip, soft-delete, invite, notification IDOR, WS handshake); REDIS_URL + truncation order in harness — **34 tests** across tickets/ticket-detail/sprints/invites/notifications/realtime; harness `setup.ts` truncates in FK order, realtime.test sets `REDIS_URL`
- Dropped/deferred: `bulk-update` (deferred); dark mode/i18n/mobile/Cmd-K/Playwright → **Phase 2.5**

---

## Phase 2F — Gap closure → [draft](agentpm-plan/phases/phase-2f-gap-closure.md)
**Status:** 🟢 **all 11 items implemented (A+B+C)** — gaps between the Phase 2 plan (drawer/board/UX/DoD) and what 2A–2E shipped. typecheck/build/35 API tests green; **in-browser verification pending** (uncommitted).

**Status:** ✅ **all 11 implemented (A+B+C); typecheck/build/35 API tests green; browser-verify pending.**

_Group A — backend ready, UI wiring only:_
- [x] **A1** Sprint picker in the ticket drawer (associate ticket↔sprint via `updateTicket({sprintId})`)
- [x] **A2** Per-card JIRA-style status dropdown on the board (hover ⋯ menu; stopPropagation so it doesn't drag/open)
- [x] **A3** Delete/archive ticket from the drawer (confirm → `deleteTicket` → close + refetch)
- [x] **A4** Search/filter/sort bar on the board (q debounced + priority/type/assignee/sprint/sort; query key includes params)
- [x] **A5** Invite-member UI: new `/orgs/:slug/members` page — members list + create/copy invite link + list/revoke pending
- [x] **A6** Sprint↔tickets on the Sprints page (expand row → list tickets + remove + add-ticket picker)

_Group B — needs new backend + UI:_ ✅ **done (typecheck+build+35 tests; not browser-verified)**
- [x] **B7** Labels: `/api/labels` CRUD (org-scoped) + label-assignment via `PATCH /tickets/:id` (`labelIds` replace-set, cross-scope guard) + drawer picker (chips/add/create-with-color) + API test
- [x] **B8** @mention member picker in the comment box (trailing `@` → member autocomplete → `@[uuid]` token; renders back as `@Name`)

_Group C — polish / pre-existing:_
- [x] **C9** Hard-refresh → Landing: Keycloak `check-sso` + `public/silent-check-sso.html` _(needs browser check — silent iframe can be blocked by third-party-cookie rules)_
- [x] **C10** Within-column drag reordering — cards use `useSortable`+`SortableContext` (closestCorners); drop computes target column + insert index → fractional `positionBetween` neighbours; DragOverlay kept _(implemented; **reorder feel needs an in-browser check**)_
- [x] **C11** Drawer optimistic updates (scalar fields merge into the `['ticket']` cache instantly, rollback on error)

> **All 11 implemented** (A1–A6, B7, B8, C9, C10, C11) + extras: move-ticket-between-sprints, add-member-by-email on Members page, mention shows display name (not UUID), card hover-overlap fix. Verified by typecheck/build/35 API tests. **Browser-verify pending** — especially C9 (cookie-dependent), C10 (reorder feel), and the mention→notification chain.

---

## Phase 2.5 — UX Hardening → [plan](agentpm-plan/phases/phase-2.5-ux-hardening.md)
**Status:** 🟡 in progress — dark mode done; i18n/mobile/Cmd-K/E2E next.
- [x] Dark mode (Tailwind `darkMode:'class'` + `.dark` CSS-var palette; `theme.ts` localStorage+OS pref, applied pre-render; toggle in Layout; retrofit Landing/Dashboard/OrgProjects to tokens; Toaster `theme=system`)
- [x] i18n (react-i18next + LanguageDetector, `en` baseline in `locales/en.json`, `lib/i18n.ts`; **all UI strings externalized** across every page/component incl. Phase-1; localStorage persistence)
- [ ] Mobile-responsive board + drawer
- [ ] Cmd-K command palette
- [ ] Playwright E2E (Keycloak storageState; CI wiring in Phase 3) + a11y pass

---

## Phase 3 — Containerized Deployment + CI/CD → [plan](agentpm-plan/phases/phase-3-dev-deployment-cicd.md)
**Status:** ⬜ not started
- [ ] `docker-compose.prod.yml` + Caddy config + `Makefile` (`up-managed` / `up-selfhost`)
- [ ] Provision managed data (RDS + ElastiCache) + create `agentpm`/`keycloak` DBs
- [ ] Provision VM + DNS (`agentpm.io` / `api.` / `auth.`)
- [ ] Prod `.env` on VM (managed endpoints, locked perms)
- [ ] GitHub Actions CI (lint/typecheck/test) + CD (build/push images → migrate → `compose up -d`)
- [ ] Deploy to staging end-to-end + hardening checklist

---

## Phase 4 — GitHub Integration + Code Agent → [plan](agentpm-plan/phases/phase-4-github-code-agent.md)
**Status:** ⬜ not started
- [ ] GitHub App + connect flow + webhook receiver
- [ ] Shared agent utils + repo reader + code generator + PR creator
- [ ] BullMQ queue + concurrency guard + worker service
- [ ] AgentAction logging + rollback + approval gate
- [ ] Frontend: assign agent, activity feed, approval UI, PR link
- [ ] Trial/billing guard on agent runs (cost control)

---

## Phase 5 — Notifications & Channels → [plan](agentpm-plan/phases/phase-5-notifications-channels.md)
**Status:** ⬜ not started
- [ ] Email (SES) + notification worker + sprint digest cron
- [ ] WhatsApp + Slack two-way (post-MVP)

---

## Phase 6 — Full Agent Suite + Autonomy → [plan](agentpm-plan/phases/phase-6-agent-suite-autonomy.md)
**Status:** ⬜ not started
- [ ] Spec / QA / Deploy / Observability agents (+ per-run container isolation)
- [ ] Autonomy dial (server-side enforcement; prod always human)

---

## Phase 7 — Autonomous Sprints → [plan](agentpm-plan/phases/phase-7-autonomous-sprints.md)
**Status:** ⬜ not started
- [ ] Sprint Planner Agent + multi-agent coordination + parallel workstreams + analytics

---

## Log (newest first)

| Date | Phase | Step / change | Commit |
|---|---|---|---|
| 2026-06-24 | P2.5 | Stage 2.5B (i18n): `react-i18next` + `i18next-browser-languagedetector` + `lib/i18n.ts`; `locales/en.json` baseline; **externalized every UI string** across Landing/Layout/Dashboard/OrgProjects/Members/InviteAccept/Board/Column/TicketCard/TicketDrawer/Sprints/NotificationBell (incl. toasts, placeholders, empty states); localStorage persistence. Rebuilt web container for new deps. typecheck/build green. | _pending_ |
| 2026-06-24 | P2.5 | Stage 2.5A (dark mode): tailwind `darkMode:'class'` + `.dark` CSS-var palette; `theme.ts` (localStorage + `prefers-color-scheme`, applied pre-render); sun/moon toggle in Layout; sonner Toaster `theme=system`; retrofit Landing/Dashboard/OrgProjects hard-coded light colors → tokens. typecheck/build green. | f29497f |
| 2026-06-24 | P2/F | Stage 2F (gap closure, all 11): **A** — sprint picker in drawer, per-card status menu (hover ⋯), delete-ticket in drawer, board search/filter/sort bar, **Members & invites page** (add-by-email + create/copy/revoke invite links), sprint↔tickets on Sprints page + move-between-sprints. **B** — labels: `routes/labels.ts` CRUD (org-scoped) + assignment via `PATCH /tickets/:id` `labelIds` (replace-set, cross-scope guard) + drawer picker; @mention picker (editor shows `@Name`, sends `@[uuid]`). **C** — Keycloak `check-sso` + `public/silent-check-sso.html` (refresh keeps session); within-column reorder (`useSortable`/`SortableContext`, fractional `positionBetween`); drawer optimistic updates. +2 API tests (label assign/cross-scope, body-less DELETE). **35 API tests** + typecheck/build green. Browser-verify pending (C9 cookies, C10 reorder feel, mention→notify). | 3db2df1 |
| 2026-06-24 | P2 fix | Body-less requests 400'd (`Body cannot be empty when content-type is application/json`) — broke DELETE watcher / delete ticket / remove-from-sprint and body-less POSTs (start/complete sprint, mark-read). Fix: web `request()` omits `Content-Type` when there's no body; api adds a tolerant `application/json` parser (empty → undefined). +1 regression test (DELETE watcher w/ json content-type → 204). 34 tests green. | 3db2df1 |
| 2026-06-24 | plan | Phase 2F gap-closure draft: 11 gaps between the Phase-2 plan (drawer/board/UX/DoD) and 2A–2E, found in in-browser verification; grouped A (UI over existing APIs) / B (new backend) / C (polish), with approach + effort per item. | f37a9e9 |
| 2026-06-24 | P2/E | Stage 2E (board/drawer/sprints/bell + **Phase 2 complete**): Kanban `Board` (dnd-kit drag→status+position, quick-add per column, JIRA status dropdown, completion bar, presence avatars), `TicketCard`/`Column`, `TicketDrawer` (deep-link `/ticket/:number`; title/desc/AC edit, status+priority, assignee picker, watcher chips, story points, due date, Comments\|Activity tabs, marked+DOMPurify markdown), `NotificationBell` (WS-live unread badge + deep-link), `Sprints` (create/start/complete + completion bars). shadcn ui added: sheet/dropdown-menu/tabs/textarea/skeleton/label; deps dnd-kit/radix/marked/dompurify/sonner; Toaster mounted; full-width layout. API client extended (tickets/sprints/notifications/comments/watchers/activity). Backend: ticket-create accepts `status` (quick-add into column); **`MAX_LIMIT` 100→200** (board fetches whole project — was silently 400ing the board). +4 API tests (comments/watchers/cross-scope/update). **Verified in Chrome** (create/list/drag/status/drawer/sprint). 33 tests + web build green. | 36ee154 |
| 2026-06-24 | P2/D | Stage 2D (frontend foundation): shadcn/ui infra (`components.json`, `lib/utils.ts` cn, `@/*` paths in web tsconfig, tailwind theme tokens + `index.css` CSS vars, base ui: button/input/card/badge/avatar; deps cva/clsx/tailwind-merge/tailwindcss-animate/lucide-react/radix slot+avatar + `@agentpm/shared-types`). Routing restructure in `App.tsx` (always-on Router; public `/invite/:token`; gated via `RequireAuth`→Landing). `pages/InviteAccept.tsx` (unauth → sign-in-to-accept returns to token; authed → auto-accept → redirect to org). Backend `GET /orgs/:slug/members` enhanced (+`avatarUrl`, `initials` fallback). `lib/api.ts` +Member/Invite types +`listMembers`/`createInvite`/`acceptInvite`. `lib/websocket.ts` `useProjectWebSocket` (refresh-before-connect, backoff reconnect, refetch-on-reconnect, self-echo dedupe) on shared `WSMessage`. Layout sign-out → Button. Verified: web typecheck + vite build, api typecheck + 29 tests; full docker stack healthy (in-browser confirmed). | aec19c5 |
| 2026-06-24 | P2/C | Stage 2C (sprints + realtime + notifications + invites, backend): `routes/sprints.ts` (CRUD, start/complete+velocity, add/remove tickets w/ cross-scope guard, completion counts via groupBy); `websocket/ws-server.ts` (`/ws` handshake: auth-timeout→4001, `auth/verify-token.ts` shared jose JWKS verifier, project-membership gate, project+user rooms, presence, fan-out by projectId/userId); `services/notifications.service.ts` (subscribe ticket.* → recipients assignee/creator/watchers/@mentioned − actor → `Notification` rows + `notification.new`); org invites (CSPRNG token, role-cap, single-use, expiry) on org routes + `routes/invites.ts` accept; `routes/notifications.ts` caller-scoped (IDOR-safe). Event bus refactored to single Redis subscription → multi-handler dispatch; wired in `buildServer` + `onClose` dispose. Shared `WSMessage`/`WSEventType`. +10 tests (sprints, invites single-use/expiry, notification IDOR, WS timeout/auth/delivery). Verified: typecheck, build, **29 tests**. | 25c278d |
| 2026-06-24 | P2/B | Stage 2B (tickets backend): `routes/tickets.ts` (CRUD + soft-delete, status quick-change, comments, watchers, activity, list) via `fastify-type-provider-zod`; `tickets.service.ts` — transactional create + atomic numbering (`Project.ticketCounter`), `updateTicket` writing `TicketActivity` + returning post-commit events, cross-scope validation (assignee/labels/sprint/parent/deps); cursor pagination helper (Prisma keyset, id tiebreaker); lazy Redis `event-bus.ts` (`publishEvent` no-op until 2C); Swagger `/documentation`; `/ready` + SIGTERM/SIGINT graceful shutdown. +6 ticket API tests (numbering, RBAC 403, assign/activity, cross-scope 400, pagination round-trip, soft-delete). Verified: db:generate, typecheck, build, **19 tests**. | ac32a7e |
| 2026-06-24 | P2/A | Stage 2A (data): Phase-2 Prisma schema (Ticket/Sprint/Label/Comment/TicketDependency/TicketWatcher/TicketActivity/OrgInvite/in-app Notification + enums; agent scalar cols kept, agent tables deferred); `Project.key`+`ticketCounter`; onDelete clauses; Label↔Org relation. Hand-written migration with `key` backfill (existing projects → WEBA/EMPL). Project-create derives+dedupes key. Idempotent `db:seed`. Test truncation extended to new tables. Verified: migrate deploy, prisma generate, typecheck, build, 13 tests, seed×2. | c97352d |
| 2026-06-24 | plan | Phase 2/2.5 re-verify: no new Tier-1 blockers. Folded refinements — per-user rate-limit keying happens pre-auth (key off JWT sub in keyGenerator); soft-delete filters in list queries only (fetch-by-id/restore unaffected, no global Prisma hide); add `NotificationType`/`NotificationChannel` enums in 2A; `updateTicket` returns events to publish after commit; members endpoint enhances the Phase-1 route (+avatarUrl, initials fallback); E2E cross-user notification asserted via API. | fa3872e |
| 2026-06-23 | plan | Phase 2 audit (7-dim workflow, 62 findings) → folded Tier-1 fixes into plan: notification IDOR scoping, org-bounded @mention + server sanitize, invite token entropy/single-use/role-cap, sort whitelist + cursor tiebreaker, cross-scope validation, publish-after-commit + transactional create + `updateTicket` service, position scheme, onDelete + Label org relation, WS handshake hardening + self-echo dedupe + refetch-on-reconnect + shared `WSMessage`, public/gated routing, members endpoint, graceful shutdown, zod-provider scope, per-user rate limit. Defined sub-stages 2A–2E. Split **Phase 2.5 (UX hardening)**; dropped `bulk-update`; adopted shadcn. Updated phase-2, new phase-2.5, 03/04/06/07 refs, README, PROGRESS. | 37f5681 |
| 2026-06-23 | plan | Phase 2 blockers resolved in plan: (1) shared jose WS verifier + @fastify/websocket v11 `(socket,req)` signature; (2) lazy event bus init/dispose (tests use Redis); (3) atomic ticket numbering via `Project.ticketCounter`; (4) `Project.key` for AGP-42 + migration backfill; (5) `fastify-type-provider-zod` for validation+Swagger. Updated phase-2, 03-data-models, 04-api-reference. | 37f5681 |
| 2026-06-23 | plan | Phase 2 scope round 2: invite links, due date, soft-delete, search/filter/sort + cursor pagination, deep-link ticket route, optimistic UI/toasts/skeletons, quick-add + Cmd-K, markdown+@mention (DOMPurify), presence, in-app notification bell (WS user rooms → assignee/creator/watchers/mentioned), Swagger + /ready + seed, dark mode, i18n scaffold, mobile, Playwright E2E. Models: `OrgInvite` + in-app `Notification`, ticket `dueDate`/`archivedAt`. Decisions kept: org=project access, attachments deferred. | ae75857 |
| 2026-06-23 | plan | Phase 2 scope additions (feedback): clean/smooth/creative UI guideline, JIRA-style quick status change, assignee, watchers/CC, activity timeline, completion progress bar. Added `TicketWatcher` + `TicketActivity` models + watcher/activity endpoints. Not yet implemented. | 585ff49 |
| 2026-06-23 | plan | Re-sequenced phases: **Phase 2 = PM Core**, **Phase 3 = Deployment + CI/CD** (swapped). Renamed phase files + updated all headings, cross-refs, links, README flow/index, PROGRESS. | 9528d39 |
| 2026-06-23 | P1/E | Stage E (tests): hermetic auth harness (jose RSA keypair + in-test JWKS/OIDC stand-in, no Keycloak), Vitest globalSetup (creates+migrates `agentpm_test`) + per-worker truncation. Suites: auth middleware (6), organizations (4), projects (2) + health (1) = 13 green. Removed temp debug log. **Phase 1 complete.** | 8de7afe |
| 2026-06-23 | P1/D | Stage D (frontend): keycloak-js auth (login/signup, PKCE, token refresh), auth-gated React Router + Layout, typed API client (token attach + retry-on-401), Dashboard (orgs + create) + OrgProjects (projects + create) via React Query. Verified in-browser by user: signup → create org (OWNER) → create project. shadcn deferred (plain Tailwind). | 140d01c |
| 2026-06-23 | P1/C | Stage C (platform CRUD): Organizations CRUD + members (creator→OWNER, last-owner guard, add-by-email), Projects CRUD; shared authz (`assertOrgRole`/`requireOrgRole`/RBAC), slug helper, global error handler (ApiError + ZodError→400). Verified with real tokens: CRUD, validation 400, last-owner 400, non-member 403. | 2560397 |
| 2026-06-23 | P1/B | Stage B (API auth): @fastify/jwt + get-jwks JWKS verification (iss/aud); issuer vs JWKS host decoupled (no /etc/hosts). `requireAuth` + JIT User provisioning, `requireOrgRole` + RBAC, `GET`/`PATCH /api/me`. Verified with real Keycloak token: 401/tampered→401, valid→200, PATCH ok, idempotent (1 row). | 8f6d5c6 |
| 2026-06-23 | P1/A | Fix: local dev = plain HTTP (no TLS). Added dev-only `keycloak-init` (shares KC netns, sets master realm `sslRequired=NONE` on every up) so the admin console works over HTTP; not in prod overlay (prod keeps HTTPS via Caddy). Synced ref 12. | beac2c9 |
| 2026-06-23 | P1/A | Fix: moved prod Keycloak flags (start --optimized, KC_HOSTNAME, KC_PROXY_HEADERS, KC_HTTP_ENABLED) out of compose base → dev base now `start-dev`. Resolves admin-console "HTTPS required" on localhost. Synced ref 12 (base dev-safe; prod flags in prod overlay). | beac2c9 |
| 2026-06-23 | P1/A | Stage A scaffold: monorepo, Dockerfiles, compose (base+dev), Postgres init, Keycloak realm, Prisma schema+init migration, Fastify `/health`, Vite/React/Tailwind shell. Verified: install, typecheck, build, test, `docker compose up` (5 services green), `/health` 200, realm imported, migration applied. | beac2c9 |
| 2026-06-23 | — | Progress tracker created; repo not yet scaffolded | — |
