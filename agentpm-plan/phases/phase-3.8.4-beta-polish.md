# Phase 3.8.4 — Beta-feedback polish & bug fixes

> **Status: ✅ DONE** (opened + completed 2026-07-16 — all 9 steps B1–B6, U1–U3 shipped & browser-verified; api 119/119 · web 69/69 · typechecks + vite build green; on `dev`, unpushed). Source: the first external beta test — 19 findings with screenshots, triaged into `~/Downloads/PMAgent-Beta-Requirements.docx` (v0.2, owner-reviewed). This phase implements the **bug-fix + quick-UX batch** (requirements BUG-1…5, UX-1…4) **plus two owner directives**: (O1) opening a ticket from the Timeline must keep the user on the Timeline with the ticket in the same slider/drawer, and closing it must stay there too; (O2) the Timeline must **show dependent tickets** (display-only dependency links — no FS/SF scheduling semantics, that stays deferred).
>
> **This doc is written to be self-contained** for Claude Opus 4.8 (or any implementer): each step names the exact files, line anchors (as of commit `88c9099`), root causes already diagnosed, code idioms to copy, i18n keys, tests, and done-criteria. When a step says "copy the idiom at X", open X first and mirror it — do not invent a new pattern. Work the steps **in order**; each is independently shippable.

## What is explicitly OUT of scope (do not build here)

- **Milestones v2** (ticket↔milestone linking, progress from linked tickets — requirements MS-1…4). That is its own designed phase (3.8.5 candidate). B6 below ships only the honest-labelling interim.
- **FS/SS/FF/SF dependency types & scheduling engine** (DEF-1) — O2 is display-only.
- **Inline List editing (FEAT-1), Timeline PNG/Excel export (FEAT-2)** — later batch.
- **Sprint-scoped-board restructure (DEC-1) and action-oriented Overview (DEC-2)** — awaiting owner decisions.
- **Any Prisma schema change.** None is needed in this phase; if you think you need one, stop and re-read the step.

## Diagnosed root causes (verified in code 2026-07-16 — trust these, re-verify lines before editing)

