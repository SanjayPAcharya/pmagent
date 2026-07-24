# Phase 3.8.7 — Batch 5: features (FEAT-1 · FEAT-2)

> **Status: ✅ DONE (2026-07-24) — FEAT-1 committed; FEAT-2 built & browser-verified.** The two P2 features from the beta doc, after the bug/UX/decision batches. With this, every beta finding is addressed except the deferred DEF-1/2/3 (roadmap). Source: `~/Downloads/PMAgent-Beta-Requirements.pdf` §7 (findings 11, 15).

## FEAT-1 — Inline editing in the List view (finding 11) — ✅ done 2026-07-24

Clicking a cell in the List opened the full drawer even for a one-field change. Now the **high-frequency columns edit in place** — Status, Priority, Assignee, Sprint — mirroring the Sprint-view inline pattern; title/dates/labels still open the drawer.

- `ProjectList.tsx`: `EDITABLE = {status, priority, assignee, sprint}`; those `<td>`s `stopPropagation` so the editor click doesn't open the drawer. Status/Sprint are native `<select>`s, Priority a coloured select-pill, Assignee a `DropdownMenu` (keeps the avatar). Shared `act()` helper runs the mutation → invalidates `['tickets', projectId]` → toasts; WS sync (`useProjectSync`) carries the change to other open views.
- i18n `list.updated`. No API change (reuses `updateTicket` / `updateTicketStatus`).
- **Browser-verified** on Oracle → New: assigned NEW-3 inline (avatar appeared, drawer stayed shut), then restored to unassigned. web 71/71, typecheck + vite build green.

## FEAT-2 — Timeline export: PNG + Excel; extend to other views (finding 15) — ✅ done 2026-07-24

Delivered exactly the plan below. New `lib/ganttExport.ts` (pure `applyGanttVarMap` + `ganttRowsToCsv`, unit-tested; DOM `exportGanttPng` + `readGanttVars`). Two **PNG / CSV** buttons on the Gantt toolbar (disabled when nothing is scheduled/filtered). PNG clones the live `<svg>`, paints a theme-card background, **inlines the 8 CSS vars** the chart uses (`hsl(var(--…))` don't resolve inside a standalone image), and rasterizes at 2×; CSV reuses `downloadCsv` with columns Key/Title/Status/Priority/Assignee/Start/Due/Points/Sprint/Milestone/Workstream. **Browser-verified** on Oracle → New: CSV downloaded with all 8 rows + columns; PNG downloaded as a faithful 4536×800 image (theme colours, bars, dependency arrows, today line, the "tes" milestone diamond). web 71→75 (+4 tests), typecheck + build green. Original plan follows:


The tester called a Timeline download "a must" (PNG + Excel acceptable). CSV export already exists for board/list.

- **PNG:** render the current Gantt SVG (with milestone diamonds, current zoom/filter) to a PNG the user can download. Approach: serialize the `<svg>`, draw onto a `<canvas>`, `toDataURL('image/png')`, trigger download — no external lib, CSP-safe.
- **Excel-compatible:** export the timeline rows (key, title, status, assignee, start, due, sprint, milestone) as an `.xlsx` or CSV. Prefer reusing the existing CSV machinery (`CsvTools`) if it fits; only reach for a lib if xlsx is required.
- **Discoverable** from the Timeline toolbar. Extend downloads to other views where cheap.
- **Acceptance:** Timeline downloads as a PNG reflecting current zoom/filter incl. milestone diamonds; timeline data exports to an Excel-compatible file; export controls are discoverable from the view.

## Out of scope
DEF-1/2/3 (dependency types, integrations, AI standup) — roadmap.

## Conventions (same as 3.8.6)
One step = one commit; i18n via `t()`. After any `apps/api/src` edit: `docker compose restart api`. Keep suites green.
