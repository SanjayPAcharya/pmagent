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

- **Current phase:** **Phase 2.8.5 — Auth UX** frontend + plumbing done (social login pending your OAuth app creds); then **Phase 3** (deployment + CI/CD). Phases 1 · 2 · 2.1 · 2.5 · 2.6 · **2.8** all ✅ complete. (Phase 5.5 = agent-first UI, parked → lands with Phase 5.)
- **Now:** ✅ **Phase 2.6 complete & browser-verified** — all 25 non-agent items across 6 slices (single-user verified in Chrome; realtime **E1/B1/E3** verified two-user via incognito). **35 API tests green**; migration `20260625000000_org_accent` applied. Minor build-only-verified: B3 mobile swipe, B5 (needs stale tickets), H2 (single-member org).
- **Decision (2026-06-25):** **all agent-related work is sequenced AFTER Phase 3.** Ship deployment/CI-CD first, then the agent block: agent-first UI ([Phase 5.5](agentpm-plan/phases/phase-5.5-agent-first.md): A2/A3/A4) lands with **Phase 5** (Code Agent), followed by Phases 6–7. So nothing agent-shaped happens until the product is deployable.
- **Next:** finish **Phase 2.8.5** — register the Google/Azure/GitHub OAuth apps and drop creds into `.env` to light up social login (code is in place); then **Phase 3 — deployment + CI/CD** (`docker-compose.prod.yml` + Caddy + Makefile, managed RDS/ElastiCache, VM+DNS, GitHub Actions CI/CD, staging deploy). Optional housekeeping first: `docker compose build web` to bake new deps (cmdk/i18n/playwright) into a clean image; clean up test data in `Infinity/Employee Tracker` (EMPL-1 AC checklist, EMPL-5 drag-test ticket).
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

