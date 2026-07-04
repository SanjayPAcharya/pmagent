# Phase 3.7 — Review-driven planning surfaces (dashboard, Gantt, quick-create, workstreams)

> **Status: 🔨 IN PROGRESS** (opened 2026-07-04). Source: the first **real-user review** of the deployed product (`Review.docx`, 2026-07-04) — verdict positive ("intent on the right track, UI clean, POC demonstrates the core well") with 8 usability/workflow asks. This phase turns that feedback into features. AI-related asks are **deferred to after Phase 5** by owner decision — 3.7 ships only the affordances (Beta-tagged, disabled).

## Why 3.7 exists
First outside feedback is gold: it tells us where the product's mental model doesn't match a working PM's. The asks cluster into (a) *planning surfaces we don't have* (overview dashboard, timeline), (b) *friction in flows we do have* (creation, sprint view), and (c) *conceptual gaps* (sprint vs ad-hoc work). None of it invalidates the architecture — everything builds on existing services and idioms.

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
1. **AI**: everything AI moves to after Phase 5. 3.7 ships disabled buttons/cards with a "Beta" badge + "arrives with the agent release" tooltip. No LLM code, no `ANTHROPIC_API_KEY` reads.
2. **Gantt**: full interactive in 3.7 (drag move + resize, day/week/month scales).
3. **Milestones**: real `Milestone` Prisma model + CRUD (not approximated from sprints).
4. **Ad-hoc work**: explicit `workstream` enum on Ticket with board tabs + server-enforced workflow rules.

## Steps (one step = one local commit; tick as they land)

- [ ] **R0 — Phase doc** (S): this file + README index + PROGRESS.md Now/Next.
- [ ] **R1 — Schema foundation** (M): one migration — `Workstream` enum + `Ticket.workstream` (default SPRINT, indexed), `Ticket.startDate?`, `Milestone` model (projectId, name, description?, date, done), `TicketActivityType` += `WORKSTREAM_CHANGED`. Cross-field rules in `tickets.service.ts` (ADHOC ⇒ sprintId null; sprint assign forces SPRINT; both-in-one-patch → 400; startDate > dueDate → 400). zod updates across create/update/list/import/batch. Tests for every rule.
- [ ] **R2 — Milestone CRUD + WS** (S): `GET/POST /:projectId/milestones`, `PATCH/DELETE /:projectId/milestones/:milestoneId` (MEMBER read/write, ADMIN delete); `milestone.updated` WS event; `milestones.test.ts`.
- [ ] **R3 — `useProjectSync` + sync hardening** (S): thin invalidation hook over `useProjectWebSocket`; adopt in Sprints + List (Board keeps its rich handler). Two-window verify.
- [ ] **R4 — Overview endpoint** (M): `GET /api/projects/:projectId/overview` via new `overview.service.ts` — status counts + workstream split, active-sprint summary, top blockers (`blockedByCounts`), next-3 milestones + `milestoneReadiness()` (lives in `reports.service.ts`), capacity (workload + last-3 velocity avg). Fixture tests.
- [ ] **R5 — Overview page + landing switch** (L): `ProjectOverview.tsx` becomes the project landing; Board moves to `…/board`; legacy `…/ticket/:number` kept. Tree/breadcrumbs/palette/ViewToggle updated; AI summary Beta card; deep-link verify matrix.
- [ ] **R6 — Gantt data + date math** (M): slim `GET /:projectId/gantt` (rows + dependency edges + milestones, cap 1000); pure UTC-only `lib/gantt.ts` (day math, scales D=36/W=12/M=3 px, ticks, clamping) with unit tests.
- [ ] **R7 — Gantt read-only** (L): `ProjectGantt.tsx` + `components/gantt/GanttChart.tsx` — sticky left column + scrolling SVG (today line, weekend shading, status bars, milestone diamonds, dependency elbows), Board-idiom filters, persisted D/W/M, unscheduled tray, mobile scroll-only.
- [ ] **R8 — Gantt interactive** (L): bar drag = shift dates, edge drag = resize, tray drop = schedule; optimistic PATCH + undo toast; milestone diamonds draggable; drag-reducer unit tests.
- [ ] **R9 — Quick-add tokens + inline subtask** (M): board quick-add through `parseQuickCreate` with chip preview + template prefill; "New subtask" inline input in relations (create+link one step); card "+ subtask" action.
- [ ] **R10 — Beta AI affordances** (S): shared `BetaBadge`; disabled "Draft with AI" / "Auto-fill from prompt" / AI summary actions.
- [ ] **R11 — Workstream UX** (M): Board tabs Sprint work | Ad-hoc | All (persisted); drawer toggle with sprint-removal note; List filter+column; bulk set-workstream; CSV Start+Workstream round-trip; workload split chip; automation invariant test.
- [ ] **R12 — Sprint view rows** (M): expanded chips → rows with inline status select + quick-assign + priority/points; sprint goal inline edit; per-sprint filters.
- [ ] **R13 — List column chooser** (S): visibility toggles incl. Workstream/Start, persisted.
- [ ] **R14 — Release readiness on Reports** (S): readiness per open milestone (done/total of tickets with dueDate ≤ milestone date, windowed) + completed-vs-pending donut on the Reports tab.

**Sequencing**: R0 → R1 → {R2, R3, R6, R9, R11} → R4 → R5 → R7 → R8 → R10/R12/R13/R14.
**Cut order if scope tightens**: R13 → template hook in R9 → subtask counts → dependency arrows → unscheduled tray → quick-assign in R12. Never cut: R1, R2, R4–R8, R11.

## Explicitly deferred (with reasons)
- **All AI features** → after Phase 5 (owner decision). Affordances only.
- **Gantt row virtualization** → cap 1000 + notice until real projects approach it.
- **Per-sprint configurable columns** → replaced by List column chooser + richer sprint rows.
- **Ticket↔milestone linkage table** → date-window heuristic answers "ready by the date?" without schema churn.
- **Cumulative flow diagram** (3.3 R3) → still deferred; revisit with the Phase-4 digest.

## Risks
- **Gantt drag/timezone math** → isolated in pure UTC-only `lib/gantt.ts`, unit-tested before any UI exists.
- **Landing switch breaking deep links** → legacy ticket route retained + repo-wide grep + verify matrix.
- **Enum migration on live data** → additive with default (same pattern as 3.4's notification enums).
- **Invalidation storms** as more views subscribe to WS → acceptable at current scale; batching noted for later.

## Guardrail
Feedback-driven ≠ scope-free: anything that grows past its size box (especially Gantt) gets its interactive tail split into a follow-up rather than blocking the phase.
