# Phase 3.7.1 — 3.7 gap closure (audit follow-ups)

> **Status: 🟡 OPEN** (opened 2026-07-06). Source: an independent audit of Phase 3.7 on 2026-07-06. Verdict: **the phase core is genuinely done** — every R0–R14 artifact exists and works (api 76/76 · web 31/31 · both typechecks · vite build green), and the one item PROGRESS had flagged "browser check pending" (multi-select Board/List filters) was **browser-verified during the audit** (Board: MEDIUM then +LOW narrowed/restored cards with a "MEDIUM +1" trigger summary; List: LOW left only RELA-1; both cleared cleanly, no data writes). The six steps below are the spec fine-print that was cut or missed. None are regressions.
>
> **This doc is written to be self-contained**: each step names the exact files, line-anchors, code shapes, i18n keys, tests, and done-criteria, so anyone (or any model) can pick up the next unticked step with no other context. When an instruction says "copy the idiom at X", open X first and mirror it — do not invent a new pattern.

## What the audit confirmed sound (do NOT re-audit)

R1 schema + service rules (`ADHOC_SPRINT_CONFLICT`, `DATE_RANGE`, `WORKSTREAM_CHANGED`) · R2 milestone CRUD + WS event · R3 `useProjectSync` (adopted by List/Sprints/Overview/Gantt) · R4 overview endpoint · R5 Overview landing + legacy `/ticket/:n` route + all URL producers · R6 UTC-day gantt math (9 unit tests) · R7 Gantt page (rail, ticks, today line, milestone lane, dependency arrows, tray, truncated banner, ⌘K + tree nav) · R8 drag move/resize/tray/milestone + undo + `pausedRef` guard · R9 quick-add tokens + template hook + inline subtask + card affordance · R10 Beta affordances (grep-clean of AI code) · R11 workstream tabs/drawer/list/bulk/CSV/report split · R12 sprint rows + goal edit + mini-filters · R13 column chooser + resizable widths · R14 readiness card + donut · i18n keys all present · FEATURES.md current.

## Gaps found → steps

| # | Gap | Why it matters | Step |
|---|---|---|---|
| 1 | `startDate` can only be set by Gantt-drag or CSV import — the ticket drawer has **no Start date field** (Due only) | The List's Start column shows "—" for everyone who never opens Timeline; scheduling requires a detour | F1 |
| 2 | **No UI can rename or delete a milestone.** `api.deleteMilestone` (web `src/lib/api.ts:453`) has zero callers; only date (Gantt drag) and done (Overview toggle) are editable | A typo'd or obsolete milestone is stuck forever without curl | F2 |
| 3 | Sprints page: expanded sprint rows render from `['sprint', id]`, but `useProjectSync` only invalidates `['sprints', pid]` + `['tickets', pid]` — **foreign WS events leave expanded rows stale** (R3 said "plus per-sprint detail keys if trivial"; it is trivial) | Two-window live sync silently half-works on the Sprints page | F3 |
| 4 | R9.4 subtask progress chips on board cards — spec'd "optional (cut first)", was cut | Parents give no hint they have children; the review asked for subtask visibility | F4 |
| 5 | R13 listed a "Due(?)" column — never added. The List can show Start but **not Due** | Odd asymmetry; due dates are the older, more-used field | F5 |
| 6 | R7.7 said "below `sm` the rail narrows (key only)" — rail is a fixed 240px (`GanttChart.tsx:26`) | On a 375px phone the rail eats 64% of the viewport | F6 |

---

## How to work this phase (conventions — read once)

- Repo layout: pnpm workspace root is `sourcecode/`; API = `sourcecode/apps/api` (Fastify + Prisma + zod, tests in `src/test/*.test.ts` against a real Postgres), web = `sourcecode/apps/web` (React 18 + Vite + Tailwind + shadcn-style `components/ui/*` + @tanstack/react-query + react-router v6 + i18next; unit tests colocated under vitest+jsdom). **There is no `components/ui/dialog.tsx`** — the primitives are avatar/badge/button/card/command/dropdown-menu/input/label/sheet/skeleton/tabs/textarea. Use inline editing or a dropdown, never invent a modal.
- **One step = one local commit** that also updates: this doc (tick the checkbox), `PROGRESS.md` (Now/Next + a log row), `FEATURES.md` (only for user-facing steps), and `sourcecode/apps/web/src/locales/en.json` for any new UI string (never hardcode English in components — always `t('…')`).
- **Never `git push`** unless the owner asks.
- Dev stack: `docker compose up` from `sourcecode/`. **After ANY change under `apps/api/src`**: `docker compose restart api` (tsx watch inside the container misses macOS file events). No schema changes are needed in this phase — if you think you need one, stop and re-read the step.
- Test commands (baselines at phase open, all green): `pnpm --filter @agentpm/api test` (**76**), `pnpm --filter @agentpm/web test` (**31**), `pnpm --filter @agentpm/api typecheck`, `pnpm --filter @agentpm/web typecheck`, `pnpm --filter @agentpm/web exec vite build`.
- Web conventions: server state via react-query (`['tickets', projectId]`, `['sprints', projectId]`, `['sprint', sprintId]`, `['milestones', projectId]`, `['overview', projectId]`, `['gantt', projectId]`); client fetchers in `src/lib/api.ts`; persistent UI prefs via `useLocalStorageState` (`src/lib/useLocalStorage.ts`); toasts via `sonner`.
- Browser verification: drive the running dev stack at `http://localhost:3000` (a Chrome session is usually already signed in as the owner). Test data lives in the owner's real org (`Oracle` → project `Relationship Manager`, key RELA) — restore anything you change; ask before deleting anything you didn't create.

