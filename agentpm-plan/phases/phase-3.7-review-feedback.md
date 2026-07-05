# Phase 3.7 — Review-driven planning surfaces (dashboard, Gantt, quick-create, workstreams)

> **Status: 🔨 IN PROGRESS** (opened 2026-07-04). Source: the first **real-user review** of the deployed product (`Review.docx`, 2026-07-04) — verdict positive ("intent on the right track, UI clean, POC demonstrates the core well") with 8 usability/workflow asks. This phase turns that feedback into features. AI-related asks are **deferred to after Phase 5** by owner decision — 3.7 ships only the affordances (Beta-tagged, disabled).
>
> **This doc is written to be self-contained**: each step names the exact files, data shapes, rules, tests, and done-criteria, so anyone (or any model) can pick up the next unticked step without extra context.

## Why 3.7 exists
First outside feedback tells us where the product's mental model doesn't match a working PM's. The asks cluster into (a) *planning surfaces we don't have* (overview dashboard, timeline), (b) *friction in flows we do have* (creation, sprint view), and (c) *conceptual gaps* (sprint vs ad-hoc work). None of it invalidates the architecture — everything builds on existing services and idioms.

## Gap analysis — review ask → what exists → what 3.7 builds

| # | Review ask | Already covered | 3.7 builds |
|---|---|---|---|
| 1 | Project Overview Dashboard (status, sprint progress, blockers, milestones, activity, capacity, AI summary) | Org-level chips + activity on `OrgProjects`; reports tab | **Per-project Overview page → becomes project landing**; one aggregate endpoint; AI summary card = Beta placeholder |
| 2 | Timeline (Gantt): bars, milestones, dependencies, filters, drag scheduling, D/W/M | Nothing (no `startDate`, no Milestone model) | **Full interactive Gantt**: migration + hand-rolled SVG + drag move/resize |
| 3 | Streamlined creation (fewer mandatory fields, inline, AI autofill) | Only title mandatory; ⌘K parses `!prio @user #sprint`; board quick-add = title only | Token syntax + template hook in board quick-add; **AI-draft buttons Beta-tagged, no LLM** |
| 4 | Navigation & scalability | Largely shipped (tree rail, breadcrumbs, ⌘K) | Small deltas: Overview/Timeline leaves + palette entries |
| 5 | Board↔Sprint alignment + ad-hoc board | WS sync on Board only; sprint filter | **`workstream` field (SPRINT/ADHOC)** + board tabs; WS sync for all project views |
| 6 | Project reporting (burndown, workload, completed vs pending, release readiness) | Reports tab shipped 3.3 | Burndown on Overview; completed-vs-pending; **release readiness** from milestones |
| 7 | Task/subtask creation without screen-hopping | Board quick-add; subtask = link-existing picker only | **Inline "new subtask" input** (create+link in one step) |
| 8 | Sprint view: info + quick actions, configurable columns | Sprint cards rich, but ticket chips bare | Ticket chips → info rows w/ inline status/assign; goal edit; **List column chooser** instead of per-sprint columns |

## Owner decisions (locked 2026-07-04)
1. **AI**: everything AI moves to after Phase 5. 3.7 ships disabled buttons/cards with a "Beta" badge + "arrives with the agent release" tooltip. **No LLM code, no `ANTHROPIC_API_KEY` reads anywhere in 3.7.**
2. **Gantt**: full interactive in 3.7 (drag move + resize, day/week/month scales).
3. **Milestones**: real `Milestone` Prisma model + CRUD (not approximated from sprints).
4. **Ad-hoc work**: explicit `workstream` enum on Ticket with board tabs + server-enforced workflow rules.

---

## How to work this phase (conventions — read once)

