# Phase 3.8.6 — Batch 4: owner-decided direction (DEC-1 · DEC-2)

> **Status: ✅ DONE (2026-07-24) — committed on `dev` (not pushed).** Both DEC-1 and DEC-2 implemented & browser-verified live on Oracle → New; api 123/123 (+1 test), web 71/71, typechecks + vite build green. The two P1 items from the beta doc that required an owner decision before build. **Decisions made 2026-07-24:** DEC-1 → the **scoped Board** (smaller move; owner trials it before considering the full Jira restructure); DEC-2 → ship the **non-AI "Needs attention" Overview** now. Source: `~/Downloads/PMAgent-Beta-Requirements.pdf` §8 (findings 6/8/9/13 and 17).

## DEC-2 — Action-oriented "Needs attention" Overview (findings 17) — build first

Lead the project Overview with an actionable list instead of only charts/counts. Non-AI first cut; the AI-composed digest folds into the AI track later (pairs with DEF-3).

**Categories** (each item links straight to the ticket/milestone):
- **Blocked** — status BLOCKED or ≥1 open dependency (reuse `computeBlockers`).
- **Overdue** — `dueDate < today`, not DONE/CANCELLED, not archived.
- **Unassigned in the active sprint** — active-sprint tickets with no assignee, still open.
- **Milestones at risk** — `date < today`, not done, not fully complete (uses the Milestones v2 linked-ticket progress).

**API:** add `needsAttention` to the Overview payload — per category `{ items: capped 5, total }` + a grand `total` for the empty state. Keep the existing `blockers` field (tests + compat).
**Web:** a full-width **Needs attention** card at the top of `ProjectOverview`; four labelled groups, "+N more" when a category exceeds the cap, every row links; empty-state "You're all caught up". **Remove the standalone Blockers card** (folded into the Blocked group) so nothing is duplicated.
**Acceptance:** Overview leads with the list; every item links; empty-state friendly.

## DEC-1 — Scoped Board (findings 6/8/9/13) — build second

A Board that **defaults to the active sprint** when one is running, with a one-click **All** escape, so a first-time user sees "my current sprint" without discovering the filter. **Not** the full Jira restructure (Board-becomes-backlog) — the owner will trial the scoped move first and only ask for the restructure if it's insufficient.

**Web (`Board.tsx`):** a prominent scope control (segmented: `Active sprint · <name>` | `All`) near the workstream tabs — not buried in the multi-select `Sprint` filter the tester never found. Default to the active sprint when the project has one and the user hasn't overridden; persist the choice; reflect scope in the URL so deep links preserve it. When scope = active sprint, constrain the tickets query to that sprint id; **All** clears it. Drag/quick-create keep working.
**Acceptance:** with an active sprint the Board defaults to that sprint's tickets; switching scope is one click; deep links preserve scope.

## Out of scope
- Full Jira-style Board/backlog restructure (revisit only if the scoped Board proves insufficient).
- AI-composed "Needs attention" digest (AI track, with DEF-3).
- FEAT-1 inline List editing, FEAT-2 Timeline export — Batch 5, next phase.

## Conventions (same as 3.8.5)
One step = one commit; owner reviews & commits (Claude leaves work staged/uncommitted unless told otherwise). i18n via `t()`. After any `apps/api/src` edit: `docker compose restart api`. No schema change expected. Keep api + web suites green; add tests for the new `needsAttention` computation.
