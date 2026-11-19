# Backlog

Ideas, deferred features, bugs noticed in passing, and chores that aren't drafted yet.

- **Any role may add a line:** append it to the right section with an ID, a source and a date.
- **Product Planning triages it:** turn an entry into a phase draft (copy [the template](../../workflow/templates/work-item.md)), merge duplicates, or drop it after asking the owner.

Every entry here is at Stage `idea`. Priority lives on [BOARD.md](../../../BOARD.md), not in this list.

## Bugs & correctness

| ID | Item | Source | Added |
|---|---|---|---|
| B1 | Deleting a ticket leaves its dependency rows behind (dangling "blocked by" links). "Delete" archives the ticket, so it still shows as a blocker. **→ Promoted to [3.6-b](phase-3.6-b-loose-ends.md) on 2026-11-19.** | Noticed during 3.8.4 | 2026-07-16 |
| B2 | The drawer's collapsed Relationships header never shows the blocked badge, because `api.getTicket` returns no blocker count. **→ Promoted to [3.6-b](phase-3.6-b-loose-ends.md) on 2026-11-19.** | Noticed during 3.7.2 | 2026-07-07 |
| B3 | Line 21 of `sourcecode/apps/api/src/services/ai.prompts.ts` says the subtasks and quick-parse prompts exist; only sprint-goal does. Fix it when 3.8.3 lands. **→ In [3.8.3-t1](../3-building/phase-3.8.3-t1-ai-subtasks.md) step S1 (2026-11-19).** | Restructure audit | 2026-11-19 |
| B4 | A network blip during a token refresh (Keycloak briefly unreachable) shows the "Session expired" prompt, though the session may still be fine. keycloak-js rejects but keeps the token in that case. Retry once while `keycloak.token` is still set (`sourcecode/apps/web/src/lib/auth.ts`, `onTokenExpired`; also the 401 path in `lib/api.ts`). Recoverable today: "Log in again" signs straight back in. | 3.8.8 review nit #4 | 2026-11-19 |
| B5 | At 375 px the board page's project header row (back link, All/Sprint/Ad-hoc, Board/List, My tickets, Sprints, Reports) is about 650 px wide, so the whole page overflows sideways and fixed layers (prompts, dialogs) centre in the wider layout, partly off-screen. Fits 3.6-b's phone check. | 3.8.8 test | 2026-11-19 |
| B6 | The shared primary `Button`'s focus ring is 1 px in the same blue as the button, so `:focus-visible` is barely visible on primary buttons (CLAUDE.md asks for a visible ring). | 3.8.8 test | 2026-11-19 |
| B7 | "Delete ticket" in the drawer (`TicketDrawer.tsx`, `remove()`) asks with a native `window.confirm`, not the product's inline two-click confirm. | 3.8.8 test | 2026-11-19 |

## Features (deferred or requested)

| ID | Item | Source | Added |
|---|---|---|---|
| F1 | Attachments on tickets and comments. Needs file storage; locally a MinIO container can stand in for S3. | 3.2 C4 (deferred) | 2026-07-02 |
| F2 | Cumulative flow diagram on Reports. | 3.3 R3 (deferred) | 2026-07-04 |
| F3 | Recurring tickets. | 3.4 W5 (deferred) | 2026-07-03 |
| F4 | BYOK: an organization brings its own AI key (encrypted key storage + a settings screen). Earmarked "Phase 3.8.2"; no spec yet. | 3.8 / 3.8.1 | 2026-07-11 |
| F5 | Dependency types (finish-to-start, start-to-start, …) and a scheduling engine for the Timeline. | Beta doc DEF-1 | 2026-07-16 |
| F6 | Jira integration (import, or two-way sync). The GitHub half of the beta request is already Phase 5's scope, so it was dropped from this line as a duplicate (2026-11-19). | Beta doc DEF-2 | 2026-07-16 |
| F7 | AI daily standup, and an AI-written version of the "Needs attention" digest. | Beta doc DEF-3; 3.8.6 | 2026-07-24 |
| F8 | Full Jira-style board restructure, only if the owner finds the scoped Board lacking (decision 5 on BOARD.md keeps it as is). | 3.8.6 DEC-1 | 2026-07-24 |
| F9 | Social sign-in end to end: register the Google / Microsoft / GitHub OAuth apps (owner), put the keys in `.env`, verify the round trip on localhost. See `docs/reference/13-social-login-setup.md`. | 1, 2.8.5 | 2026-06-26 |
| F10 | Keep an unsent draft (a comment, a description, a new ticket) across the session-expired "Log in again" round trip, for example in `localStorage`, restored after sign-in. Today the re-login reloads the page and the draft is lost; the prompt's copy says changes can't be saved. | 3.8.8 test (AC1 repro), Developer | 2026-11-19 |

