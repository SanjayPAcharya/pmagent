# Phase 3.6 — Polish, hardening & carried-over hygiene

> **Status: 🔨 IN PROGRESS** (opened 2026-07-03; Part B underway 2026-07-04). A deliberate consolidation pass: finish the 3.5 hygiene items that were paused, then walk back through everything shipped in the 3.x arc (org/project redesign, 3.1 PM depth, 3.2 collaboration, 3.4 workflow, 3.5 settings) and close the loose ends before starting Phase 4. **No new feature surface** beyond the carried-over 3.5 work — this phase makes what exists feel finished.

## Why 3.6 exists
The 3.x track shipped fast and broad. A focused polish phase (a) prevents small rough edges from compounding, (b) adds the test coverage the frontend never got, and (c) lands the remaining pre-launch hygiene. This is the last stop before the notification-channels / agent work.

---

## Part A — Carried over from 3.5 (paused there)

### A1. Error monitoring *(was 3.5 H3)* — **M**
Sentry (or self-hosted GlitchTip to stay in the Docker ethos) in api + web; release tag from the CI SHA; alert on new issues. **Blocked on:** a DSN / monitoring backend from the owner. Follows `references/08-monitoring.md`.

### A2. Soft plan limits *(was 3.5 H4)* — **S–M**
Enforce FREE limits server-side (e.g. 3 projects, 10 members / org) with a friendly 402-style error + an upgrade hint in the UI. No billing — just the seam so Stripe can slot in later without schema churn. Self-contained; good to do first of the three.

### A3. Personal access tokens + webhooks *(was 3.5 H5)* — **L**, Phase-5 prerequisite
`ApiToken { userId, hash, scopes, lastUsedAt }` + `Webhook { orgId, url, secret, events }`; token auth path alongside Keycloak JWT; webhook delivery on `ticket.*` events (reuse the event bus). The bridge the GitHub agent (Phase 5) stands on — schedule right before Phase 5.

---

## Part B — Polish loose ends (audit of shipped 3.x work)

### Consistency & discoverability
- ✅ **Settings entry points** *(2026-07-04)* — gear + "Settings" leaf added to the workspace tree at both levels (org: under Members; project: under Board/Sprints). The header link and ⋯ menu stay as secondary entries. Browser-verified.
- ✅ **Templates first-run hint** *(2026-07-04)* — empty-state copy now explains what templates do before offering "Add starter templates"; card also gained a loading skeleton. (Auto-seeding on project create not needed — org create already seeds.)
- ✅ **Empty/loading states** *(2026-07-04)* — `OrgSettings` and `ProjectSettings` render skeleton cards while their queries load (previously a blank form flash). MyWork/Dashboard/OrgProjects/tree already had skeletons — audited, no change needed.

### Edge cases & data
- ✅ **CSV import labels + assignee** *(2026-07-04)* — `mapRows` now maps a Labels column (`;`-separated, matching the export's join) and an Assignee column (aliases: assignee / assigned to / owner). The import endpoint resolves label names case-insensitively within the org and the assignee by member email or exact display name — unknowns are silently dropped so a half-matching file still imports. Sample CSV exercises both columns. Covered by web unit tests + a workflow API test.
- **Delete flows** — after deleting an org/project, confirm the sidebar tree, breadcrumbs, and any cached accent (`useOrgAccent`) all clear; no stale nav.
- ✅ **W3 automation vs. the plan** *(2026-07-04)* — 3.4 doc reconciled: the shipped trio is documented as-is, and the draft's "IN_REVIEW → notify watchers" is noted as dropped (watchers already get `ticket.updated` on every transition).
- ✅ **subtasksDoneNudge verified** *(2026-07-04)* — new pipeline test in `workflow.test.ts`: toggle on → closing the first of two subtasks does NOT fire; closing the last fires exactly one `SUBTASKS_DONE` notification to the parent's audience (actor excluded).

### Notifications
- ✅ **Per-type icons + labels in the bell** *(2026-07-04)* — `TYPE_META` map in `NotificationBell` (lucide icon + i18n label per `NotificationType`, incl. `TICKET_UNBLOCKED` → Unlock and `SUBTASKS_DONE` → ListChecks; unknown/future types fall back to the bell icon). Each feed row now shows the icon and a "Label · time" footer. Browser-verified on the dev stack.

### Mobile & accessibility
- ✅ **Comment reactions tap-reachable** *(2026-07-04)* — the "+🙂" button is now always visible at 50% opacity (full on hover/focus/comment-hover) instead of `opacity-0` until `group-hover`, so touch users can react to a comment with no reactions yet.
- Audit the new surfaces (BulkBar, DangerZone, CsvTools, settings, ticket-drawer wide mode) on a phone: tap targets, the drawer's two-column mode, the floating bulk bar over the mobile nav.
- a11y sweep: labels/roles on the new dropdowns, checkboxes, and the color picker.

### i18n & copy
- ✅ **Orphan/missing key sweep** *(2026-07-04)* — scripted diff of `en.json` vs. `t('…')` usage. Fixed the one real missing key: `board.clearFilters` rendered raw on the list view (browser-verified fixed). Removed 6 true orphans (`common.any`, `landing.tagline`, `projects.backToOrgs`, `projects.title`, `drawer.description`, `sprints.removed`). Dynamic-key groups (`onboard.*`, `theme.*`, `sprints.unit.*`) confirmed in use via template keys — kept.
- ✅ **Copy casing** *(2026-07-04)* — settings back-links normalized to sentence case ("← Projects", "← Board").

### Testing
- ✅ **Web test runner** *(2026-07-04)* — Vitest + jsdom in `apps/web`, `vitest run` wired into `pnpm turbo test` (unit tests live in `src/**/*.test.{ts,tsx}`; Playwright keeps `e2e/`). 17 tests: `lib/csv.ts` round-trip, `mapRows` (sample CSV, Jira aliases, skip/cap/enum edge cases), automation defaults (logic extracted to pure `lib/automationSettings.ts`, mirroring the server), favorites store. Frecency deferred — cover it when that logic next changes.
- ✅ **API gaps** *(2026-07-04)* — tests added for `DELETE /api/orgs/:slug` (OWNER-only), `DELETE /api/projects/:projectId` (ADMIN-only, MEMBER 403) and the caller `role` on `GET /api/orgs/:slug`. Suite 54/54.

### Performance / correctness nits
- Confirm the org/project list `stats` queries stay cheap as data grows (they're grouped, but re-check the N+1 boundary).
- Double-check optimistic updates + query invalidation keys are consistent across the new mutations (settings saves, template create, reactions, bulk).

---

## Suggested order
1. **Testing scaffold** (web Vitest + the API delete/role tests) — do this first so the rest of the polish is guarded.
2. **Quick consistency/UX nits** (settings entry points, empty/loading states, reaction touch fix, notification icons).
3. **Edge cases** (CSV labels, delete-flow cleanup, W3 reconcile + subtasks verify).
4. **A2 plan limits**, then **A1 monitoring** (when a DSN exists), then **A3 tokens/webhooks** right before Phase 5.

## Guardrail
This is polish, not scope growth. Anything that turns into a real new feature gets its own phase.