---

## Steps (tick as they land)

### - [x] F0 — Phase doc (S) *(done 2026-07-06)*
This file + `agentpm-plan/README.md` index row + `PROGRESS.md` Now/Next/log (including closing the 2026-07-05 "browser check pending" note for the multi-select filters — verified during the audit).

---

### - [x] F1 — Start date in the ticket drawer (S) *(done 2026-07-06)*
> Browser-verified on RELA-1: set Start 2026-03-01 (before the Mar 9 due date) in the drawer → List Start column showed `2026-03-01`; cleared it → back to `—`. Data restored. DATE_RANGE guard (start > due) already covered by the API suite.

**Goal:** let users schedule a ticket without opening the Timeline.

**1. `sourcecode/apps/web/src/components/TicketDrawer.tsx`** — in the Details grid there is a Due-date block at ~line 538:
```tsx
<div>
  <Label>{t('drawer.dueDate')}</Label>
  <Input
    type="date"
    defaultValue={ticket.dueDate ? ticket.dueDate.slice(0, 10) : ''}
    onBlur={(e) => {
      const v = e.target.value ? new Date(e.target.value).toISOString() : null
      patch({ dueDate: v })
    }}
    className="mt-1"
  />
</div>
```
Add an identical block **immediately before it** for Start: `Label` = `t('drawer.startDate')`, `defaultValue` from `ticket.startDate`, `onBlur` → `patch({ startDate: v })`. Nothing else — `patch` already handles optimistic update, error toast, and invalidation, and both `Ticket` and `UpdateTicketInput` in `src/lib/api.ts` already carry `startDate` (added in 3.7 R1/R8).

**2. i18n:** `drawer.startDate` = `"Start date"` in `src/locales/en.json` (next to `drawer.dueDate`).

**3. Server behavior to know (already exists, do not re-implement):** if the patch makes `startDate > dueDate`, the API returns 400 `DATE_RANGE` ("startDate must be on or before dueDate") — the drawer surfaces it as an error toast.

**Verify (browser):** open any RELA ticket → set a Start date → List page Start column shows it; set Start after Due → error toast, value not saved; clear the field → back to "—". Restore the ticket to its original dates afterwards.

**Done when:** verification passes; web typecheck + vite build green; FEATURES.md ticket section mentions the Start date field.

---

### - [x] F2 — Milestone manage: rename, re-date, delete (M) *(done 2026-07-06)*
> Browser-verified on Oracle/Relationship Manager: pencil toggles a manage mode listing ALL milestones with editable name + date; renamed "Test Milestone"→"Test Milestone Renamed" and re-dated 15 Aug→20 Aug (both persisted and reflected on the Timeline milestone lane via the `['gantt']` invalidation); deleted it (admin-gated) → gone. Seeded milestone removed; data restored. **Deviation from plan:** used an **inline two-click confirm** (trash → red "Delete?" → deletes) instead of `window.confirm` — better UX and it doesn't freeze the tab (native `confirm()` wedged the automated browser during testing).

**Goal:** full milestone lifecycle in the UI. The API is 100% ready (3.7 R2): `GET/POST/PATCH` are MEMBER, `DELETE` is ADMIN and returns 204; every mutation already publishes `milestone.updated`. Web client fns all exist in `src/lib/api.ts` (~line 447): `listMilestones`, `createMilestone`, `updateMilestone`, `deleteMilestone`.