## Phase 2.1 — Gap closure → [plan](agentpm-plan/phases/phase-2.1-gap-closure.md)
**Status:** ✅ **COMPLETE** — all 11 items (A+B+C) implemented & committed (`3db2df1`); typecheck/build/35 API tests green. Closes gaps between the Phase 2 plan (drawer/board/UX/DoD) and what 2A–2E shipped. (Historically "2F"; renumbered to **2.1** as it patches Phase 2.)

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
**Status:** ✅ **COMPLETE** — dark mode, i18n, mobile, Cmd-K, a11y + Playwright E2E scaffold. (E2E executes locally per docs; CI wiring → Phase 3.)
- [x] Dark mode (Tailwind `darkMode:'class'` + `.dark` CSS-var palette; `theme.ts` localStorage+OS pref, applied pre-render; toggle in Layout; retrofit Landing/Dashboard/OrgProjects to tokens; Toaster `theme=system`)
- [x] i18n (react-i18next + LanguageDetector, `en` baseline in `locales/en.json`, `lib/i18n.ts`; **all UI strings externalized** across every page/component incl. Phase-1; localStorage persistence)
- [x] Mobile-responsive board + drawer (board snap-scrolls, columns `85vw` on mobile; drawer already full-width sheet; Mouse+Touch(long-press 220ms)+Keyboard dnd sensors; header email hidden on small screens)
- [x] Cmd-K command palette (`cmdk` + `components/ui/command.tsx`; `CommandPalette` mounted in Layout, ⌘/Ctrl-K; quick-create ticket from query, jump to ticket by #/title, switch project/org; context from URL)
- [x] Playwright E2E scaffold (`playwright.config.ts` + `e2e/global-setup.ts` Keycloak login→storageState + `e2e/core-flow.spec.ts` create-org/project→add/open ticket→comment, + optional cross-user mention assertion via password-grant API; `test:e2e` script) — **runs locally** per docs (needs `pnpm exec playwright install` + seeded KC user + `docker compose up`); CI wiring → Phase 3. **a11y pass:** card keyboard activation (Enter/Space) + focus ring + aria-label; bell aria-label; radix dialogs trap/restore focus

---

## Phase 2.6 — UX Delight & Agent-First Polish → [draft](agentpm-plan/phases/phase-2.6-ux-delight.md)
**Status:** 🟢 **Slice 1 shipped (7 items)** — quick-win delight pass, web-only, typecheck/build green; **in-browser verification pending**. Remaining groups build selectively (not a gate). "Phase 5-dep" = UI now, action when the agent lands.

_A — Agent-first signatures:_
- [x] **A1** Ticket "readiness meter" (goal/AC/constraints fill → ring) — S _(ring on card + drawer; drawer now edits goal/constraints too)_
- → **A2, A3, A4 moved to [Phase 5.5](agentpm-plan/phases/phase-5.5-agent-first.md)** (parked; imply an actual agent, wire with Phase 5)

_B — Board:_
- [x] **B1** Live "ghost drag" via presence/WS — M _(ephemeral `ticket.drag` relay → faint ghost card w/ dragger avatar in target column — build+test verified)_
- [x] **B2** Column WIP-limit pulse — S _(IN_PROGRESS/IN_REVIEW limit 3; badge shows N/limit, pulses amber over — verified badge format)_
- [x] **B3** Swipe-to-advance (mobile) — S _(quick horizontal flick → next/prev status; composes with dnd touch listener — build-verified)_
- [x] **B4** Focus mode (`f`) — S _(dim non-mine cards; `f` key + header toggle)_
- [x] **B5** Time-decay card coloring (by `updatedAt`) — S _(left border darkens with age; fresh <2d = none — build+logic verified)_

_C — Drawer:_
- [x] **C1** Unified activity+comments "story" timeline — M _(third drawer tab, chronological merge — verified)_
- [x] **C2** Acceptance-criteria checklist → completion — M _(no backend — `- [ ]` task-list convention in AC; interactive checkboxes + N/total)_
- [x] **C3** In-editor slash commands — M _(`/status /assign /sprint /due /label` in the comment box — verified `/status done`)_
- [x] **C4** Relative time, exact on hover — S _(drawer comments/activity + notification bell)_

_D — Command palette:_
- [x] **D1** Full action surface (status/assign/sprint/label/theme) — M _(cmdk sub-pages on the open ticket + global theme toggle)_
- [x] **D2** Recent / frecency — S _(localStorage frecency; Recent tickets when query empty)_
- [x] **D3** Natural quick-create (`!high @user #sprint`) — M _(parser → priority/assignee/sprint; badges in the create item)_

_E — Notifications / presence / realtime:_
- [x] **E1** Ticket-level presence (who's on which ticket) — M _(ephemeral `ticket.viewing`→`ticket.presence`; pulsing viewer avatars on card + drawer — build+test verified)_
- [x] **E2** Toast → Undo (reuse rollback snapshot) — S _(board column moves + every drawer field patch)_
- [x] **E3** Notification grouping + "catch me up" — M _(no backend — client-side group by ticket "N updates", unread-since header)_

_F — Sprints / planning:_
- [x] **F1** Burndown sparkline — M _(no snapshot table — `GET /sprints/:id/burndown` reconstructs remaining-work-over-time from activity; inline SVG ideal-vs-actual on active/completed sprints)_
- [x] **F2** Drag tickets into a sprint — M _(Sprints page: backlog drop-zone + sprint cards droppable; dnd-kit → add/removeFromSprint)_
- [x] **F3** Velocity-aware capacity bar — S _(committed pts vs last completed velocity; amber overcommit — build+logic verified, shows when pts>0)_

_G — Delight / craft:_
- [x] **G1** "Done" confetti (reduced-motion aware) — S _(canvas burst, no dep; fires on move→DONE board + drawer)_
- [x] **G2** Per-org accent color + theme tristate + `t` — M _(migration `Organization.accentColor` + PATCH; accent → `--primary` (Layout); theme light/dark/system + `t`; accent picker on Members)_
- [x] **G3** Layout-matched skeletons — S _(`BoardSkeleton` mirrors columns/cards)_
- [x] **G4** Keyboard help overlay (`?`) — S _(radix dialog; ⌘K / f / ? / Enter / Esc)_

_H — Onboarding / empty states:_
- [x] **H1** Guided first ticket (name→goal→column) — S _(empty-board starter card → creates in Backlog + opens drawer — verified)_
- [x] **H2** Invite nudge on empty members — S _(team-of-one banner → create invite link — build+logic verified)_

> Suggested first slice (quick, no backend): **E2 Undo · A1 readiness · G1 confetti · G3 skeletons · G4 `?` · C4 relative time · B4 focus**. Detail/effort per item in the [draft](agentpm-plan/phases/phase-2.6-ux-delight.md).

---

## Phase 2.8 — Branding (PMAgent) → [plan](agentpm-plan/phases/phase-2.8-branding.md)
**Status:** ✅ **IMPLEMENTED (2026-06-26)** — product + Keycloak rebranded to **PMAgent** (camel-case). Web typecheck + build green; **35 API tests green** (host — the `node:20` container has no global `WebSocket`, so the 3 realtime tests only pass on Node ≥21/host). Keycloak login theme verified over HTTP (theme `pmagent.css` + `logo.svg` → 200; realm `displayName`/`loginTheme` set). Live pixel screenshot still worth a look.
- [x] Web: `index.html` title + `favicon.svg` · `en.json` `common.appName` + `invite.title` · Swagger `title` → **PMAgent**
- [x] Keycloak **Tier 2**: custom `pmagent` login theme (`infra/keycloak/themes/pmagent/login` — `theme.properties` + `pmagent.css` + wordmark `logo.svg`), mounted into the KC container; realm `displayName`/`displayNameHtml`=PMAgent + `loginTheme`=pmagent; client display names → PMAgent
- [x] E2E brand assertion updated (`/PMAgent/i`); web typecheck/build + 35 API tests green
- [x] favicon (`apps/web/public/favicon.svg`, PM monogram) + custom Keycloak login theme (logo + slate-900 brand)
- Decisions settled: wordmark **PMAgent**; Keycloak **Tier 2**; identifiers (`@agentpm/*`, realm/client ids, `agentpm.io`) intentionally unchanged.

---

## Phase 2.8.5 — Auth UX: in-app OAuth (no Keycloak login page) → [plan](agentpm-plan/phases/phase-2.8.5-auth-ux.md)
**Status:** 🟢 **frontend + IdP plumbing implemented (2026-06-26); social login pending OAuth creds.** In-app **Google/Microsoft/GitHub** buttons via `idpHint` (no Keycloak page) + email/password (**2.8.5b** → branded KC page). Web typecheck/build green; `keycloak-init` runs clean (exit 0): skips IdPs without creds, disables first-broker "Review Profile". Social round-trip verifiable once the OAuth apps are registered.
- [x] Frontend: `lib/auth.ts` `loginWith(idp)` (`keycloak.login({ idpHint })`); `Landing.tsx` Google/MS/GitHub buttons (`ProviderIcons`) + email/password (→ branded KC page) + PMAgent logo; i18n
- [x] Runtime IdP plumbing: `keycloak-init` extended (kcadm upsert google/microsoft/github from env, skip if no creds; disable first-broker "Review Profile" → seamless auto-create); `trustEmail`; `GOOGLE_/MICROSOFT_/GITHUB_CLIENT_*` in `.env`/`.env.example` (empty placeholders, never committed)
- [x] Email/password mechanism — **decided: 2.8.5b hybrid** (branded Keycloak page)
- [ ] Prereq (user): register OAuth apps (Google Cloud / Azure AD / GitHub) → drop client id+secret into `.env` → `docker compose up -d --force-recreate keycloak-init`. **Runbook:** [references/13-social-login-setup.md](agentpm-plan/references/13-social-login-setup.md)
- [ ] Verify the social round-trip in-browser on localhost with ≥1 real provider (blocked on creds)

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

## Phase 4 — Notifications & Channels → [plan](agentpm-plan/phases/phase-4-notifications-channels.md)
**Status:** ⬜ not started
- [ ] Email (SES) + notification worker + sprint digest cron
- [ ] WhatsApp + Slack two-way (post-MVP)

---

## Phase 5 — GitHub Integration + Code Agent → [plan](agentpm-plan/phases/phase-5-github-code-agent.md)
**Status:** ⬜ not started
- [ ] GitHub App + connect flow + webhook receiver
- [ ] Shared agent utils + repo reader + code generator + PR creator
- [ ] BullMQ queue + concurrency guard + worker service
- [ ] AgentAction logging + rollback + approval gate
- [ ] Frontend: assign agent, activity feed, approval UI, PR link
- [ ] Trial/billing guard on agent runs (cost control)
- [ ] Agent-first UI surfaces (A2/A3/A4) — land in **[Phase 5.5](agentpm-plan/phases/phase-5.5-agent-first.md)**

---

## Phase 5.5 — Agent-First Surfaces → [plan](agentpm-plan/phases/phase-5.5-agent-first.md)
**Status:** ⬜ **parked → lands with Phase 5** — agent-first UI whose *action* needs the Code/Spec agent. Renumbered from 2.7 (it's an agent phase, so it sits right after Phase 5). A1 (readiness ring) already shipped in 2.6.
- [ ] **A2** `@agent` first-class in mention/assignee pickers — M
- [ ] **A3** "Draft with agent" goal/AC/constraints skeleton — M
- [ ] **A4** Agent swimlane/badge on the board — S–M

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
| 2026-06-27 | P2.8 | **Keycloak login/register theme → matches the app.** Restyled the `pmagent` theme to the app's Landing card (tokens, app-style inputs, integrated password toggle [removed PatternFly `::after` borders], no grey footer band, tidy register layout via Bootstrap-col reset); inline themed PMAgent wordmark; **‹ Back** link on both pages → the app (`agentpm-web` client `baseUrl` set in realm + applied via kcadm). **Light/dark/system uniformity:** `lib/theme.ts` mirrors the app theme into a shared `pmagent-theme` cookie; the theme's early `<head>` script applies `.dark` (OS fallback) pre-paint; CSS mirrors the app's light/dark token palette. New `template.ftl` (override of KC 26.0.8 base). Web typecheck green; browser-verified light + dark. Caveats: template pinned to KC 26.0.8; prod cookie-domain two-label heuristic. | — |
| 2026-06-26 | docs | **Social-login setup runbook** — new `references/13-social-login-setup.md`: step-by-step to register Google/Microsoft/GitHub OAuth apps (consent screen, redirect/callback URIs → Keycloak broker endpoints, where to copy client id/secret), apply via `keycloak-init`, + prod/security notes. Linked from the README references index, the Phase 2.8.5 prerequisites, and this tracker. | — |
| 2026-06-26 | P2.8.5 | **Auth UX — in-app OAuth (frontend + IdP plumbing).** `lib/auth.ts` `loginWith(idp)` via `keycloak.login({ idpHint })`; `Landing.tsx` redesigned — Google/Microsoft/GitHub buttons (`ProviderIcons`) + email/password → branded KC page + PMAgent logo + i18n. `keycloak-init` extended: kcadm upsert of google/microsoft/github IdPs from env (skip w/o creds) + disable first-broker "Review Profile" (seamless auto-create); `GOOGLE_/MICROSOFT_/GITHUB_CLIENT_*` added to `.env`/`.env.example` (empty). Email/password = **2.8.5b hybrid**. Web typecheck/build green; `keycloak-init` exit 0. Social round-trip pending user-registered OAuth apps. | — |
| 2026-06-26 | plan | **Phase 2.8.5 (auth UX) drafted.** New `phases/phase-2.8.5-auth-ux.md`: in-app **Google/Microsoft/GitHub** sign-in via Keycloak `idpHint` (no hosted login page; backend unchanged), seamless first-broker auto-create, IdP secrets injected at runtime; email/password kept (open sub-decision: branded KC page vs custom ROPC). Wired into README build-flow + index and this tracker; sits in the Keycloak line before Phase 3. Plan only — **awaiting user go-ahead** to implement. | — |
| 2026-06-26 | P2.8 | **Branding → PMAgent (implemented).** Web: `index.html` title + `favicon.svg`, `en.json` `common.appName`/`invite.title`, Swagger `title` → PMAgent; E2E assertion `/PMAgent/i`. Keycloak **Tier 2**: new `infra/keycloak/themes/pmagent/login` (`theme.properties` + `pmagent.css` + wordmark `logo.svg`), mounted into the KC container via compose; realm `displayName`/`displayNameHtml`=PMAgent + `loginTheme`=pmagent + client display names; applied to the running realm via `kcadm`. Login page verified over HTTP (theme css + logo → 200). Identifiers (`@agentpm/*`, realm/client ids, `agentpm.io`) intentionally unchanged. **35 API tests green** (host), web typecheck + build green. | — |
| 2026-06-26 | plan | **Phase 2.8 (branding → pmagent) drafted.** New `phases/phase-2.8-branding.md`: rename the product's public face from "AgentPM" to **pmagent** across web (title, `app.appName`, invite copy, Swagger) + the Keycloak sign-in (`realm-agentpm.json` displayName) — **display only**; identifiers (`@agentpm/*`, realm/client ids, `agentpm.io`) explicitly out of scope. Wired into README build-flow + index and this tracker; sequenced before Phase 3. Plan only, not implemented. | — |
| 2026-06-26 | plan | **Phase renumber + index refresh:** `2F` → **Phase 2.1** (renamed `phase-2.1-gap-closure.md`; it patches Phase 2, so it sits right after it) + marked ✅ COMPLETE (file previously still read draft/not-started). **Phase 2.7** kept parked but resequenced into the **Phase 5** agent block — folded A2/A3/A4 into Phase 5's deliverables and removed the floating 2.7 section that sat between 2.6 and Phase 3. Refreshed `agentpm-plan/README.md` build-flow + phases index (added 2.1/2.6/2.7, previously missing). Docs only, no code. | — |
| 2026-06-25 | P2.6 | **Two-user realtime verification** (2nd user in incognito Chrome): ✅ **E1** presence avatar appears when both view EMPL-1; ✅ **B1** ghost-drag card shows while the other user drags; ✅ **E3** multiple changes by the other user group into one "N updates" row in the watcher's bell. Confirms the ephemeral WS relay works cross-session. | — |
| 2026-06-25 | P2.6 | **Browser verification (Slices 4–6) in Chrome:** ✅ G2 theme `t` (light→dark), G2 accent (green preset → `--primary` recolor + persist + Reset), C2 AC checkboxes (1/3→2/3 toggle persisted), F2 drag EMPL-5 → Sprint 1 (2→3 tickets), F1 burndown (ideal+actual on completed sprints); no WS console errors. **Deferred:** E1/B1/E3 (since two-user verified ↑), B3 mobile, B5/H2 (specific data) — build/test-verified. | — |
| 2026-06-25 | P2.6 | **Slice 6 (backend, G2/F1) — finishes non-agent 2.6.** G2: migration `20260625000000_org_accent` (Organization.accentColor, applied via `docker compose exec api … prisma migrate deploy` + generate, host+container); PATCH `/orgs/:slug` accepts accentColor; `lib/accent.ts` hex→HSL → `--primary`/`--ring` in Layout (org-scoped, cleared off); `lib/theme.ts` light/dark/system tristate (live OS follow) + `t` shortcut + sun/moon/monitor toggle; accent picker on Members. F1: `GET /sprints/:id/burndown` reconstructs remaining-work/day from STATUS_CHANGED→DONE activity (points or ticket count) vs ideal; `BurndownSparkline` SVG on active/completed sprints. +i18n. **35 API tests green**; typecheck/build green. | 3be46e4 |
| 2026-06-25 | P2.6 | **Slice 5 (realtime, E1/B1):** ephemeral WS relays. shared-types +`ticket.presence`/`ticket.drag`. ws-server: post-auth handles `ticket.viewing` (tracks `socketTicket`, broadcasts `ticket.presence{byTicket}`) and `ticket.drag` (relays w/ sender `actorId`); close clears + re-broadcasts. websocket.ts hook returns `{send}`. Board sends viewing on drawer open/close + drag on start/over/end; renders pulsing viewer avatars (E1) on card + drawer header and faint ghost cards (B1) in target column. API **35 tests green** (no WS regression); typecheck+build green. Browser-verify pending (two sessions + re-login). | 2fc0ac2 |
| 2026-06-25 | P2.6 | **Slice 4 (frontend, C2/E3/B3/F2):** C2 `lib/checklist.ts` parse/toggle — AC `- [ ]` lines render as interactive checkboxes (toggle rewrites AC text via patch) + N/total; E3 NotificationBell groups by ticket ("N updates", per-group unread dot, "N unread since you last looked" header, group-click marks all read); B3 TicketCard touch swipe → next/prev status (composes with dnd touch listener, swipedRef suppresses click); F2 Sprints page DndContext — draggable `TicketChip`, droppable `BacklogZone` + sprint cards → add/removeFromSprint. +i18n. typecheck+build green; **browser-verify pending re-login** (KC token expired). Also parked agent-first A2–A4 → Phase 2.7 (commit 1043152). | 3998063 |
| 2026-06-25 | P2.6 | **Slice 3 (delight grab-bag, 7 items):** B2 `WIP_LIMITS` + amber motion-safe pulse on count badge; B5 `staleBorderClass` left-border time-decay; C1 third "Story" drawer tab merging comments+activity chronologically; C3 slash commands in comment box (`/status /assign /sprint /due /label` → `patch`, else posts as comment) + `/`-triggered command menu; F3 sprint capacity bar (committed pts vs last velocity, amber overcommit); H1 guided empty-board starter (create in Backlog → open drawer); H2 team-of-one invite nudge on Members. +i18n. **Browser-verified:** C3 `/status done` moved EMPL-4→Done, C1 story tab, B2 N/limit badges, H1 starter card. typecheck+build green. _(Note: long verify session expired the KC token at the end — re-login needed; not a code issue.)_ | 8d6bca3 |
| 2026-06-25 | P2.6 | **Slice 2 (palette power, D1/D2/D3):** CommandPalette rewrite with cmdk sub-pages — open-ticket actions (status/assign/sprint/label via `patchOpen`→updateTicket+invalidate+toast+close; Backspace-on-empty steps back) + global theme toggle (D1). `lib/frecency.ts` localStorage count+recency score; Board records ticket/project visits; palette "Recent" group when query empty (D2). `lib/parseQuickCreate.ts` parses `Title !high @user #sprint` → priority/assignee/sprint, unresolved tokens kept in title; create item shows parsed badges (D3). +palette.* i18n. **Browser-verified:** D3 created EMPL-4 w/ HIGH/Adish/Sprint2; D1 status→In Progress patched+closed; D2 Recent showed EMPL-4. typecheck+build green. | c8981d1 |
| 2026-06-25 | P2.6 | **Slice 1 browser-verified** in Chrome vs live stack: A1 ring 1/3→2/3 on save + goal/constraints editable; E2 Undo reverts (LOW→Undo→HIGH, confirmed via DOM observer); G1 confetti canvas injected on →DONE; G4 `?` overlay opens; C4 "18h ago" + exact hover `title`; B4 focus dims non-mine cards. G3 build-verified (load <1s). Also confirmed 2.1 C9 silent-SSO restores session on a fresh tab. Fixed a Vite stale-transform crash (`cn` undefined) by restarting the web container. _(no code change beyond Slice 1)_ | 2a56e74 |
| 2026-06-25 | P2.6 | **Slice 1 (7 quick wins, web-only):** A1 `ReadinessRing` (card + drawer) over goal/AC/constraints + drawer now edits goal/constraints (new "Spec" block); E2 toast→Undo — `applyMove` narrates + offers undo on column change only (silent on reorder), drawer `patch` builds `inverseInput` for undo; G1 `lib/confetti.ts` dependency-free canvas burst on move→DONE (board + drawer), no-op under reduced-motion; G3 `BoardSkeleton` mirrors real columns/cards; G4 `KeyboardHelp` radix-dialog overlay on `?`; C4 `lib/time.ts` + `RelativeTime` in drawer comments/activity + notification bell; B4 focus mode (`f` key + header toggle) dims non-mine cards via `focusUserId` thread. +`goal`/`constraints` on web `UpdateTicketInput`; i18n strings added. typecheck + build green; browser-verified. | 2a56e74 |
| 2026-06-24 | P2.5 | Stage 2.5B (i18n): `react-i18next` + `i18next-browser-languagedetector` + `lib/i18n.ts`; `locales/en.json` baseline; **externalized every UI string** across Landing/Layout/Dashboard/OrgProjects/Members/InviteAccept/Board/Column/TicketCard/TicketDrawer/Sprints/NotificationBell (incl. toasts, placeholders, empty states); localStorage persistence. Rebuilt web container for new deps. typecheck/build green. | 72b5ca6 |
| 2026-06-24 | P2.5 | Stage 2.5E (a11y + Playwright): a11y — ticket cards keyboard-activatable (Enter/Space) + focus ring + `aria-label`, bell `aria-label`, radix dialogs already trap/restore focus. Playwright scaffold — `playwright.config.ts`, `e2e/global-setup.ts` (KC UI login → storageState; SPA check-sso restores from cookie), `e2e/core-flow.spec.ts` (org→project→add/open ticket→comment + optional cross-user mention via password-grant API), `test:e2e` script, `.gitignore`. Runs locally (needs `playwright install` + seeded user + stack); **not executed in sandbox**. typecheck/build green. | 7cb3585 |
| 2026-06-24 | P2.5 | Stage 2.5D (Cmd-K): `cmdk` + `components/ui/command.tsx`; `CommandPalette` (⌘/Ctrl-K) mounted in Layout — quick-create ticket from the query, jump to ticket by #/title, switch project/org; context derived from URL. typecheck/build green. (Docker deps-layer cache wouldn't rebust for the new dep amid a Docker Hub DNS blip → installed cmdk into the running container to verify; committed lockfile bakes it in on next clean image build.) | 8d6ed00 |
| 2026-06-24 | P2.5 | Stage 2.5C (mobile): board `snap-x` scroll + columns `w-[85vw]` (sm:w-72); dnd sensors → Mouse(5px)+Touch(long-press 220ms, so swipe still scrolls)+Keyboard(a11y reorder); removed `touch-none` on cards; Layout header hides email under `sm`. typecheck/build green. | c55805c |
| 2026-06-24 | P2.5 | Stage 2.5A (dark mode): tailwind `darkMode:'class'` + `.dark` CSS-var palette; `theme.ts` (localStorage + `prefers-color-scheme`, applied pre-render); sun/moon toggle in Layout; sonner Toaster `theme=system`; retrofit Landing/Dashboard/OrgProjects hard-coded light colors → tokens. typecheck/build green. | f29497f |
| 2026-06-24 | P2.1 | Stage 2.1 (gap closure, all 11): **A** — sprint picker in drawer, per-card status menu (hover ⋯), delete-ticket in drawer, board search/filter/sort bar, **Members & invites page** (add-by-email + create/copy/revoke invite links), sprint↔tickets on Sprints page + move-between-sprints. **B** — labels: `routes/labels.ts` CRUD (org-scoped) + assignment via `PATCH /tickets/:id` `labelIds` (replace-set, cross-scope guard) + drawer picker; @mention picker (editor shows `@Name`, sends `@[uuid]`). **C** — Keycloak `check-sso` + `public/silent-check-sso.html` (refresh keeps session); within-column reorder (`useSortable`/`SortableContext`, fractional `positionBetween`); drawer optimistic updates. +2 API tests (label assign/cross-scope, body-less DELETE). **35 API tests** + typecheck/build green. Browser-verify pending (C9 cookies, C10 reorder feel, mention→notify). | 3db2df1 |
| 2026-06-24 | P2 fix | Body-less requests 400'd (`Body cannot be empty when content-type is application/json`) — broke DELETE watcher / delete ticket / remove-from-sprint and body-less POSTs (start/complete sprint, mark-read). Fix: web `request()` omits `Content-Type` when there's no body; api adds a tolerant `application/json` parser (empty → undefined). +1 regression test (DELETE watcher w/ json content-type → 204). 34 tests green. | 3db2df1 |
| 2026-06-24 | plan | Phase 2.1 (then "2F") gap-closure draft: 11 gaps between the Phase-2 plan (drawer/board/UX/DoD) and 2A–2E, found in in-browser verification; grouped A (UI over existing APIs) / B (new backend) / C (polish), with approach + effort per item. | f37a9e9 |
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
