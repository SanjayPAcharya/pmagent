# Phase 2.1 — Gap closure

> **Status: ✅ COMPLETE** — all 11 items shipped & committed (`3db2df1`, 2026-06-24); typecheck/build/35 API tests green. Closes the gaps between the [Phase 2 plan](phase-2-pm-core.md) (board/drawer/UX spec + Definition of Done) and what 2A–2E actually shipped. Found during in-browser verification after 2E. Numbered **2.1** because it directly patches Phase 2 (was "2F" historically).
>
> Effort key: **S** ≈ <1h · **M** ≈ 1–3h · **L** ≈ half-day+. Each item lists where it lives and whether the backend is ready.

## Why 2.1 exists
2E delivered the board, drawer, sprints, bell, and realtime — verified working. But a feature-by-feature pass against the plan's drawer spec (lines 415–431), board spec (391–413), frontend-UX section (533–541), and Definition of Done (553–564) surfaced 11 gaps: 6 are pure UI wiring over ready+tested APIs, 2 need new backend, and 3 are polish/pre-existing.

---

## Group A — backend ready, UI wiring only

### A1. Sprint picker in the ticket drawer — **S**
- **Gap:** Plan drawer spec item 9 lists "sprint" in the metadata sidebar; the drawer has no sprint control, so tickets can't be put in a sprint from the UI.
- **Backend:** ready — `updateTicket({ sprintId })` (writes `SPRINT_CHANGED` activity) and `POST/DELETE /api/sprints/:id/tickets`.
- **Approach:** add a Sprint `<DropdownMenu>` in `TicketDrawer.tsx` metadata grid (same pattern as assignee). Fetch options via `api.listSprints(ticket.projectId)`; on select call `updateTicket({ sprintId })`; include an "Unassign" option.
- **Files:** `apps/web/src/components/TicketDrawer.tsx`, `apps/web/src/lib/api.ts` (listSprints exists).

### A2. Per-card JIRA-style status dropdown — **S/M**
- **Gap:** Plan board spec: "JIRA-style quick status change on the card (dropdown) in addition to drag." Card only supports drag + drawer.
- **Backend:** ready — `updateTicketStatus`.
- **Approach:** add a small status control (chip/▸ menu) to `TicketCardBody`. The card is now fully draggable, so the trigger must `stopPropagation` on pointer/click so it neither starts a drag nor opens the drawer. Reuse the optimistic-move logic from the board.
- **Risk:** event-bubbling vs the drag handle — needs care (stopPropagation + `onPointerDown`).
- **Files:** `apps/web/src/components/board/TicketCard.tsx`, `Board.tsx` (lift a `changeStatus(id,status)` handler).

### A3. Delete / archive ticket from the drawer — **S**
- **Gap:** DoD: "create/**edit/delete** tickets." `deleteTicket` (soft-delete) is built + tested; no UI entry point.
- **Backend:** ready — `DELETE /api/tickets/:id` (sets `archivedAt`).
- **Approach:** "Delete" button in the drawer footer with a confirm step → `api.deleteTicket` → close drawer + invalidate board. Toast.
- **Files:** `TicketDrawer.tsx`, `Board.tsx`.

### A4. Search / filter / sort bar on the board — **M**
- **Gap:** DoD: "Search/filter/sort works on the board & list." API supports `q`, `status`, `priority`, `type`, `assignedToId`, `labelId`, `sprintId`, `sort`; the board has zero controls.
- **Backend:** ready — `listTickets(projectId, params)`.
- **Approach:** a filter row above the columns: text `q`, and dropdowns for priority/type/assignee/sprint + a sort selector. Hold filter state, pass into the tickets query key + params; grouping by column is unchanged. Debounce `q`.
- **Files:** `Board.tsx` (+ maybe a `BoardFilters.tsx`).

### A5. Invite-member UI (generate link + manage) — **M**
- **Gap:** DoD: "Org invite link → accept adds a member." The **accept** page exists; nothing **creates** an invite. `createInvite`/`listInvites`/revoke are wired in the client but unused.
- **Backend:** ready — `POST/GET/DELETE /api/orgs/:slug/invites`.
- **Approach:** a **Members & Invites** view (new `/orgs/:slug/members` page, linked from `OrgProjects`): list members (`api.listMembers`), "Invite" → `createInvite` → show + copy the `/invite/:token` link, list pending invites with revoke. (Add `listInvites`/`revokeInvite` to the API client.)
- **Files:** new `apps/web/src/pages/Members.tsx`, `App.tsx` route, `OrgProjects.tsx` link, `lib/api.ts`.