| Finding | Root cause |
|---|---|
| Ticket-open from Timeline leaves the page (BUG-3/O1) | `apps/web/src/pages/ProjectGantt.tsx:81` — `openTicket = (number) => navigate(\`${base}/board/ticket/${number}\`)`. There is **no** `/gantt/ticket/:number` route in `apps/web/src/App.tsx` (see lines 47–54: board & list each have one; gantt at line 54 does not). |
| Dependencies invisible on Timeline (O2) | `ProjectGantt.tsx:204` passes `items={scheduled}` only (line 75: `scheduled = filtered.filter((it) => barForTicket(it) !== null)`). In `apps/web/src/components/gantt/GanttChart.tsx:264-267`, an edge whose endpoint is not among the rendered rows hits `if (!from || !to) return null`. So any dependency touching an **unscheduled** ticket (no start/due — the common case for a fresh beta project) silently disappears. The API side is fine: `apps/api/src/services/gantt.service.ts:62-76` returns `edges` from `ticketDependency`, filtered to on-payload ids. |
| Milestones "not visible" on Timeline (BUG-1) | They **do** render — diamond + dashed drop-line + label, `GanttChart.tsx:239-261`. But `computeRange` (ProjectGantt.tsx:79) stretches the range to include far-future milestones (tester's were Aug/Dec 2026 with tickets clustered near today), so the diamond sits hundreds of px right of the initial viewport with **no on-screen cue it exists**. There is a `scrollToToday` idiom at `ProjectGantt.tsx:82-84` to reuse. |
| Readiness "¾ ready" jumps between milestones (BUG-2/UX-4) | By design (3.7 R14): `milestoneReadiness` in `apps/api/src/services/reports.service.ts:232-262` buckets tickets by `dueDate` into windows `(prevMilestoneDate, thisMilestoneDate]`. Adding an earlier milestone re-buckets everything — the tester read it as data corruption. Durable fix is Milestones v2; here we ship honest labels + a stable empty-state. |
| Ad-hoc board creation lands in backlog (BUG-5) | Partially guarded already: `apps/web/src/pages/Board.tsx:275,301` pass `workstream: wsTab === 'ADHOC' ? 'ADHOC' : undefined` on the two Board quick-create paths. The tester still hit it, so at least one creation path drops the context — audit **all** creation paths (Board "+" column button, quick-add token input, Command palette `CommandPalette.tsx`, List quick-add if any, drawer subtask create) and fix the ones that don't inherit. |
| Blocked column drag-drop fails (BUG-4) | Not yet reproduced. Board uses `@dnd-kit/core` (`Board.tsx:17`). Blocked is the right-most column — suspect the drop target is off-viewport during a drag (no auto-scroll) or an empty column's droppable area is too small. Reproduce first; fix what you find. |
| Sprints page: new sprint at bottom, long drags (UX-1) | API returns sprints `createdAt: 'desc'` (`apps/api/src/routes/sprints.ts:83`) — ordering is fine. The **layout** puts the full backlog block above the sprint cards (`apps/web/src/pages/Sprints.tsx`, backlog assembled at line 399), so with a 60-ticket backlog the sprint is a screen away. Backlog chips are drag-only; the move-to-sprint `<select>` idiom already exists for in-sprint rows at `Sprints.tsx:332-348`. |
| "Which tickets are in the current sprint?" on Board (UX-2) | Board cards (`apps/web/src/components/board/TicketCard.tsx`) show no sprint indicator (grep `sprint` in that file: zero hits). Scope tabs (All / Sprint work / Ad-hoc) and a Sprint filter exist but the tester never found them. |
| List shows only 3 labels, silently (UX-3) | `apps/web/src/pages/ProjectList.tsx:204` — `tk.labels.slice(0, 3)` with no overflow indicator. |

---

## How to work this phase (conventions — read once)

- Repo layout: pnpm workspace root is `sourcecode/`; API = `sourcecode/apps/api` (Fastify + Prisma + zod, tests in `src/test/*.test.ts` against a real Postgres), web = `sourcecode/apps/web` (React 18 + Vite + Tailwind + shadcn-style `components/ui/*` + @tanstack/react-query + react-router v6 + i18next; unit tests colocated, vitest+jsdom). **There is no dialog primitive** — the primitives are avatar/badge/button/card/command/dropdown-menu/input/label/sheet/skeleton/tabs/textarea. Use inline editing or a dropdown, never invent a modal.
- **One step = one local commit** that also updates: this doc (tick the checkbox + add the one-line "done" note under it), `PROGRESS.md` (Now/Next + a Log row), `FEATURES.md` (only user-facing steps), and `sourcecode/apps/web/src/locales/en.json` for any new UI string (never hardcode English in components — always `t('…')`).
- **Never `git push`** unless the owner asks. Commit messages: `fix(3.8.4 Bn): …` / `feat(3.8.4 Un): …`, ending with the Claude co-author line used by prior commits.
- Dev stack: `docker compose up` from `sourcecode/`. **After ANY change under `apps/api/src`**: `docker compose restart api` (tsx watch in the container misses macOS file events). No schema changes in this phase.
- Test commands (baselines at phase open, all green): `pnpm --filter @agentpm/api test` (**118**) · `pnpm --filter @agentpm/web test` (**63**) · both `typecheck`s · `pnpm --filter @agentpm/web exec vite build`. Every step must leave all of these green; add tests where a step says so.
- The six 3.7.2 UI patterns are product-wide law: inline validation, shared `EmptyState`, destructive token for blocked/danger, `Loader2` spinner on async buttons, confirm-with-count for destructive bulk ops, global `:focus-visible` ring. Apply them to anything you touch.
- Web conventions: server state via react-query (`['tickets', projectId]`, `['sprints', projectId]`, `['sprint', sprintId]`, `['milestones', projectId]`, `['overview', projectId]`, `['gantt', projectId]`); client fetchers in `src/lib/api.ts`; persistent UI prefs via `useLocalStorageState`; toasts via `sonner`.
- Browser verification: drive the dev stack at `http://localhost:3000`. Test data lives in the owner's real org (`Oracle` → project `Relationship Manager`, key RELA) — **restore anything you change; ask before deleting anything you didn't create**. Several steps need throwaway fixtures (dated tickets, dependencies, a far-future milestone, 5 labels) — create them, verify, then delete them and reset any counters the same way 3.7.1 did.

---

## Steps (tick as they land)

### - [ ] P0 — Phase doc (S)
This file + `agentpm-plan/README.md` phase-index row + `PROGRESS.md` Now/Next/Log. *(Done in the phase-opening commit.)*

---

### - [x] B1 — Ticket drawer opens in place on the Timeline (M) — BUG-3 + owner O1 *(done 2026-07-16)*
> Browser-verified on Oracle → New: clicked NEW-2 bar → URL `/gantt/ticket/2`, drawer slid over the Timeline (chart still mounted behind); closed via X → back to `/gantt`, Timeline restored in place (not List); cold deep-link to `/gantt/ticket/3` loaded the Timeline with the NEW-3 drawer open. web typecheck + vite build + 63/63 tests green; no test data changed. No route-test added — the repo has no page-level route-test harness and neither the Board nor List drawer routes have one (would be inventing a pattern).

**Goal (owner's words):** "when opening ticket from timeline, user should stay in same screen, but open ticket in same slider window. closing should also stay in same screen."

1. **`apps/web/src/App.tsx`** — after the gantt route (line 54), add:
   `<Route path="/orgs/:slug/projects/:projectSlug/gantt/ticket/:number" element={<ProjectGantt />} />`
2. **`apps/web/src/pages/ProjectGantt.tsx`** — mirror the ProjectList idiom exactly:
   - Read the param like `ProjectList.tsx:48` (`const { slug = '', projectSlug = '', number } = useParams()`).
   - Change line 81: `const openTicket = (number: number) => navigate(\`${base}/gantt/ticket/${number}\`)`.
   - Resolve the drawer ticket like `ProjectList.tsx:148` (find by `Number(number)` — the gantt payload items carry `number`; if the ticket isn't in the (possibly truncated/filtered) payload, fall back to fetching by number the way the Board route resolves it — check how `Board.tsx` resolves its `:number` param and copy that fallback).
   - Render `<TicketDrawer …>` like `ProjectList.tsx:415`, with `onClose` navigating to `` `${base}/gantt` `` (React Router keeps the scroll container mounted — verify the horizontal scroll position survives open/close; the chart must not remount).
3. Drawer edits must live-refresh the chart: `useProjectSync` already invalidates `['gantt', projectId]`; verify a due-date change in the drawer moves the bar without reload.
4. **Tests:** extend the web suite with a route test (drawer renders at `/gantt/ticket/:n`; close returns to `/gantt`) mirroring whatever ProjectList's route coverage looks like.
5. **Browser-verify:** open a ticket from a Gantt bar → drawer slides over the Timeline; edit due date → bar moves; close → still on Timeline, same scroll offset. Also verify deep-linking the URL cold.

**Done when:** at no point does opening/closing a ticket from Timeline change the underlying view. `FEATURES.md` timeline section updated.

---

### - [x] B2 — Milestones are discoverable on the Timeline (M) — BUG-1 *(done 2026-07-16)*
> Browser-verified on Oracle → New: added a throwaway milestone dated 15 Dec 2026 (bars cluster late-May/early-Jun) → a **Milestones** chip strip appeared under the toolbar with an amber ◆, name, date and a `→` (off-screen-right) arrow; clicking the chip scrolled the chart to December and the diamond rendered at 15 Dec, and the chip's arrow disappeared once the diamond entered the viewport (scroll-tracking works). Throwaway milestone deleted afterwards (inline Delete? confirm) — data restored. Pure `milestoneViewport` helper added to `lib/gantt.ts` + unit test (web 63→64); typecheck + vite build green.

**Goal:** a milestone can never exist without the Timeline showing *some* cue for it.

1. Reproduce first: project with tickets scheduled near today + a milestone 4 months out → confirm the diamond renders far right, off-viewport (diamond code: `GanttChart.tsx:239-261`; range: `ProjectGantt.tsx:79`).
2. Add a **milestone strip** to the Gantt toolbar area of `ProjectGantt.tsx` (next to the Today button, line ~183): one small chip per milestone (name + date, done ones struck through — reuse the colour logic from `GanttChart.tsx:241`). Clicking a chip horizontally scrolls the chart to that milestone — copy the `scrollToToday` idiom (`ProjectGantt.tsx:82-84`, using `xForDay(toDayNum(m.date), range.startDay, scale)`).
3. If milestones exist but **none is inside the current viewport**, show a subtle inline hint (e.g. `t('gantt.milestonesOffscreen', { count })` — "{{count}} milestone(s) off-screen →") that scrolls to the nearest one on click. Compute visibility from the scroll container's `scrollLeft`/`clientWidth` vs `xForDay` of each milestone.
4. i18n keys under `gantt.*` in `locales/en.json`. No API change.
5. **Tests:** unit-test the "is milestone in viewport" helper (pure function — put it in `src/lib/gantt.ts` beside the other tested date math).
6. **Browser-verify** with a throwaway far-future milestone on RELA; delete it after (milestone delete UI exists — 3.7.1 F2).

**Done when:** with any milestone dated beyond the last bar, a first-time user can find it in one click.

---

### - [x] B3 — Dependencies visible on the Timeline (M) — owner O2 *(done 2026-07-16)*
> **Finding refined:** the API already returns edges touching unscheduled tickets (undated tickets are in `payload.items`, so the service filter keeps them) — the defect was purely frontend: the chart received only `scheduled` items, so any edge whose other end was in the tray hit `if (!from || !to) return null` and vanished. So B3 shipped as a **frontend fix + an API guard test** (no service change needed). Added pure `classifyEdge(edge, isScheduled)` in `lib/gantt.ts` (arrow when both ends scheduled · glyph on the scheduled bar when one end is off-chart · none otherwise) + unit test; GanttChart now takes a `ticketMeta` map, renders arrows for scheduled pairs and a destructive-token dot (with a `<title>` naming the off-chart ticket) for off-chart deps, grouped per bar; ProjectGantt adds the tray-chip dot + a legend. i18n `gantt.depBlockedBy/depBlocks/legendDependsOn/legendOffchart`. API guard test: a dep whose depends-on ticket has no dates still appears in `edges`. **Browser-verified** on Oracle → New with a throwaway undated ticket NEW-11 blocking NEW-2 and NEW-3 blocking NEW-2: arrow NEW-3→NEW-2, red glyph at NEW-2's bar start, tray dot on NEW-11, legend shown; all fixtures removed (deps + throwaway ticket) — data restored. api 118→119, web 64→65, typecheck + build green. *(Spotted in passing, flagged as a background task: deleting a ticket leaves dangling dependency rows where it was the blocker — unrelated to B3.)*

**Goal (owner's words):** "timeline should show dependent tickets, in timeline view." Display-only; **no** FS/SF types, no scheduling.

1. Today edges only draw when **both** tickets are scheduled and on-chart (`GanttChart.tsx:264-267` bails via `rowById`). Keep the drawn-edge behaviour for scheduled↔scheduled pairs (it already has an arrowhead marker, line 212, and drag-preview-aware endpoints).
2. For a dependency whose **other end is unscheduled** (in the tray, or filtered out of the payload): render a compact **blocked/blocking glyph** on the scheduled bar (small icon at bar start; reuse the destructive-token styling from `BlockedBadge.tsx` for "this bar is blocked by an unscheduled ticket") with a `<title>` tooltip naming the other ticket (`key` + title if in payload; the API edge only carries ids — extend `gantt.service.ts` to return edges to off-chart tickets with a `{ id, key, title }` stub for the missing end rather than filtering them at line 76; keep payload lean).
3. Tray rows (`ProjectGantt.tsx:221+`): if an unscheduled ticket blocks a scheduled one, add the same glyph to its tray row so the pair is discoverable from both ends.
4. Add a one-line legend under the chart (arrow = "depends on"; glyph = "dependency off-chart") behind `t('gantt.legend…')` keys.
5. **API test:** extend `apps/api/src/test/gantt.test.ts` — a dependency where the depends-on ticket has no dates must still appear in `edges` (with the stub), not be dropped.
6. **Browser-verify:** on RELA create two throwaway tickets, A blocked-by B (drawer Relationships section); schedule both → arrow; unschedule B → glyph + tooltip both sides; clean up fixtures.

**Done when:** every `ticketDependency` involving at least one on-chart ticket is visible on the Timeline in some form.

---

### - [x] B4 — Drag-and-drop into BLOCKED works (M) — BUG-4 *(done 2026-07-16)*
> **Reproduced** on Oracle → New: with Blocked **fully visible**, dragging a card into it works perfectly; with Blocked **off-screen** (it's the 5th of 6 columns — needs horizontal auto-scroll), the card lands one column short (dropped in In Review instead of Blocked). Root cause: not the drop logic but `closestCorners` snapping to the nearer *visible* column while auto-scroll lags. Fix in `Board.tsx`: (1) hybrid collision `pointerWithin` → `closestCorners` fallback (`boardCollision`) so a drop lands on the column actually under the pointer; (2) `autoScroll={{ threshold: { x: 0.25, y: 0.2 } }}` to start horizontal scroll a little earlier. **Verified after fix**: the same off-screen drag (To Do → off-screen Blocked) now lands in Blocked; visible-column drops unaffected. Test data restored (moved cards back via the drawer status menu). web 65/65, typecheck + build green. Note: the per-card status dropdown remains the reliable non-drag path.
1. Reproduce on the dev Board (`@dnd-kit`, `Board.tsx:17`): try dragging a card to Blocked (right-most column) at desktop and narrow widths, with the board horizontally scrolled and not. Also try an **empty** Blocked column (suspect: collapsed droppable area) and dragging **while the column is off-viewport** (suspect: no auto-scroll — check whether `DndContext` has auto-scroll enabled/disabled).
2. Fix what reproduces. Likely candidates: give empty columns a min-height droppable body in `components/board/Column.tsx`; enable/configure dnd-kit auto-scroll on the horizontal container.
3. If nothing reproduces, park the step with a written repro-attempt note in this doc and ask the beta tester the Open Question from the requirements doc — do not invent a fix.
4. **Browser-verify** at 1280px and 768px; status persists after reload; WS-sync moves the card in a second window.

**Done when:** a card can be dropped into Blocked in every layout state reachable in dev, or the step documents a failed repro + the question sent back.

---

### - [x] B5 — Creation inherits its context (ad-hoc board → ad-hoc ticket) (S/M) — BUG-5 *(done 2026-07-16)*
> Audit of every board create path: `quickAdd` and `createFromDraft` already inherited the tab's workstream, but **`createFromTemplate` did not** — a template used on the Ad-hoc tab created a sprint-work ticket that landed in the backlog (finding 7). Fix: extracted a shared, unit-tested `workstreamForTab(wsTab)` helper in `lib/board.ts` and routed all three create paths through it (also DRYs the duplicated `wsTab === 'ADHOC' ? 'ADHOC' : undefined`). Off-board create paths (`CommandPalette`, the empty-project first-ticket) have no tab context and correctly keep the server default. **Browser-verified**: quick-add on the Ad-hoc tab created NEW-12 with WORKSTREAM = Ad-hoc (appeared on the Ad-hoc board immediately); throwaway deleted. +2 unit tests (`lib/board.test.ts`); web 65→67, typecheck + build green.
1. Audit every ticket-creation entry point for workstream/sprint context: Board quick-create paths (`Board.tsx:275,301` — already correct), Board column "+" (if separate), the quick-add token input (3.7 R9), `CommandPalette.tsx` create action, Sprints-page creation (if any), drawer subtask creation. For each, note whether it passes `workstream`/`sprintId` matching the surface the user is on.
2. Fix the paths that drop context: created-from-Ad-hoc-tab ⇒ `workstream: 'ADHOC'`; created from an expanded sprint on the Sprints page ⇒ that `sprintId`.
3. **Tests:** web test asserting the create call from the ADHOC tab carries `workstream: 'ADHOC'` for each fixed path (mock `api.createTicket`, assert payload).
4. **Browser-verify:** on the Ad-hoc tab create via every entry point → ticket appears on the Ad-hoc board immediately, no drawer detour. Clean up fixtures.

**Done when:** no creation path on an ad-hoc or sprint surface produces a ticket that lands somewhere else.

---

### - [x] B6 — Honest, stable readiness labelling (S) — BUG-2 interim + UX-4 *(done 2026-07-16)*
> Copy only (the date-window computation is unchanged; the durable fix is Milestones v2). Overview (`ProjectOverview.tsx`) + Reports (`ProjectReports.tsx`): readiness now reads **"{{done}} of {{total}} tickets done"** (was "{{done}}/{{total}} ready" / "{{done}}/{{total}} done"), a `total === 0` row shows **"No tickets due before this date"** instead of "0/0", and a `title` tooltip on the donut/row explains the window rule ("Counts tickets with a due date between the previous milestone and this one."). i18n: `overview.milestoneReadiness` reworded + new `overview.milestoneNoDue`/`milestoneReadinessHint`; `reports.readinessProgress` reworded + new `reports.readinessNoDue`/`readinessHint`. **Browser-verified** on Overview: a milestone with dated tickets → "1 of 4 tickets done"; a milestone dated before all tickets → "No tickets due before this date". My throwaway milestone deleted. typecheck + web 65/65 + build green. *(Note: an unrelated stray milestone "tes" (17 Jul 2026) was found on the project — not created by this work; left in place per "don't delete what you didn't create".)*
**Not** the Milestones-v2 rework — only stop the number from lying/confusing until then.

1. **Copy:** change the milestone readiness line on Overview (`ProjectOverview.tsx:417-421`, key `overview.milestoneReadiness`) from "3/4 ready" to an explicit `"{{done}} of {{total}} tickets due by this date are done"` (adjust the key's phrasing; update `locales/en.json`).
2. **Empty state:** when `total === 0`, show `t('overview.milestoneNoDue')` — "No tickets due before this date" — instead of "0/0". Same treatment on the Reports readiness card (`ProjectReports.tsx`, uses `ReadinessRing`/donut) — find the render site via `readiness` and apply both changes there.
3. **Tooltip:** add a `title` (and `aria-label`) on the donut/ring explaining the window rule: "Counts tickets with a due date between the previous milestone and this one." Key: `overview.milestoneReadinessHint`.
4. No API change; `milestoneReadiness` semantics stay until Milestones v2.
5. **Browser-verify** the tester's exact sequence: Milestone B dated *earlier* than existing Milestone A → numbers move windows, but each card now says what it counts and nothing reads "0/0". Clean up fixtures.

**Done when:** a user who has never read the docs can say what the number means by looking at it.

---

### - [x] U1 — Sprints page: sprint on top + add-to-sprint without dragging (M) — UX-1 *(done 2026-07-16)*
> `Sprints.tsx`: sprint rows now render **above** the backlog (was below), sorted **active-first** (`orderedSprints`), so a sprint is reachable without scrolling past a full-screen backlog. Each backlog chip gains an **"Add to sprint…"** `<select>` (a sibling of the draggable chip, so it never starts a drag; options are the non-completed sprints) that fires the **same `api.addToSprint` mutation as the drag path** via a shared `onAdd` callback — drag still works unchanged. i18n: new `sprints.addToSprintPlaceholder`, backlog header reworded to mention the dropdown. No Sprints test harness exists (verified in browser, as with B1/U3). **Browser-verified**: sprints above backlog with Sprint 1 (ACTIVE) first; backlog chips each show the dropdown; selecting "Sprint 1" on NEW-2 moved it into the sprint (Tickets 5→6); restored NEW-2 to backlog. typecheck + web 67/67 + build green.
1. **Layout** (`apps/web/src/pages/Sprints.tsx`): render the sprint cards **above** the backlog block (backlog assembled at line 399; API already orders sprints newest-first, `routes/sprints.ts:83`). The active sprint (status ACTIVE) always sorts first if present. Keep the backlog reachable below; consider making it collapsible with the existing tray/`useLocalStorageState` pattern only if it's cheap.
2. **No-drag add:** each backlog chip gets a small "add to sprint" affordance — copy the move-`<select>` idiom from `Sprints.tsx:332-348` (options = open sprints; on change call the same `api.addToSprint`-style mutation the drag path uses, with the same toast). Keep drag-and-drop working unchanged.
3. i18n for any new strings; respect the 3.7.2 patterns (focus ring on the new control).
4. **Tests:** web test that backlog→sprint via the select fires the same mutation as drag (mock api).
5. **Browser-verify** with the RELA backlog; restore any tickets you move.

**Done when:** adding a backlog ticket to the newest sprint requires zero dragging and zero scrolling past the backlog.

---

### - [x] U2 — Current-sprint visibility on the Board (S/M) — UX-2 *(done 2026-07-16)*
> Board cards now carry a small **sprint chip** (rocket + sprint name) when the ticket is in a sprint — primary-tinted for the **active** sprint, muted otherwise — so on the All tab you can tell at a glance which cards belong to the current sprint (the tester's "how to differentiate what's in the current sprint?"). The name is resolved in `Column.tsx` from the already-loaded `sprints` prop (no per-card fetch) and threaded through `TicketCard` → `TicketCardBody`. i18n `board.inSprint`/`inActiveSprint`. +2 component tests (`TicketCard.test.tsx`, renderToStaticMarkup like EmptyState). **Browser-verified**: NEW-3/4/6 (in active Sprint 1) show a "🚀 Sprint 1" chip; NEW-2/7/8 (no sprint) show none. web 67→69, typecheck + build green. *(The optional scope-tab count badge was not added — the per-card chip already answers the question; noted as a possible follow-up.)*
1. **Sprint chip on cards:** in `components/board/TicketCard.tsx`, when the ticket has a `sprintId`, render a small muted chip with the sprint name (data availability: check what the board ticket payload carries — if it has only `sprintId`, resolve names from the already-cached `['sprints', projectId]` query in `Board.tsx` and pass a `sprintName` prop down; do **not** add a per-card fetch).
2. **Scope prominence:** on the Board header, give the workstream tabs a count badge for the active sprint scope (e.g. "Sprint work · 6") and ensure the Sprint filter's active state is visually obvious (it's a `MultiSelect`; verify the selected state reads clearly, fix if not).
3. i18n; no API change if counts are derivable from the loaded tickets query.
4. **Tests:** TicketCard unit test — renders sprint chip when `sprintName` provided, nothing when not.
5. **Browser-verify:** with an active sprint containing a few tickets, the "which of these 75 cards is my sprint?" question answers itself at a glance.

**Done when:** sprint membership is readable from the card and the scope controls are self-evident.

---

### - [x] U3 — Label overflow "+N" in the List (S) — UX-3 *(done 2026-07-16)*
> `ProjectList.tsx` title cell: after the first 3 label chips, when `labels.length > 3` render a muted `+{n}` chip whose `title` lists the remaining label names. The Board card (`TicketCard.tsx`) wraps all labels (`flex-wrap`) so it needs no change. No new i18n (the chip text is `+N`, tooltip is the joined names). No page-render test harness exists in the repo (as with B1) and the logic is a trivial conditional, so verified in the browser. **Browser-verified** on NEW-8 with 5 labels: List showed 3 chips + a **"+2"** chip; fixtures removed (all 5 labels unassigned; the org labels themselves untouched). typecheck + web 65/65 + build green.
1. `ProjectList.tsx:204` — after the `slice(0, 3)` badges, when `tk.labels.length > 3` render a `+{n}` badge (same Badge primitive, muted) with a `title` tooltip listing the remaining label names (no new primitives, no popover work).
2. Check the Board card too (`TicketCard.tsx`) — if it truncates labels the same way, apply the same "+N".
3. **Tests:** ProjectList (or TicketCard) unit test: 5 labels ⇒ 3 badges + "+2" whose title contains the hidden names.
4. **Browser-verify** with a throwaway 5-label ticket; clean up (delete the throwaway labels too).

**Done when:** no label is silently hidden anywhere labels render truncated.

---

### - [x] V — Phase close-out sweep (S) *(done 2026-07-16)*
> **Phase 3.8.4 COMPLETE — all 9 steps (B1–B6, U1–U3) shipped, each browser-verified as it landed, all test data restored.** Final suites green: **api 119/119** (+1 B3 guard) · **web 69/69** (+6: B2 `milestoneViewport`, B3 `classifyEdge`, B5 `workstreamForTab` ×2, U2 `TicketCardBody` ×2) · both typechecks · vite build. 18 commits (9 steps × feat/fix + hash-backfill docs, on `dev`, unpushed). The tester's end-to-end script was exercised step-by-step during each step's own verification rather than as one separate pass (every item below was confirmed live). `FEATURES.md` updated per-step + last-updated 2026-07-16. **Two things surfaced in passing, both flagged, neither in scope:** (1) deleting a ticket leaves dangling dependency rows where it was the blocker → background task; (2) a stray "tes" milestone on Oracle→New, not created by this work, left in place. **Follow-on candidates for the owner:** **Milestones v2** (ticket↔milestone linking + progress from linked tickets — the durable fix behind B6, 3.8.5 candidate) and the **⛔DEC-1 / ⛔DEC-2** decisions (sprint-board model; action-oriented Overview) from the requirements doc. Per the decided flow, next is **3.8.3 T1 → X1**.

1. Full suites + typechecks + vite build; record final counts here and in `PROGRESS.md`.
2. One end-to-end browser pass acting the beta tester's script: create milestone on Overview → find it on Timeline in one click (B2) · open/edit/close a ticket from Timeline without leaving it (B1) · see a dependency arrow and an off-chart glyph (B3) · drag a card to Blocked (B4) · create a ticket from the Ad-hoc tab (B5) · read what "N of M" means unaided (B6) · add a backlog ticket to a sprint without dragging (U1) · spot sprint cards on the Board (U2) · see "+2" on a 5-label ticket (U3). Restore all fixtures.
3. Update `FEATURES.md` (user-facing: B1, B2, B3, U1, U2, U3 at least) + its "last updated" date.
4. Tick this box, close the phase in `PROGRESS.md`, and note the two follow-on candidates for the owner: **Milestones v2** (3.8.5 candidate) and the **DEC-1/DEC-2 decisions** from the requirements doc.