**1. `sourcecode/apps/web/src/pages/ProjectOverview.tsx`** — the Milestones card (`overview.milestonesTitle`, ~line 243) currently shows the next-3 open milestones from the overview payload, a done-toggle mutation (~line 104), and an inline add-form (~line 110). Add a **manage mode**:
- Card header: a small `Pencil` icon-button (ghost variant, same sizing as the goal-edit pencil in `Sprints.tsx`) toggling `const [managing, setManaging] = useState(false)`.
- While `managing`, swap the card body's data source to **all** milestones: `useQuery({ queryKey: ['milestones', projectId], queryFn: () => api.listMilestones(projectId!), enabled: managing && Boolean(projectId) })`.
- Each row: name `Input` (defaultValue, onBlur → `api.updateMilestone(projectId, m.id, { name })` when changed) · date `Input type="date"` (onBlur → `{ date: new Date(v).toISOString() }`) · the existing done-toggle · a `Trash2` icon-button.
- Delete: `window.confirm(t('overview.milestoneDeleteConfirm'))` → `api.deleteMilestone(projectId, m.id)`. **Gate the trash button by the admin idiom** from `ProjectSettings.tsx:23`: `const isAdmin = org.data?.org.role === 'OWNER' || org.data?.org.role === 'ADMIN'` — hide it for plain members (the server 403s regardless; this just avoids a dead button).
- After ANY mutation: invalidate `['milestones', projectId]`, `['overview', projectId]`, `['gantt', projectId]` — the Gantt milestone lane must follow renames/deletes.

**2. i18n:** `overview.manageMilestones` ("Manage milestones"), `overview.milestoneDeleteConfirm` ("Delete this milestone? Tickets are not affected."), `overview.milestoneSaved`, `overview.milestoneDeleted`.

**Verify (browser):** create a throwaway milestone via the existing inline add → enter manage mode → rename it, move its date, confirm the Timeline lane reflects both → delete it → lane is clean. Confirm nothing else in the owner's data changed.

**Done when:** verification passes; typecheck + build green; FEATURES.md Overview section gains one sentence on managing milestones.

---

### - [x] F3 — Live-sync the expanded sprint detail (XS) *(done 2026-07-06)*
> Browser + Redis-verified: with Oracle Sprint 1 expanded, published a foreign-actor `sprint.updated` to `agentpm:events` → a `GET /api/sprints/9436b20b-…` (the `['sprint', id]` detail) refetched, which only the new `['sprint']` prefix triggers (the sprints-list invalidation hits a different endpoint). No data written.

**Goal:** finish 3.7 R3's "plus per-sprint detail keys if trivial" — it is trivial.

**The bug:** `Sprints.tsx:75` renders each expanded sprint from `useQuery({ queryKey: ['sprint', sprint.id], … })`, but the sync hook at `Sprints.tsx:324` only invalidates `['sprints', projectId]` and `['tickets', projectId]`. Local mutations invalidate the detail keys by hand (`:339`, `:374`) — **foreign WS events never do**, so another user's move doesn't appear in an expanded sprint until you touch something.

**The fix (one line):** react-query invalidation matches by key **prefix**, so add the bare prefix:
```ts
useProjectSync(projectId, [['sprints', projectId], ['tickets', projectId], ['sprint']])
```
`['sprint']` matches every `['sprint', id]`. Do not enumerate ids — the enumerating pattern at `:339` is for local mutations and would go stale here.

**Verify:** two browser windows on the same project (or the Redis trick from the 3.7 R3 note: Keycloak shares one session per profile, so instead publish a `ticket.updated` event with a **foreign** `actorId` to the `agentpm:events` Redis channel). Window B has a sprint expanded; window A moves a ticket into that sprint → B's expanded rows update within ~1s without focus.

**Done when:** verification passes; web typecheck green.

---

