# Phase 3.1 — PM Depth: search, views, relationships, bulk

> **Status: 🔨 IN PROGRESS** (started 2026-07-02, on `dev`). Step 1 (backend) shipped. Makes the PM core feel complete for daily use before any complex/agent work: find anything fast, see work your way, express how tickets relate, act on many at once.
>
> Effort: **S** ≈ <1h · **M** ≈ 1–3h · **L** ≈ half-day+.

## Why 3.1 exists
Phases 3.1–3.5 are the "feature-rich & simple" track: high-value, low-complexity product depth that slots **between** Phase 3 (deployed MVP) and Phase 4+ (channels, agents). Nothing here needs new infrastructure or third-party services.

## Build order (each step = one commit)
1. ✅ **Backend** — `relations.service.ts` (parent/subtasks/blockedBy/blocks, cycle guards), `blockedBy` count on list responses, `PATCH parentId`, `POST /tickets/batch`, `GET /api/search`, `GET /api/me/work`. Tests in `pm-depth.test.ts` (44/44).
2. ✅ **List/table view** — `/orgs/:slug/projects/:projectSlug/list`; filter bar + sortable columns; board⇄list toggle persisted; rows open the ticket drawer.
3. ✅ **Relationships panel** in `TicketDrawer` — parent picker, subtasks, blocked-by/blocks add/remove, links between tickets.
4. ✅ **Blocked badges** — red badge on `TicketCard` + list rows when `blockedBy > 0`.
5. ✅ **Global search in ⌘K + My-work page** — debounced cross-project group in the palette; `/my-work` (assigned vs watching) + rail entry.
6. **Bulk actions** — multi-select on board/list + floating action bar (status/assign/sprint/label/archive) via `batchUpdateTickets`. — **L**

## Endpoints (shipped in step 1)
`GET /tickets/:id/relations` · `POST/DELETE /tickets/:id/dependencies[/:dependsOnId]` · `POST /tickets/batch` · `GET /api/search?q=` · `GET /api/me/work` · list responses now carry `blockedBy`.
