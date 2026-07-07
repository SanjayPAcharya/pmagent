# Phase 3.7.3 — Archive & Restore (dedicated archived views)

> **Status: 📋 OPEN** (specced 2026-07-07). Source: owner request — "add a place where archived tickets or projects can be seen, or retrieved." The 3.7.2 P5 verification archived a throwaway ticket that then had **no UI to find or restore it**. Decisions (owner, 2026-07-07): **(1)** do archived tickets *and* add project archiving; **(2)** surface each via a **dedicated Archived page** (not a List toggle).

## Current state (what already exists — do not rebuild)

- **Tickets** are soft-deleted via `Ticket.archivedAt`. `GET /api/tickets` already supports `includeArchived` (returns both). The batch endpoint already **unarchives**: `POST /api/tickets/batch` with `{ archived: false }` clears `archivedAt` (`routes/tickets.ts:453`). Permanent delete = `DELETE /api/tickets/:id`.
- **Projects** are **hard-deleted** — `DELETE /api/projects/:projectId` (`routes/projects.ts:161`) calls `prisma.project.delete`. No `archivedAt` on `Project` yet. This is what Part B adds.
- Project-listing surfaces that must exclude archived (Part B): `routes/projects.ts:101` (list), `routes/search.ts:41` (project search) + `:35` (ticket search via `project`), `routes/organizations.ts:102` (per-org count), `services/stats.service.ts:25` (sidebar stats), and cross-project ticket queries `routes/me.ts:42/50` (my-work).

## Conventions (read once)