## Tech debt & docs

| ID | Item | Source | Added |
|---|---|---|---|
| T1 | `docs/reference/*` still describe the original plan in places (AgentPM name, `agentpm.io`, RDS/managed data, SES). Refresh each file the next time its area is touched. | Restructure audit | 2026-11-19 |
| T2 | `docs/product/features.md` still says "PMAgent" in its body after the rebrand to "PmAgent" (3 places). A one-minute fix for whichever item next edits `features.md`. **→ In [3.8.3-t1](../3-building/phase-3.8.3-t1-ai-subtasks.md) step S3 (2026-11-19).** | Restructure audit | 2026-11-19 |
| T3 | Old verification debt from 2.1: silent sign-in on hard refresh (C9), drag-reorder feel within a column (C10), the mention → notification chain. Probably fine; confirm in a Tester regression pass. | 2.1 | 2026-06-24 |
| T4 | `docs/product/overview.md` still describes the original MVP and pricing. | Restructure audit | 2026-11-19 |
| T5 | The offline AI eval (`pnpm --filter @agentpm/api ai:eval`) only has fixtures for draft / expand / summary. `--endpoint sprintGoal` already crashes on `fixtures[ep].length`, and the 3.8.3-t1 `subtasks` and X1 `quickParse` entries won't be covered either. Add fixtures, or skip endpoints that have none. | PM, 3.8.3-t1 check | 2026-11-19 |
| T6 | e2e: `core-flow.spec.ts` never runs, because its file-level `test.skip(!process.env.E2E_USER2, …)` skips the whole file, not just the second-user test. And each `a11y.spec.ts` run leaves an "A11y Org <stamp>" org behind (the e2e user has 18 leftover test orgs). Scope the skip to the mention test, and delete the throwaway org at the end of the a11y spec. | 3.8.8 test | 2026-11-19 |
| T7 | The comment at line 49 of `sourcecode/apps/web/src/lib/auth.expiry-timer.test.ts` says no refresh happens before the first expiry. In fact `init({ token, refreshToken, checkLoginIframe: false })` refreshes once inside `init()`, and that refresh arms the timer. The test is still valid; reword the comment when the file is next touched. | 3.8.8 re-review nit #6 | 2026-11-19 |

## DevOps (local)

| ID | Item | Source | Added |
|---|---|---|---|
| D1 | Stale branches: `ci/deploy-ai-env` and `fix/ci-ratelimit-hermetic` (local + remote), plus 10 Dependabot branches/PRs waiting for triage. | Restructure audit | 2026-11-19 |
| D2 | Dev-database leftovers: the demo org "Northwind Apps" (safe to delete) and a stray "tes" milestone in Oracle → New. | 3.7.1 guide, 3.8.4 | 2026-07-16 |
| D3 | Make the deploy job in `.github/workflows/deploy.yml` manual-only (or skip it while prod is parked), so a merge to `main` doesn't try to deploy. Needed before anything merges to `main` again. | Restructure audit | 2026-11-19 |
| D4 | Make the Playwright e2e + a11y suite a standard local Tester step, then wire it into CI later. | 3.7.4 follow-up | 2026-07-08 |