- Repo layout: pnpm workspace root is `sourcecode/`; API = `sourcecode/apps/api` (Fastify + Prisma + zod, tests in `src/test/*.test.ts` against a real Postgres), web = `sourcecode/apps/web` (React 18 + Vite + Tailwind + shadcn-style `components/ui/*` + @tanstack/react-query + react-router v6 + i18next; unit tests colocated `src/**/*.test.ts(x)` under vitest+jsdom).
- **One step = one local commit** that also updates: this doc (tick the checkbox), `PROGRESS.md` (Now/Next + a log row), `FEATURES.md` (only for user-facing steps), and `sourcecode/apps/web/src/locales/en.json` for any new UI string (never hardcode English in components — always `t('…')`).
- **Never `git push`** unless the owner asks.
- Dev stack: `docker compose up` from `sourcecode/`. **After ANY change under `apps/api/src`**: `docker compose restart api` (tsx watch inside the container misses macOS file events). **After a Prisma schema change**: `docker compose exec api pnpm --filter @agentpm/api exec prisma generate && docker compose restart api` (host-side generate does not reach the container).
- Migrations: `cd sourcecode/apps/api && DATABASE_URL="postgresql://agentpm:localdev@localhost:5432/agentpm" npx prisma migrate dev --name <name>`. The test DB (`agentpm_test`) is migrated automatically by the test global-setup.
- Test commands: `pnpm --filter @agentpm/api test` (59 green at phase open), `pnpm --filter @agentpm/web test` (18 green), `pnpm --filter @agentpm/api typecheck`, `pnpm --filter @agentpm/web typecheck`, `pnpm --filter @agentpm/web exec vite build`.
- API conventions: routes in `src/routes/*.ts` use zod schemas + `requireAuth`; project-scoped routes use `loadProjectAuthorized(request, 'MEMBER'|'ADMIN')` from `routes/projects.ts`; org role checks via `assertOrgRole`. Mutations that others should see live call `publishEvent(type, payload)` (Redis → WS). Errors: `throw new ApiError(status, message, code?)`.
- Web conventions: server state via react-query keyed `['tickets', projectId]`, `['sprints', projectId]`, `['org', slug]`, `['projects', orgId]`, etc.; client fetchers live in `src/lib/api.ts` (single `api` object + exported interfaces); charts are **hand-rolled inline SVG** (see `components/BurndownSparkline.tsx`) — no chart library; persistent UI prefs via `useLocalStorageState` (`src/lib/useLocalStorage.ts`); toasts via `sonner`.
- Browser verification: drive the running dev stack at `http://localhost:3000` (Chrome automation or manually). Test data lives in the owner's real org — create a throwaway project for destructive experiments and delete it after (ask before deleting anything you didn't create).

---

## Steps (tick as they land)

### - [x] R0 — Phase doc (S) *(done 2026-07-04)*
This file + README index row + `PROGRESS.md` Now/Next.

---

### - [x] R1 — Schema foundation: Milestone, startDate, workstream (M) *(done 2026-07-05)*

**Goal:** all Phase-3.7 data-model changes in ONE migration, plus the server-side rules every later step relies on.

**1. Edit `sourcecode/apps/api/prisma/schema.prisma`:**
- New enum (near the other enums):
  ```prisma
  enum Workstream {
    SPRINT
    ADHOC
  }
  ```
- `model Ticket` gains two fields (place near `dueDate`/`sprintId`) and one index:
  ```prisma
  startDate  DateTime?                       // optional; null = unscheduled on the timeline
  workstream Workstream @default(SPRINT)     // ADHOC = operational work outside sprints
  @@index([projectId, workstream])
  ```
- New model (near `model Sprint`):
  ```prisma
  model Milestone {
    id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    projectId   String   @db.Uuid
    name        String
    description String?
    date        DateTime  // date-only semantics; always store UTC midnight
    done        Boolean  @default(false)
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt

    project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

    @@index([projectId, date])
  }
  ```
  (Add `milestones Milestone[]` to `model Project`.)
