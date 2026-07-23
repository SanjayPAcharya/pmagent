# Phase 3.8.5 — Milestones v2 (P1)

> **Status: ✅ DONE (2026-07-24) — browser-verified & committed on `dev` (not yet pushed).** All steps M0–M7 implemented; api 119→**122**, web **71/71**, both typechecks + vite build green; migration applied + client regenerated in the api container. Browser-verified live on Oracle → New (link → progress 1/1 on chip + Overview → expandable linked-ticket detail → unlinked to restore). Owner reviewed after the smoke test and committed. The single highest-leverage item from the beta feedback (requirements **MS-1…4**, the durable fix behind 3.8.4 **B6 / BUG-2**). Today a milestone is only a name + date; nothing links tickets to it, and "readiness" is computed against a moving date window (which the tester read as data corruption). v2 makes milestones **first-class**: tickets link to at most one milestone, progress is derived from those linked tickets, and the number is always explainable by inspection.

## Scope (from `~/Downloads/PMAgent-Beta-Requirements.pdf` §6)

- **MS-1** — Link tickets to milestones. A ticket belongs to **at most one** milestone of its project (owner Q answered in the doc: one-per-ticket is correct). Linkable from the ticket drawer (a Milestone field) and in bulk from the List. A milestone's detail lists its linked tickets.
- **MS-2** — Progress from linked tickets. Replace the date-window `milestoneReadiness` with **done / total over linked tickets only**. Creating/re-dating other milestones never changes a milestone's own progress. No linked tickets ⇒ "No tickets linked yet", never "0/0".
- **MS-3** — Diamonds on the Timeline already render (3.7 R7 + 3.8.4 B2); add **progress on hover** and distinct **overdue-and-incomplete** styling. (Diamond + strip already exist — this is an enrichment, not new rendering.)
- **MS-4** — Milestone detail on demand. From Overview (and the Timeline chip), open a milestone to see its linked tickets with status + assignee; the progress figure always matches the visible list.

**Out of scope:** ticket-to-ticket dependencies with FS/SS/FF/SF types (DEF-1). Non-goal per the doc.

## Design decisions

- **Data model:** `Ticket.milestoneId String?` (nullable, `onDelete: SetNull` — deleting a milestone unlinks its tickets, never deletes them). One-per-ticket ⇒ a scalar FK, not a join table.
- **Progress semantics:** `total` = non-archived, non-CANCELLED tickets linked to the milestone; `done` = those in status DONE. This is what `milestoneReadiness` now returns (name kept; internals swapped from date-window to `milestoneId` grouping), so Overview + Reports pick up the new meaning with no call-site change. The B6 copy ("N of M tickets done") becomes literally true.
- **No new activity type:** milestone (un)link is not logged to the ticket activity feed in v1 (would need a `TicketActivityType` enum migration; not asked for). Revisit if wanted.

## Steps

- [x] **M0 — schema + migration.** `Ticket.milestoneId` + relation (`onDelete: SetNull`) + `@@index([milestoneId])`; `Milestone.tickets Ticket[]`. Migration `20260723120000_milestone_links` applied in the api container; client regenerated + api restarted.
- [x] **M1 — link API.** `milestoneId` on create/update/batch schemas + service inputs + `assertMilestoneInProject`; `milestone {id,name,date,done}` added to `ticketInclude` so the serialized ticket carries `milestoneId` + relation. Bulk-assign via the existing batch route.
- [x] **M2 — progress API.** Rewrote `milestoneReadiness` to group linked tickets by `milestoneId` (stable against other milestones). `progress {done,total}` added to the milestones list response and the gantt milestone payload (`GanttMilestone`). New `GET /:projectId/milestones/:milestoneId` → milestone + linked tickets (id, number, key, title, status, assignee) + progress.
- [x] **M3 — drawer link (MS-1).** Milestone selector in `TicketDrawer` (mirrors the sprint dropdown) + `/milestone name·none` slash command. `changeMilestone` invalidates `['milestones']`, `['overview']`, `['gantt']`.
- [x] **M4 — overview progress + detail (MS-2/MS-4).** Milestone card shows linked-ticket progress + "No tickets linked yet" empty state; a chevron expands the row to its linked tickets (status dot + key + title + assignee avatar) via `MilestoneLinkedTickets` (`getMilestone`). B6 copy reworded from date-window to linked-ticket meaning.
- [x] **M5 — list bulk assign (MS-1).** "Milestone" dropdown in `BulkBar` (fetches milestones itself, so Board + List both get it); bulk apply also refreshes overview/gantt/milestones.
- [x] **M6 — timeline enrich (MS-3).** Diamond `<title>` + chip show progress; overdue-and-incomplete milestones render in the destructive token (chip border + diamond).
- [x] **M7 — tests + close-out.** API (milestones.test.ts +3): progress from linked tickets stable when another milestone is added; detail list matches progress; SetNull on delete; cross-project link rejected. Updated the two tests that asserted the old date-window readiness (overview, sprints) to link tickets instead. No web unit test added (no page-route harness — same call as B1/U1/U3; verified by typecheck/build + owner browser check). `PROGRESS.md` + `FEATURES.md` updated.

## Conventions (same as 3.8.4)
- One step = one commit (owner commits this phase themselves — Claude leaves it staged/uncommitted for review). i18n via `t()` only. After any `apps/api/src` edit: `docker compose restart api`. After a schema change: `docker compose exec api pnpm --filter @agentpm/api exec prisma generate && docker compose restart api`. Keep all suites green.