- Same as 3.7.2: web = `sourcecode/apps/web` (shadcn-style ui, react-query, react-router v6, i18next; strings via `t()`), api = `sourcecode/apps/api` (Fastify + Zod + Prisma). Apply the [product UI/UX standards](phase-3.7.2-ui-ux-polish.md): shared `EmptyState`, `Loader2` on async buttons, inline two-click confirm (count + 4s reset), `:focus-visible`, `BlockedBadge`/`--destructive` for destructive.
- **Part B touches the schema** → after editing `schema.prisma` + creating the migration, run `docker compose exec api pnpm --filter @agentpm/api exec prisma generate && docker compose restart api` (host generate doesn't reach the container). Restart api after any api source edit (tsx watch misses new files).
- Test baselines: api **77**, web **32**. One step = one local commit that ticks its box here + a `PROGRESS.md` Now/Next + log row (+ `FEATURES.md` for the user-facing A2/B3). **Never `git push`** unless the owner asks.

---

## Part A — Archived tickets (dedicated page + restore)

### - [x] A1 — API: `archivedOnly` list filter (XS) *(done 2026-07-07)*
`routes/tickets.ts` `listQuerySchema` gained `archivedOnly: z.coerce.boolean().optional()`; the list handler now does `if (q.archivedOnly) where.archivedAt = { not: null }` else `if (!q.includeArchived) where.archivedAt = null`. Test lives in a **new `src/test/archive.test.ts`** (create + archive + `archivedOnly` returns only it, default hides it, batch restore clears it) — *not* appended to `tickets.test.ts`, which has a latent within-file ordering fragility that a new `it` there tripped (the route change alone is clean; a dedicated file is the right home for B2's project-archive tests anyway). **api 77 → 78**, typecheck green.

### - [x] A2 — Web: dedicated archived-tickets page + restore (M) *(done 2026-07-07)*
**Scope grew:** the plan assumed `api.deleteTicket` hard-deletes, but `DELETE /api/tickets/:id` is itself the **soft-delete** (sets `archivedAt`) — so "Delete permanently" needed a real endpoint. Added `DELETE /api/tickets/:ticketId/permanent` (ADMIN → `prisma.ticket.delete`; relations cascade, subtasks `SetNull`) + web `api.deleteTicketPermanent` + a test (**api 78 → 79**). Page/route/link/i18n as specced. Browser-verified: RELA-5 (accidentally archived by the P5 test automation) **restored** to the board; RELA-6 throwaway **permanently deleted** (two-click confirm); RELA-4 (owner's genuine archived ticket) untouched.

- New route `/orgs/:slug/projects/:projectSlug/archived` (register in the router next to `/list`). Reuse the List page's data shape: `api.listTickets(projectId, { archivedOnly: 'true' })`.
- Rows show key + title + archived-relative-time; each row has **Restore** (`api.batchUpdateTickets([id], { archived: false })`) and **Delete permanently** (`api.deleteTicket(id)`, inline two-click confirm). Toast + invalidate `['tickets', projectId]` + the archived query on success. `Loader2` while busy.
- Empty → shared `EmptyState` (icon `Archive`, message `archived.emptyTickets`).
- Discovery: an **"Archived"** link/button in the project List toolbar (near Board/List/Columns) → navigates to the page. Also a back link to the List.
- i18n under a new `archived` namespace (`archived.ticketsTitle`, `archived.restore`, `archived.deleteForever`, `archived.deleteConfirm`, `archived.restored`, `archived.deleted`, `archived.emptyTickets`, `archived.backToList`). FEATURES gets a sentence.

---

## Part B — Project archiving (soft-delete + restore + view)

### - [x] B1 — Schema: `Project.archivedAt` + migration (S) *(done 2026-07-07)*
`model Project` gained `archivedAt DateTime?` + `@@index([orgId, archivedAt])`. Migration `20260707034922_project_archive` (additive nullable column + index) created & applied to the dev DB; client regenerated on host **and** in the api container + restart. api 79/79 unchanged.

### - [x] B2 — API: archive/restore + exclude archived everywhere (M) *(done 2026-07-07)*
Added `POST /api/projects/:id/archive` + `/restore` (ADMIN); kept `DELETE /:id` as permanent. List excludes archived by default + `?archivedOnly=true`. Excluded archived projects from: org count (`organizations.ts`), sidebar stats (`stats.service.ts`), project + ticket search (`search.ts`), and my-work (`me.ts` — `memberOf.project.archivedAt: null`). Tests (archive hides from list/count, archivedOnly shows it, restore re-lists, permanent delete removes) → **api 79 → 81**; full suite green (no regressions from the shared-query guards).
- **Archive**: `POST /api/projects/:projectId/archive` (ADMIN) → set `archivedAt = new Date()`. **Restore**: `POST /api/projects/:projectId/restore` (ADMIN) → `archivedAt = null`. Keep `DELETE /:projectId` as **permanent** delete (now used from the archived page).
- **List**: `GET /api/projects` excludes archived by default (`where.archivedAt = null`); add `?archivedOnly=true` → `{ not: null }` (for the archived-projects page).
- **Exclude archived** in: org project count (`organizations.ts:102`), stats (`stats.service.ts:25`), project search (`search.ts:41`), and cross-project ticket queries so archived-project tickets stop surfacing — ticket search (`search.ts:35`, add `project: { archivedAt: null }`) and my-work (`me.ts:42/50`, add `archivedAt: null` on the ticket's `project`). `loadProjectAuthorized` still resolves archived projects by id (so archive/restore/permanent-delete work).
- Tests: archive hides from list + count; `archivedOnly` returns it; restore re-lists it; permanent delete removes it. **api 78 → ~81.**

### - [ ] B3 — Web: archived-projects page + DangerZone → Archive (M)
- New route `/orgs/:slug/archived` — lists archived projects (`api.listProjects(orgId, { archivedOnly:'true' })`) with **Restore** + **Delete permanently** (two-click confirm, still typed-name-gated for delete). `EmptyState` (icon `Archive`). Link from the OrgProjects page header ("Archived projects").
- **DangerZone**: the project Danger Zone changes from permanent delete to **Archive** (recoverable) — new `api.archiveProject`, copy from "Permanently delete…" → "Archive this project — hide it from your workspace; restore it any time from Archived projects." Keep the typed-name confirm. (Org delete stays as-is for now.)
- api client: add `archiveProject`, `restoreProject`, and `archivedOnly` param support on `listProjects`. i18n + FEATURES.

---

## Sequencing & scope notes
- Land **A1 → A2** (ships ticket restore, closes the RELA-6 gap), then **B1 → B2 → B3**.
- **Out of scope:** org archiving (only projects); auto-purge of long-archived items; bulk restore on the archived pages (single-row actions are enough); changing ticket permanent-delete (already exists).
- Archived **projects** keep their rows/tickets in the DB; they're only hidden from listings + cross-project ticket queries. Their direct URLs still resolve (so restore works) — acceptable; not linked anywhere once archived.
