# Phase 3.6-b — Loose ends: delete cleanup, blocked-state bugs, phone + accessibility check

> **Stage:** `pm-review` · **Next role:** Product Manager · **Branch:** — · **Size:** M (≈ 4–5 build steps)
> The first piece of the [3.6 split](phase-3.6-polish-hardening.md#split-2026-11-19). It comes after 3.8.3 T1 and X1 (decision 6 on BOARD.md). It gathers the open Part B items of 3.6 plus backlog bugs B1 and B2.

## 1. Why — *Product Planning*
- **Problem:** a few features that have already shipped still have rough edges:
  - After an org or project is deleted, the 3.6 audit never confirmed that the sidebar tree, breadcrumbs and the org's accent colour clear straight away. If they don't, people see something that no longer exists.
  - "Delete" on a ticket archives it, and it can be restored. An archived ticket still shows as "blocked by" on the tickets it was blocking (backlog B1), so the blocked warning is wrong.
  - The ticket drawer's Relationships header never shows the blocked badge when it's collapsed, because the ticket API doesn't return a blocker count (backlog B2).
  - The newer surfaces (bulk bar, danger zone, CSV tools, org and project settings, the wide ticket drawer) were never checked on a phone or with a screen reader.
- **Who benefits:** everyone who uses the app daily, especially people who rely on the blocked warnings, phone users, and keyboard or screen-reader users.
- **Goal:** what's already there feels finished. Nothing stale shows after a delete, and "blocked" is right everywhere it appears.
- **Success signal:**
  - The Tester deletes an org and a project and sees no trace of either anywhere, without reloading.
  - Archiving a blocker clears the blocked state on the tickets it blocked. Restoring it brings the link back.
  - The collapsed Relationships header shows the blocked badge.
  - At phone width (375px) the listed surfaces have no overlaps and are easy to tap.
  - The automated accessibility scan (the Playwright + axe setup from 3.7.4) reports no serious or critical issues on those surfaces.

## 2. Scope — *Product Planning*
- **In:**
  1. **Delete cleanup.** After deleting an org or a project, the sidebar tree, breadcrumbs, the cached accent colour, and any favourites or recents that point at it all clear straight away.
  2. **B1: archived blockers.** An archived ticket stops counting as a blocker everywhere the app shows "blocked". Keep the dependency link itself, so restoring the ticket brings the link back. A permanently deleted ticket's links already go with it (the database cascades), but confirm that.
  3. **B2: blocked badge.** The collapsed Relationships header in the ticket drawer shows the blocked badge.
  4. **Phone + accessibility check, time-boxed.** Cover the bulk bar (and how it sits over the mobile nav), danger zone, CSV tools, org and project settings, the drawer's two-column mode, and the newer dropdowns, checkboxes and colour picker. Fix the clear, small problems: tap targets, missing labels or roles, overlaps.
  5. **Two checks, fix only if broken:** whether the org/project list `stats` queries stay cheap as data grows (the N+1 risk), and whether the newer mutations (settings saves, template create, reactions, bulk actions) refresh the right cached data. The PM checks both while writing the ground truth. A real defect becomes a build step; otherwise the PM marks the check closed.
- **Out (non-goals):**
  - New features, or redesigning any surface.
  - Bigger accessibility or phone problems the check turns up. Each becomes a backlog line instead.
  - Dependency types and scheduling (backlog F5).
  - Making the Playwright accessibility suite a standard Tester step or a CI gate (backlog D4).
  - The other 3.6 pieces: plan limits (3.6-a2), the error-reporting hook (3.6-a1), API tokens and webhooks (3.6-a3a/b).
- **Open questions for the owner (⛔):** none.
  - Planning chose this default: an archived blocker is hidden but its link is kept, so a restore undoes it cleanly. The owner can change this before the PM starts.
- **Risks:**
  - **The check can grow.** Keep to the time-box and send anything bigger to the backlog.
  - **The blocked count appears in many places:** Board, List, Timeline, the drawer, and the "Needs attention" Overview from 3.8.6. Changing what counts as a blocker could break any of them, so the test plan should cover each one.
  - **Delete cleanup lives in client-side caches** (query cache, local stores). It's easy to miss one.
  - **Test data:** deleting an org or project needs throwaway data. The demo org "Northwind Apps" is already marked safe to delete (backlog D2), so testing org delete could retire it.

## 3. Ground truth — *Product Manager* (verified against the code on YYYY-MM-DD)
_Not started._

## 4. Acceptance criteria — *Product Manager*
_Not started._

## 5. Build steps — *PM writes · Developer ticks* (one step = one commit)
_Not started._

DevOps impact: _PM to fill in._

## 6. Test plan — *PM writes · Tester runs*
_Not started._

## 7. Review — *Reviewer*
_Not started._

## 8. Test report — *Tester*
_Not started._

## 9. Release — *DevOps*
_Not started._

## Handoff log

### 2026-11-19 · Product Planning → Product Manager
- **Did:**
  - Split 3.6 into five items with the owner (decisions 6–8 on BOARD.md).
  - Drafted this one, the first. It takes the open Part B items of 3.6 plus backlog bugs B1 and B2.
- **State:** docs only, on `dev`. A quick code read confirmed two things. Ticket "delete" sets `archivedAt` and `/permanent` hard-deletes (`routes/tickets.ts`). `TicketDependency` cascades on hard delete only (`schema.prisma`). Nothing was run.
- **Next role should:** this item is #2 in Pending. Pick it up after 3.8.3 (the top row). Then:
  1. Verify each In item against today's code. In particular, confirm whether the delete-cleanup problem actually happens (the 3.6 audit flagged it as unchecked, not as broken).
  2. Do the two "fix only if broken" checks (item 5) during the ground truth.
  3. Write the ACs, build steps and test plan.
- **Watch out for:**
  - B1's blocked count feeds several views (see Risks), so list every one of them in the ACs.
  - If the delete cleanup already works, drop that step and say so in the ground truth.