### A6. Sprint ↔ tickets on the Sprints page — **M**
- **Gap:** Sprints page shows only a completion bar; can't see or manage a sprint's tickets.
- **Backend:** ready — `getSprint` returns `{ sprint, tickets, counts }`; `addToSprint`/`removeFromSprint`.
- **Approach:** make each `SprintRow` expandable to list its tickets (remove ✕ each); an "Add tickets" picker pulls backlog/unassigned tickets (`listTickets`) → `addToSprint`. (A1 covers the per-ticket path; this is the sprint-centric view.)
- **Files:** `apps/web/src/pages/Sprints.tsx`.

---

## Group B — needs new backend + UI

### B7. Labels: CRUD API + assignment UI — **L**
- **Gap:** Cards render label chips and the list endpoint filters by `labelId`, but there is **no label API** (create/list) and no way to assign labels to a ticket from the UI. `updateTicket` doesn't accept `labelIds` (only create does).
- **Backend (new):** `POST /api/labels` (org-scoped, ADMIN+? or MEMBER), `GET /api/labels?orgId=`, `DELETE /api/labels/:id`; and ticket label assignment — either extend `updateTicket` to accept `labelIds` (replace set) or add `POST/DELETE /api/tickets/:id/labels`. Cross-scope guard: label.orgId === ticket org (helper already exists). + tests.
- **UI:** a label multi-select in the drawer (create-on-the-fly with color), chips on the card already render.
- **Files:** new `apps/api/src/routes/labels.ts`, `tickets.service.ts` (label set on update), `TicketDrawer.tsx`, `lib/api.ts`, tests.

### B8. @mention member picker — **M**
- **Gap:** Server resolves `@[uuid]` mentions into notifications (tested), but the comment box only has a manual placeholder — no picker, and mentions don't render as names.
- **Backend:** ready — mention parse + org-bounded notify.
- **Approach:** in the comment `Textarea`, detect a trailing `@`, show an org-member autocomplete (`api.listMembers`), insert the `@[uuid]` token on select. On render, replace `@[uuid]` with `@Name` before markdown. Consider a friendlier stored token later.
- **Files:** `TicketDrawer.tsx`, `lib/markdown.ts` (mention render), maybe a small `MentionInput`.

---

## Group C — polish / pre-existing

### C9. Hard-refresh drops to Landing (Keycloak `check-sso`) — **M, risk**
- **Gap:** A full page reload shows the Landing page until you click Sign in; the SSO session isn't silently restored. (Pre-existing Phase-1 auth config, surfaced by deep-link reloads in 2E.)
- **Approach:** `keycloak.init({ onLoad: 'check-sso', silentCheckSsoRedirectUri: origin + '/silent-check-sso.html', pkceMethod: 'S256' })` + add `apps/web/public/silent-check-sso.html`; ensure the KC client's web origins/redirects allow it. **Test carefully** — auth-init changes can break login.
- **Files:** `apps/web/src/main.tsx`, `apps/web/public/silent-check-sso.html`, possibly `realm-agentpm.json`.

### C10. Within-column drag reordering — **M**
- **Gap:** Plan says "reordering"; drops currently append to the end of the target column (no precise order between cards).
- **Approach:** switch columns to dnd-kit `SortableContext`; on drop compute a fractional `position` between neighbours → `updateTicket({ position })`. Keep the DragOverlay.
- **Files:** `Board.tsx`, `Column.tsx`, `TicketCard.tsx`.

### C11. Drawer optimistic updates — **S**
- **Gap:** Drawer edits refetch (`invalidate`) instead of updating optimistically; brief lag vs the snappy board drag.
- **Approach:** React Query optimistic updates on the `['ticket', id]` + board caches for status/priority/assignee edits, reconcile on response.
- **Files:** `TicketDrawer.tsx`.

---

## Suggested order (if/when we start)
1. **A1–A6** first — highest value, low risk, backend already green. (≈ one focused session.)
2. **C9** (auth refresh) — quick win, removes a daily annoyance; test login end-to-end.
3. **B7 labels** — the only item needing real backend; do it as its own slice with tests.
4. **B8 mentions**, **C10 reorder**, **C11 optimistic** — polish, can trail or move to Phase 2.5.

## Done-when
- Drawer can set sprint, labels, and delete the ticket; card has a status dropdown; board has working search/filter/sort.
- Members page can invite (copyable link) + revoke; sprints can add/remove tickets.
- Refresh keeps you signed in.
- New backend (labels, label-assignment) covered by API tests; full suite green; verified in-browser.