### - [x] F4 — Subtask progress chips on board cards (M) *(3.7 R9.4, was cut)* *(done 2026-07-06)*
> API integration-tested: list response gives a parent `subtasks: { done: 1, total: 2 }` with one child DONE, one CANCELLED (excluded), and a childless ticket has no `subtasks` key (api 77/77). Chip JSX mirrors the working blocked-chip. **Visual chip screenshot pending** — the Keycloak session expired mid-verification and re-login needs the owner (can't authenticate on their behalf).

**Goal:** parents show "1/3" so subtask work is visible from the board.

**1. API — `sourcecode/apps/api/src/services/relations.service.ts`:** next to `blockedByCounts`, add and export:
```ts
export async function subtaskCounts(parentIds: string[]): Promise<Map<string, { done: number; total: number }>> {
  // groupBy [parentId, status]; total = non-archived, non-CANCELLED children
  // (same semantics as milestoneReadiness); done = status DONE.
}
```
Implement with one `prisma.ticket.groupBy({ by: ['parentId', 'status'], _count: true, where: { parentId: { in: parentIds }, archivedAt: null, status: { not: 'CANCELLED' } } })` and fold into the map.

**2. API — `sourcecode/apps/api/src/routes/tickets.ts`** list handler (`r.get('/')`, ~line 180): it already does `const blocked = await blockedByCounts(items.map((t) => t.id))` and spreads `blockedBy` into each item (~line 209). Mirror that exactly: `const subs = await subtaskCounts(items.map((t) => t.id))`, then spread `subtasks: subs.get(t.id)` (leave it `undefined` when the ticket has no children — do NOT emit `{done:0,total:0}`).

**3. Web:** `Ticket` interface in `src/lib/api.ts` gains `subtasks?: { done: number; total: number }`. In `src/components/board/TicketCard.tsx`, next to the existing blocked-count chip, render a muted chip when `ticket.subtasks` is set: `ListTodo` icon (lucide) + `{done}/{total}`, with `title={t('board.subtasksTooltip', { done, total })}`.

**4. i18n:** `board.subtasksTooltip` = `"{{done}} of {{total}} subtasks done"`.

**5. Test — extend `sourcecode/apps/api/src/test/tickets.test.ts`:** create a parent + 2 subtasks (`parentId` on create), mark one DONE → list response item for the parent has `subtasks: { done: 1, total: 2 }`; a childless ticket has no `subtasks` key; a CANCELLED subtask drops out of `total`.

**Done when:** api suite green (76 + new); chip renders on a board card with children; `docker compose restart api` done; typecheck + build green; FEATURES.md board section updated.

---

### - [x] F5 — Due column in the List chooser (S) *(3.7 R13's "Due(?)")* *(done 2026-07-06)*
> Added `'due'` to the `ProjectList` column model (ColId/COL_ORDER/TOGGLEABLE/DEFAULT_VISIBLE off/DEFAULT_WIDTHS/COL_LABEL + a `renderCell` case mirroring `start`), i18n `list.colDue`. Chooser/colgroup/colSpan/resize all derive from the model — no other edits; CSV export already carried Due. Typecheck + build green; visual toggle check deferred with the others to the owner's re-login.

**Goal:** the List can show Due like it shows Start.

**`sourcecode/apps/web/src/pages/ProjectList.tsx`** is column-driven since R13 — every change is local to the column model:
- `ColId` union + `COL_ORDER` (~line 34): add `'due'` between `'start'` and `'points'`.
- `DEFAULT_VISIBLE`: `due: false` (keeps current layouts stable); `DEFAULT_WIDTHS`: same width as `start`.
- `renderHeader`: label `t('list.colDue')`; not sortable (match `start`).
- `renderCell`: format `ticket.dueDate` **exactly like the Start cell** ("—" when null).
- The chooser dropdown, `<colgroup>`, colSpan math, and resize handles all derive from the column model — no other edits. CSV export is untouched (it already exports a Due column — `CsvTools.tsx:127`).

**i18n:** `list.colDue` = `"Due"`.

**Verify (browser):** Columns → enable Due → dates render; reload persists; disable again to restore the owner's prefs.

**Done when:** verification passes; web typecheck green.

---

### - [ ] F6 — Gantt rail narrows on mobile (S) *(3.7 R7.7, missed)*

**Goal:** below `sm` (640px) the left rail shows the mono key only, ~88px wide.

**1. `sourcecode/apps/web/src/pages/ProjectGantt.tsx`** already tracks the breakpoint — `window.matchMedia('(min-width: 640px)')` at line 28 feeds the flag that gates dragging (R8). Reuse **that same state** (do not add a second listener) and pass it down: `<GanttChart … narrow={!isDesktopFlag}>` (read the file for the flag's actual name).

**2. `sourcecode/apps/web/src/components/gantt/GanttChart.tsx`:** `RAIL_W = 240` (line 26) becomes a function of the new `narrow?: boolean` prop: `const railW = narrow ? 88 : 240` — replace every `RAIL_W` use (rail container width and any layout math). In the rail rows (~line 177), hide the truncated-title span when `narrow` (keep the mono key; keep the click-through to the drawer).

**Verify (browser):** devtools responsive mode at 375px → rail is key-only and the timeline pane gets the space; ≥640px unchanged; row alignment between rail and SVG stays exact in both.

**Done when:** verification passes; web typecheck + build green.

---

## Sequencing & cut order

All six steps are independent — land them F1 → F6 (ordered by user value). **Cut order if scope tightens:** F6 → F5 → F4. **Never cut:** F1, F2, F3.

## Explicitly out of scope (decided at audit)

- **Milestone description editing** — keep manage-mode rows single-line; the field exists in the schema and API for later.
- **Counts on the board workstream tabs** (All 4 · Sprint 4 · Ad-hoc 0) — cosmetic; revisit with the Phase-4 polish pass.
- **Start date in ⌘K quick-create / board quick-add tokens** — creation-time scheduling wasn't in the review's asks; the drawer (F1) covers it.
- Everything 3.7 already deferred (AI features → after Phase 5; Gantt virtualization; ticket↔milestone linkage; cumulative flow).