- `enum TicketActivityType` gains `WORKSTREAM_CHANGED` (additive — same pattern as 3.4's notification enum adds).

**2. Migration:** `npx prisma migrate dev --name phase37_planning_surfaces` (with `DATABASE_URL` as in conventions). Then regenerate the client **inside the api container** and restart (see conventions). Verify the generated SQL has `ALTER TYPE "TicketActivityType" ADD VALUE 'WORKSTREAM_CHANGED';` as its own statement.

**3. Rules in `sourcecode/apps/api/src/services/tickets.service.ts`** (single source of truth — Board/List/Gantt/CSV/bulk all flow through `createTicket`/`updateTicket`):
- Add `startDate?: string | null` and `workstream?: 'SPRINT' | 'ADHOC'` to `CreateTicketInput` and `UpdateTicketInput`.
- **Invariant: `workstream === 'ADHOC'` ⇒ `sprintId === null`.** Enforce in both create and update:
  - Create with `workstream: ADHOC` **and** `sprintId` set → `throw new ApiError(400, 'Ad-hoc tickets cannot belong to a sprint', 'ADHOC_SPRINT_CONFLICT')`.
  - Update setting `sprintId` to non-null on an ADHOC ticket (or in the same patch) → force `workstream = 'SPRINT'` and record a `WORKSTREAM_CHANGED` activity (fromValue `ADHOC`, toValue `SPRINT`) *in addition to* the existing `SPRINT_CHANGED` activity.
  - Update setting `workstream: 'ADHOC'` on a ticket that currently has a sprint → clear `sprintId` (record `SPRINT_CHANGED` with toValue null) + record `WORKSTREAM_CHANGED`.
  - Update patch containing BOTH `workstream: 'ADHOC'` and a non-null `sprintId` → 400 `ADHOC_SPRINT_CONFLICT` (ambiguous intent).
- **Date rule:** if after applying the patch both `startDate` and `dueDate` are non-null and `startDate > dueDate` → `throw new ApiError(400, 'startDate must be on or before dueDate', 'DATE_RANGE')`. Applies to create and update.
- Record `WORKSTREAM_CHANGED` activity whenever workstream actually changes value.

**4. zod in `sourcecode/apps/api/src/routes/tickets.ts`:**
- `createSchema` & `updateSchema`: `startDate: z.string().datetime().nullable().optional()`, `workstream: z.enum(['SPRINT','ADHOC']).optional()`.
- `listQuerySchema`: `workstream: z.enum(['SPRINT','ADHOC']).optional()` → pass through to the Prisma `where`.
- `importSchema` ticket row: optional `startDate` (datetime string) + `workstream` (enum, default applied server-side = SPRINT).
- `batchSchema.patch`: `workstream: z.enum(['SPRINT','ADHOC']).optional()` — wire it through the batch handler the same way `sprintId` is (it must go through `updateTicket` so the rules apply).
- Ticket serializer (`ticketInclude`/`serializeTicket`) must return the two new fields; mirror them in the web `Ticket` interface in `sourcecode/apps/web/src/lib/api.ts`.

**5. Tests — extend `sourcecode/apps/api/src/test/tickets.test.ts`** (pattern: `app.inject` + real DB, helpers `tokenFor`/`bearer` at top of file):
- create defaults to `workstream: 'SPRINT'`;
- create with `workstream: 'ADHOC'` + `sprintId` → 400 `ADHOC_SPRINT_CONFLICT`;
- PATCH `workstream: 'ADHOC'` on a sprinted ticket → 200, `sprintId` null, activity contains `WORKSTREAM_CHANGED`;
- PATCH `sprintId` on an ADHOC ticket → 200, `workstream` becomes `SPRINT`;
- PATCH with `startDate > dueDate` → 400 `DATE_RANGE`;
- `GET /api/tickets?projectId=…&workstream=ADHOC` filters correctly.

**Done when:** migration applied to dev DB; API suite green (59 + new); `docker compose exec api …` regenerate + restart done; web `Ticket` type updated; typechecks green.

---

### - [x] R2 — Milestone CRUD + WS event (S) *(done 2026-07-05)*

**Goal:** milestones manageable via API and broadcast to connected clients.

**1. Routes in `sourcecode/apps/api/src/routes/projects.ts`** (reuse `loadProjectAuthorized`):
- `GET /:projectId/milestones` (MEMBER) → `{ milestones: Milestone[] }` ordered by `date asc`.
- `POST /:projectId/milestones` (MEMBER) — body `{ name: z.string().min(1).max(200), description: z.string().max(2000).optional(), date: z.string().datetime() }` → 201 `{ milestone }`.
- `PATCH /:projectId/milestones/:milestoneId` (MEMBER) — partial `{ name?, description?, date?, done? }`; 404 if the milestone's `projectId` doesn't match the authorized project.
- `DELETE /:projectId/milestones/:milestoneId` (ADMIN) → 204.
- Every mutation: `await publishEvent('milestone.updated', { projectId: project.id, actorId: request.userId! })`.

**2. Shared types:** add `'milestone.updated'` to the WS event union in `sourcecode/packages/shared-types/src/index.ts` (one event for create/update/delete — clients just invalidate).

**3. Web client (`src/lib/api.ts`):** `Milestone` interface `{ id, projectId, name, description: string|null, date: string, done: boolean }` + `listMilestones(projectId)`, `createMilestone(projectId, body)`, `updateMilestone(projectId, id, body)`, `deleteMilestone(projectId, id)`.

**4. Tests — new `sourcecode/apps/api/src/test/milestones.test.ts`** (mirror `sprints.test.ts` setup): CRUD happy path; MEMBER can create/edit; MEMBER cannot delete (403) but ADMIN/OWNER can; outsider gets 403; PATCH with a milestoneId from another project → 404.

**Done when:** suite green; `curl` (or test) shows the shapes above; restart api container.

---

### - [x] R3 — `useProjectSync` hook + live sync for Sprints/List (S) *(done 2026-07-05)*
> Live-sync verified via Redis event injection (Keycloak SSO shares one session per browser profile, so a foreign `actorId` was published to `agentpm:events` to simulate another viewer): List tab refetched `tickets` on a foreign-actor event and **dropped** a self-actor event; Sprints tab refetched both `sprints` + `tickets`. No data writes; no console errors.

**Goal:** every project view updates live, not just Board (review ask 5).

**1. In `sourcecode/apps/web/src/lib/websocket.ts`** add and export:
```ts
export function useProjectSync(projectId: string | undefined, prefixes: QueryKey[]) {
  // wraps the existing useProjectWebSocket:
  // on ticket.created | ticket.updated | ticket.deleted | sprint.updated | milestone.updated
  //   → for each prefix: queryClient.invalidateQueries({ queryKey: prefix })
  // on reconnect (the existing onOpen/reconnect path) → same invalidation (catch up after a gap)
}
```
Self-echo suppression already exists in the socket layer (events with `actorId === me` are dropped) — do not re-implement.

**2. Adopt:** `Sprints.tsx` → `useProjectSync(projectId, [['sprints', projectId], ['tickets', projectId]])` (plus per-sprint detail keys if trivial); `ProjectList.tsx` → `useProjectSync(projectId, [['tickets', projectId]])`. **Board.tsx keeps its existing rich handler** (presence, ghost drags) — don't touch it.

**3. Verify (browser, two windows):** move a ticket on the Board in window A → the Sprints page and List in window B update within ~1s without focus/refresh.

**Done when:** two-window demo works for List and Sprints; no console errors; web typecheck green.

---

### - [ ] R4 — Overview aggregate endpoint (M)

**Goal:** one GET returns everything the dashboard needs in a single round trip.

**1. New `sourcecode/apps/api/src/services/overview.service.ts`** exporting `projectOverview(projectId: string)`; route `GET /:projectId/reports`-style in `routes/projects.ts`: `GET /:projectId/overview` (MEMBER) → `{ overview: ProjectOverview }`.

**Response shape (define + export the TS interfaces in the service; mirror in web `api.ts`):**
```ts
interface ProjectOverview {
  status: { byStatus: Partial<Record<TicketStatus, number>>; open: number; done: number;
            byWorkstream: { SPRINT: number; ADHOC: number } }        // non-archived only
  activeSprint: { id: string; name: string; endDate: string|null;
                  total: number; done: number } | null               // reuse projectListStats idiom
  blockers: Array<{ id: string; number: number; key: string; title: string;
                    openBlockerCount: number }>                      // top 5; BLOCKED status ∪ blockedByCounts>0
  milestones: Array<{ id: string; name: string; date: string; done: boolean;
                      readiness: { done: number; total: number } }>  // next 3 open, date asc
  capacity: { rows: WorkloadRow[]; recentVelocityAvg: number|null }  // reuse workloadReport + velocityReport (avg last 3 with non-null velocity)
}
```

**2. `milestoneReadiness(projectId)` lives in `sourcecode/apps/api/src/services/reports.service.ts`** (so R14 reuses it): for each open milestone (date asc), `total` = non-archived tickets with status ≠ CANCELLED and `dueDate` in the window `(previousMilestoneDate, thisMilestoneDate]` (first window starts at -infinity); `done` = those with status DONE. Return per-milestone `{ done, total }`.

**3. Reuse, don't re-query:** status counts = one `groupBy` (idiom of `stats.service.ts`); blockers = `blockedByCounts` from `services/relations.service.ts` + one BLOCKED-status query; capacity = existing `workloadReport`/`velocityReport` from `reports.service.ts`. Run the independent pieces inside `Promise.all`.

**4. Tests — new `sourcecode/apps/api/src/test/overview.test.ts`:** seed org→project→tickets (mixed statuses/workstreams, one blocked pair via `POST /:id/dependencies`, one milestone with due-dated tickets) → assert every top-level field, the readiness numbers, blocker list contents, and 403 for an outsider.

**Done when:** suite green; endpoint returns the documented shape; api container restarted.

---

### - [ ] R5 — `ProjectOverview.tsx` page + landing switch (L)

**Goal:** the reviewer's "landing page for project managers".

**1. New page `sourcecode/apps/web/src/pages/ProjectOverview.tsx`** — resolve project like `Sprints.tsx` does (org by slug → projects by orgId → find by projectSlug), then `useQuery(['overview', projectId], api.getProjectOverview)`. Layout: responsive card grid (max-w like Reports; 2-col on lg):
- **Status card** — reuse `MetricChip` + the status-bar idiom from `OrgProjects` cards; open/done + per-status; small "Sprint vs ad-hoc" split line.
- **Active sprint card** — name, done/total progress bar, days left (endDate), and the existing `BurndownSparkline sprintId=…` (it fetches its own data); empty state "No active sprint — start one on the Sprints page" linking there.
- **Blockers card** — up to 5 rows: key (mono), title, red `Ban` count chip; row click → ticket deep link; empty state "Nothing is blocked 🎉".
- **Milestones card** — next 3: name, date, `ReadinessRing` (existing component) fed `readiness.done/total`, done-checkbox toggle (PATCH milestone) + inline "add milestone" input (name + date) using the R2 client fns; empty state invites creating the first one.
- **Capacity card** — reuse the Workload row rendering idiom from `ProjectReports.tsx` (avatar + proportional bar + counts) + "recent velocity ≈ N pts/sprint" line.
- **Activity card** — existing `ActivityFeed` fed by existing `api.projectActivity`.
- **AI summary card** — sparkle icon, title "Project summary", `Badge` "Beta", one muted sentence (i18n `overview.aiSummaryHint`), disabled button "Generate summary" with `title={t('common.betaTooltip')}` = "Arrives with the agent release". **No network call.**
- `useProjectSync(projectId, [['overview', projectId], ['tickets', projectId]])`; skeletons per card while loading (existing `Skeleton`).

**2. Routing switch in `src/App.tsx`:**
```
/orgs/:slug/projects/:projectSlug            → ProjectOverview   (was Board)
/orgs/:slug/projects/:projectSlug/board      → Board             (new canonical)
/orgs/:slug/projects/:projectSlug/board/ticket/:number → Board
/orgs/:slug/projects/:projectSlug/ticket/:number       → Board   (LEGACY — keep! old deep links)
```
**3. Update every producer of project URLs** (grep `projects/${` under `apps/web/src`): `OrgTree.tsx` (Overview leaf first — `LayoutDashboard` icon — then Board/List/Sprints/Reports/Settings), `Breadcrumbs.tsx`, `ViewToggle.tsx` (board/list toggle base path), `CommandPalette.tsx` (project hits → overview; ticket hits → `/board/ticket/`), `Board.tsx` quick-create + drawer navigations, `ProjectList.tsx` drawer links, notification bell click-through, `OrgProjects` card links (decide: card → Overview).
**4. i18n:** `overview.*` group (title, card titles, empty states, beta strings) + `nav.overview`.

**Verify matrix (browser):** fresh navigation lands on Overview; every tree leaf works; an OLD ticket URL (`…/projects/x/ticket/3`) still opens the Board with the drawer; palette project hit → Overview; bell notification click still opens the right ticket; mobile + dark mode sane. Two-window: closing a blocker in window A updates Overview blockers card in B.

**Done when:** matrix passes; FEATURES.md gains an "Overview" section; suite + typecheck + vite build green.

---

### - [ ] R6 — Gantt data + pure date math (M)

**Goal:** the risky math isolated and tested before any UI exists.

**1. Endpoint `GET /:projectId/gantt` (MEMBER) in `routes/projects.ts`:**
```ts
{ items: Array<{ id, number, key, title, status, priority, assignedToId,
                 sprintId, workstream, startDate, dueDate, storyPoints }>,   // non-archived; key = "PROJKEY-N"
  edges: Array<{ ticketId: string; dependsOnId: string }>,                   // from TicketDependency for these tickets
  milestones: Milestone[],
  truncated: boolean }                                                        // true if >1000 tickets (take 1000, updatedAt desc)
```
**2. New pure module `sourcecode/apps/web/src/lib/gantt.ts`** — no React, no Date-local anything; **every function works on UTC day numbers** (`Math.floor(Date.UTC(y,m,d)/86400000)`):
- `PX_PER_DAY = { day: 36, week: 12, month: 3 }` and `type GanttScale = 'day'|'week'|'month'`.
- `toDayNum(iso: string): number`, `dayNumToISO(day: number): string` (UTC midnight).
- `xForDay(day, rangeStartDay, scale)`, `dayForX(x, rangeStartDay, scale)` (inverse, rounded).
- `barForTicket(t): { startDay, endDay } | null` — null when both dates null; due-only ⇒ 1-day bar `[dueDay, dueDay]`; start-only ⇒ `[startDay, startDay]`; both ⇒ span (already validated start ≤ due server-side).
- `clampBar(startDay, endDay)` → ensures `startDay <= endDay` during drags.
- `computeRange(items, milestones, todayDay)` → `{ startDay, endDay }` = min/max across bars+milestones padded 7 days each side, always containing today; empty data ⇒ `[today-7, today+21]`.
- `ticks(rangeStartDay, rangeEndDay, scale)` → `Array<{ day, label, major: boolean }>`: day scale = every day (major on Mondays, label "4 Jul"); week = Mondays (label "4 Jul"); month = 1sts (label "Jul 2026").
- `applyDrag(bar, kind: 'move'|'resize-start'|'resize-end', deltaDays)` → new `{ startDay, endDay }`, clamped — the drag reducer R8 uses.
**3. Web tests `src/lib/gantt.test.ts`:** round-trip `toDayNum`/`dayNumToISO`, x↔day inverse at every scale, bar derivation for the 4 date combinations, range padding + empty default, tick generation across a month boundary AND a DST change (e.g. 2026-03-27→03-31 — UTC math must make this a non-event), `applyDrag` clamping.
**4. Client fns:** `api.getProjectGantt(projectId)` + `GanttPayload` types in `api.ts`.
**5. API test:** extend `overview.test.ts` or new block — payload shape, edges present, `truncated=false`, outsider 403.

**Done when:** both suites green (gantt.test.ts is the heart of this step); no UI yet.

---

### - [ ] R7 — Read-only Gantt page (L)

**Goal:** a scannable timeline before any interaction.

**1. Files:** `src/pages/ProjectGantt.tsx` (route `…/gantt`, project resolution as usual, filters state) + `src/components/gantt/GanttChart.tsx` (pure presentational: takes items/edges/milestones/scale/range + callbacks).
**2. Layout:** CSS grid, two columns: **left rail** (sticky, ~240px; one HTML row per ticket: mono key + truncated title; click → navigate to `…/board/ticket/:number` i.e. open drawer) and **right pane** `overflow-x-auto` containing ONE `<svg>` sized `width = (endDay-startDay+1) * pxPerDay`, `height = rows*ROW_H(=32) + HEADER_H(=40) + MILESTONE_LANE(=24)`. Row order: by `startDay` then number; unscheduled tickets are NOT rows — they live in the tray (below).
**3. SVG contents (hand-rolled, `BurndownSparkline` precedent):** header tick labels + vertical gridlines (major ticks stronger); weekend shading `rect`s (day scale only); **today** = vertical line `stroke="hsl(var(--primary))"`; per row a rounded `rect` bar colored by status (reuse the STATUS color mapping from `lib/board.ts`; ~60% opacity + full-opacity 3px left edge), bar label = title when `barWidth > 120px`; **milestone lane** on top: diamond (`rect` rotated 45°) + name + dashed vertical line through the chart; done milestones muted. **Dependency edges:** elbow `<path d="M…">` from the end of the `dependsOnId` bar to the start of the dependent bar, `stroke-opacity 0.35`, small arrowhead `<marker>`; skip when either endpoint has no bar.
**4. Controls row (above chart):** reuse Board's filter idiom — assignee / sprint / label / status / workstream selects — filtering CLIENT-side over the payload; D/W/M segmented toggle persisted via `useLocalStorageState('agentpm-gantt-scale')`; "today" button scrolls the pane so today is at 1/3 width.
**5. Unscheduled tray:** collapsible bottom panel "Unscheduled (N)" listing filtered no-date tickets as chips (key + title, click opens drawer). Persisted collapsed state.
**6. Nav & i18n:** OrgTree leaf "Timeline" (`GanttChartSquare` or `CalendarRange` icon) between Sprints and Reports; palette entry; `gantt.*` i18n group; `truncated` notice banner when the flag is set.
**7. Mobile:** below `sm` the page renders with the left rail narrowed (key only) and horizontal scroll; no interactions (R8 gates them anyway).
**8. `useProjectSync(projectId, [['gantt', projectId]])`.**

**Verify (browser):** bars/labels/today line correct on all three scales; filters narrow rows AND tray; milestone diamond + line; dependency arrow between two scheduled tickets; drawer opens from rail + tray; dark mode; 375px width scrolls.

**Done when:** verification passes; FEATURES.md "Timeline" section; suites/typecheck/build green.

---

### - [ ] R8 — Gantt interactivity: drag move / resize / schedule + undo (L)

**Goal:** the reviewer's "drag-and-drop scheduling".

**1. Interaction model (pointer events on the SVG, no dnd-kit here):** pointerdown on a bar body starts `move`; on the 8px left/right bar edge (cursor `ew-resize`) starts `resize-start`/`resize-end`; track `deltaDays = dayForX(current) - dayForX(origin)`; live-preview by re-rendering the dragged bar through `applyDrag` (pure, from R6); Escape cancels. Disabled below `sm` breakpoint.
**2. Drop → persist:** `api.updateTicket(id, { startDate: dayNumToISO(startDay), dueDate: dayNumToISO(endDay) })`, optimistic via `qc.setQueryData(['gantt', projectId], …)`, rollback on error, and a **sonner undo toast** (Board's pattern): keep `{ id, prevStart, prevDue }`, Undo = counter-PATCH.
**3. Tray scheduling:** drag a tray chip onto a row area → `startDate = drop day`, `dueDate = drop day + 2`; simple HTML5 drag or pointer-based ghost — either is fine, keep it small.
**4. Milestone diamonds draggable** the same way (PATCH milestone `date`), with undo.
**5. Guard rails:** while a drag is active, suspend `useProjectSync` invalidation for `['gantt']` (ref flag) so a WS echo doesn't yank the bar mid-drag; server still validates `DATE_RANGE`.
**6. Tests:** unit-test the drag reducer paths in `gantt.test.ts` (move/resize/clamp/tray-defaults); no browser-automation test needed beyond manual verify.

**Verify (browser):** move a bar at each scale (snaps whole days), resize both ends past each other (clamps), undo restores, second window sees the change, tray chip becomes a 3-day bar, milestone drag works, Escape cancels cleanly.

**Done when:** all of the above + suites green.

---

### - [ ] R9 — Quick-add tokens + inline subtask create (M)

**Goal:** create tickets where you are, with the fields you know (review asks 3 + 7).

**1. Board quick-add upgrade** (`src/components/board/Column.tsx` quick-add input — the same component the empty-board hero uses):
- Pipe the raw input through the existing `parseQuickCreate(input, members, sprints)` (`src/lib/parseQuickCreate.ts`) — supports `!urgent/!high/!m/!l`, `@name`, `#sprint`.
- Under the input, while typing, render small chips for whatever parsed (priority pill, assignee avatar+name, sprint name) so the user sees what will be set; create with the parsed fields + the column's status.
- **Template hook:** a small `FilePlus2` icon-button beside the input opens a dropdown of org templates (query `['templates', orgId]`, exactly as `ProjectTools.tsx` does); choosing one creates a ticket in this column pre-filled from the template (same create call `ProjectTools` uses) and opens its drawer.
**2. Inline subtask creation** (`src/components/RelationsSection.tsx`): under the Subtasks list add a one-line input placeholder `t('relations.newSubtaskPlaceholder')` ("New subtask title — Enter to create"); Enter → `api.createTicket({ projectId, title, parentId: currentTicketId, workstream: parentTicket.workstream })` → invalidate `['relations', ticketId]` + `['tickets', projectId]`, toast, clear input, keep focus (fast batch entry). Keep the existing "link existing ticket" picker.
**3. Board card affordance (`src/components/board/TicketCard.tsx`):** hover-visible (but touch-reachable — follow the 3.6 reaction-button pattern: low-opacity always, full on hover) "+ subtask" icon → opens the drawer with the new input focused (pass focus via location state or a store flag).
**4. Optional (cut first):** subtask counts on cards — extend the list endpoint with a grouped `parentId` count (idiom of `blockedByCounts`) and render "2/5 subtasks" chip.
**5. Web test:** pure test for the parse-preview mapping (input string → chips model). i18n keys `board.quickAddHint`, `relations.newSubtask*`.

**Verify (browser):** `Fix cache !high @sanjay #Sprint 2` from a column creates with all fields; template pick prefills description/AC; typing three subtask titles Enter-Enter-Enter yields three linked subtasks without leaving the drawer.

**Done when:** verification passes; suites green; FEATURES.md creation section updated.

---

### - [ ] R10 — Beta AI affordances (S)

**Goal:** make the AI story visible without shipping AI (owner decision).

**1. New `src/components/BetaBadge.tsx`:** tiny wrapper — `Badge variant="outline"` text `t('common.beta')` + optional tooltip `t('common.betaTooltip')` ("Arrives with the agent release"). Reuse everywhere; single source for the copy.
**2. Placements (all disabled, no handlers, no network):** (a) board quick-add row: sparkle (`Sparkles` icon) button "Draft with AI"; (b) `TicketDrawer` spec/description header: "Auto-fill from prompt"; (c) Overview AI summary card (from R5 — switch it to use `BetaBadge`).
**3. Accessibility:** `aria-disabled`, tooltip also as `title=`. **Grep-check:** no `ANTHROPIC`, no fetch to any AI path.

**Done when:** three placements render in light+dark; i18n complete; typecheck green.

---

### - [ ] R11 — Workstream UX: tabs, list, CSV, bulk (M)

**Goal:** the reviewer's "ad-hoc board" as a first-class lens, not a fork (server rules already exist from R1).

**1. Board tabs (`Board.tsx` header, next to the view toggle):** segmented control — `t('board.tabAll')` **All** | `t('board.tabSprint')` **Sprint work** | `t('board.tabAdhoc')` **Ad-hoc** — state persisted per project (`useLocalStorageState('agentpm-board-ws-' + projectId)`, default All); passes `workstream` to the tickets query (`api.listTickets` param from R1). Column quick-add while on the Ad-hoc tab creates with `workstream: 'ADHOC'`.
**2. Drawer (`TicketDrawer.tsx` Details grid):** "Workstream" select (Sprint work / Ad-hoc). When switching to Ad-hoc while `sprintId` set, show inline hint `t('drawer.adhocClearsSprint')` ("This will remove the ticket from its sprint") — server clears it regardless (R1 rule); after PATCH invalidate tickets+sprints.
**3. List (`ProjectList.tsx`):** workstream filter select + a Workstream column (small badge, hidden `md:` down). **BulkBar (`components/BulkBar.tsx`):** "Set workstream" menu (batch PATCH from R1; note bulk `workstream: ADHOC` clears sprints via the service rules).
**4. CSV (`components/CsvTools.tsx` + import route, already schema-ready from R1):** export gains `Start` (ISO date) + `Workstream` columns; `HEADER_ALIASES` gains `startDate: ['start','start date','startdate']`, `workstream: ['workstream','work stream','type of work']`; value mapping sprint→SPRINT, `ad-hoc/adhoc/ad hoc/ops`→ADHOC, unknown→omit (server default SPRINT). Update `SAMPLE_CSV_ROWS` + the `mapRows` tests (`CsvTools.test.tsx`) + an API import test asserting an ADHOC row lands sprint-less.
**5. Reports touch (`ProjectReports.tsx` + `reports.service.ts`):** workload rows gain a small "N sprint · M ad-hoc" split (extend `workloadReport` groupBy with workstream); velocity untouched (sprint-derived by construction — note it in FEATURES).
**6. Automation invariant test (`workflow.test.ts` or `tickets.test.ts`):** enable `autoTodoOnAssign`; assign an ADHOC BACKLOG ticket → status moves to TODO **and** `sprintId` stays null, `workstream` stays ADHOC.

**Verify (browser):** create tickets in both tabs; tab counts/filtering correct; drawer switch clears sprint with hint; bulk set-workstream on 3 tickets; CSV round-trip preserves Start+Workstream; workload split renders.

**Done when:** verification passes; suites green (incl. updated CSV tests); FEATURES.md explains Sprint vs Ad-hoc.

---

### - [ ] R12 — Sprint view: informative rows + inline actions + goal edit (M)

**Goal:** manage a sprint without opening tickets (review ask 8).

**1. `Sprints.tsx` expanded ticket chips → rows** (keep drag handles working — dnd-kit listeners stay on a grip area, not the whole row): mono key · truncated title (click → drawer via `…/board/ticket/:number`) · **status select** (native select styled like the List filters; on change `api.updateTicketStatus`) · priority pill (`PRIORITY_CLASS` from `lib/board.ts`) · **assignee avatar + quick-assign dropdown** (members query `['members', slug]`; "Unassigned" option) · points chip.
**2. Sprint goal:** show `sprint.goal` under the name (muted, italic when empty: `t('sprints.noGoal')` "No goal set"); pencil icon → inline input, Enter saves via `api.updateSprint(id, { goal })` (add client fn if missing; PATCH `/api/sprints/:id` exists).
**3. Per-sprint mini filter row** (client-side over the expanded list): assignee select + status select — small, right-aligned, only when expanded.
**4. Everything invalidates `['sprint', id]` + `['tickets', projectId]`; live via R3.**

**Verify (browser):** change status + assignee inline (persists, board reflects), edit goal, filter within an expanded sprint, drag between sprints still works, mobile row wrap sane.

**Done when:** verification passes; suites/typecheck green; FEATURES.md sprint section updated.

---

### - [ ] R13 — List column chooser (S)

**Goal:** the useful half of "configurable columns".

`ProjectList.tsx`: a `Columns3` icon-button opening a `DropdownMenu` of checkbox items — Status, Priority, Assignee, Sprint, Workstream, Start, Due(?), Points, Updated (Key + Title always on). Visibility set persisted `useLocalStorageState('agentpm-list-columns')` (default = current visible set). Add the two NEW columns (Workstream from R11, Start date) to the table when enabled. Hide both `<th>` and `<td>` by the same predicate; CSV export continues to export ALL columns regardless (note in code comment).

**Verify:** toggle columns, reload persists, sort still works on visible sortable columns, mobile unaffected.

**Done when:** verification passes; typecheck green.

---

### - [ ] R14 — Release readiness on Reports (S)

**Goal:** the reviewer's "release readiness" with zero new schema.

`ProjectReports.tsx` + `reports.service.ts`: expose `milestoneReadiness` (built in R4) through the existing `GET /:projectId/reports` payload (`reports.readiness: Array<{ id, name, date, done, total }>` for open milestones). New "Release readiness" card: per milestone a row — name, date, `ReadinessRing` or slim progress bar `done/total`, "N tickets open past this date?" caveat line — plus one **completed-vs-pending donut** (hand-rolled SVG: two arcs via `stroke-dasharray` on a circle, center label "X%") for the whole project (done vs open, non-archived, non-cancelled). Empty state: "Add milestones on the Overview page to track release readiness" (link). Extend the reports API test for the new field.

**Done when:** card renders with seeded milestone; suites green; FEATURES.md reports section updated; **phase status flips to ✅ DONE** and PROGRESS.md closes 3.7.

---

## Sequencing & dependencies

R0 → **R1** → {R2, R3, R6, R9, R11 — any order} → R4 (needs R1+R2) → R5 (needs R3+R4) → R7 (needs R2+R3+R6) → R8 (needs R7) → R10 (needs R5) → R12 (needs R3) → R13 (needs R11) → R14 (needs R2+R4).

**Cut order if scope tightens:** R13 → template hook in R9 → subtask counts (R9.4) → dependency arrows (R7.3) → unscheduled tray (R7.5, keep a "no dates" notice) → quick-assign in R12 (keep status select). **Never cut:** R1, R2, R4–R8, R11.

## Explicitly deferred (with reasons)
- **All AI features** → after Phase 5 (owner decision). Affordances only (R10).
- **Gantt row virtualization** → cap 1000 + `truncated` notice until real projects approach it.
- **Per-sprint configurable columns** → replaced by R12 rows + R13 List chooser.
- **Ticket↔milestone linkage table** → date-window heuristic answers "ready by the date?" without schema churn.
- **Cumulative flow diagram** (3.3 R3) → still deferred; revisit with the Phase-4 digest.

## Risks
- **Gantt drag/timezone math** → isolated in pure UTC-only `lib/gantt.ts` (R6), unit-tested before any UI exists (R7/R8 consume it blindly).
- **Landing switch breaking deep links** → legacy `…/ticket/:number` route retained + repo-wide grep for `projects/${` + the R5 verify matrix.
- **Enum migration on live data** → additive with default (same pattern as 3.4's notification enums); check generated SQL.
- **WS invalidation storms** as more views subscribe → acceptable at current scale; batch/debounce noted for later.
- **Bulk ADHOC clearing sprints silently** → surfaced in the BulkBar confirm copy (R11).

## Guardrail
Feedback-driven ≠ scope-free: anything that grows past its size box (especially Gantt) gets its interactive tail split into a follow-up rather than blocking the phase.
