# PmAgent — Board

The one place that says what's done, what's next, and who has the baton. **Every role session reads this first and updates its item's row when it hands off.** The four groups mirror the folders in [`docs/phases/`](docs/phases/). How the pipeline works: [docs/workflow/README.md](docs/workflow/README.md).

**Mode: local-only.** Everything runs in Docker on this machine. Prod and AWS deployment are parked (see the bottom of this page).

```
 1 Planning → 2 Product Manager → 3 Developer → 4 Reviewer → 5 Tester → 6 DevOps
 └──────── 1-pending ─────────┘ └ 2-ready ┘ └──────────────── 3-building ────────────┘ → 4-completed
```

Start each session with its command: `/role-planning` · `/role-pm` · `/role-dev` · `/role-review` · `/role-test` · `/role-devops`.

## 🔨 Building — [docs/phases/3-building/](docs/phases/3-building/)
*At most one item at a time.*

| Phase | Work item | Stage | Next role | Branch | Updated | Notes |
|---|---|---|---|---|---|---|
| 3.8.8 | [Session expiry & "Remember me"](docs/phases/3-building/phase-3.8.8-session-expiry.md) | `dev` | **Product Developer** | none yet (uncommitted on `dev`) | 2026-11-19 | Built 2026-08-06, never reviewed. Developer: put the work on a branch, settle ⛔2 with the owner, close the known gaps listed in the item, then hand to the Reviewer. |

## ✅ Reviewed — ready to build — [docs/phases/2-ready/](docs/phases/2-ready/)

| Phase | Work item | Size | Updated | Notes |
|---|---|---|---|---|
| — | *Empty. The Product Manager moves items here after checking them against today's code.* | | | |

## ⏳ Pending — [docs/phases/1-pending/](docs/phases/1-pending/)
*The top row is what the Product Manager picks up next. Planning owns the order; it stays tentative until the owner settles ⛔1.*

| # | Phase | Work item | Stage | Next role | Updated | Notes |
|---|---|---|---|---|---|---|
| 1 | 3.8.3 | [AI auto-populate — T1 subtasks, X1 natural-language quick-add](docs/phases/1-pending/phase-3.8.3-ai-autopopulate.md) | `pm-review` | Product Manager | 2026-11-19 | S1 (sprint goal) shipped 2026-07-13. The spec was checked against the code on 2026-07-12 and the code has moved since, so re-verify it and split T1 / X1 into separate items. Depends on ⛔3. |
| 2 | 3.6 | [Polish & hardening — plan limits, monitoring, API tokens + webhooks, loose ends](docs/phases/1-pending/phase-3.6-polish-hardening.md) | `draft` | Product Planning | 2026-11-19 | Part B is mostly done (2026-07-04). Part A needs re-scoping for local-first, e.g. self-hosted error monitoring instead of a Sentry DSN. |
| 3 | — | [Backlog](docs/phases/1-pending/BACKLOG.md) | `idea` | Product Planning | 2026-11-19 | Deferred features, bugs noticed in passing, tech debt, DevOps chores. Planning turns the best into drafts. |
| 4 | 4 | [Notifications & channels](docs/phases/1-pending/phase-4-notifications-channels.md) | `draft` | Product Planning | 2026-11-19 | The plan assumes AWS SES; while prod is parked, use a local mail catcher. |
| 5 | 5 | [GitHub integration + Code Agent](docs/phases/1-pending/phase-5-github-code-agent.md) | `draft` | Product Planning | 2026-11-19 | The product's headline feature. Needs 3.6 A3 (API tokens + webhooks) first. |
| 6 | 5.5 | [Agent-first surfaces](docs/phases/1-pending/phase-5.5-agent-first.md) | `parked` | — | 2026-11-19 | Lands together with Phase 5. |
| 7 | 6 | [Full agent suite + autonomy](docs/phases/1-pending/phase-6-agent-suite-autonomy.md) | `draft` | Product Planning | 2026-11-19 | After Phase 5. |
| 8 | 7 | [Autonomous sprints](docs/phases/1-pending/phase-7-autonomous-sprints.md) | `draft` | Product Planning | 2026-11-19 | After Phase 6. |

## 🧑 Owner decisions waiting (⛔)

| # | Decision | Blocks | Raised |
|---|---|---|---|
| ⛔1 | **Priority order** for the first pipeline runs. Suggested: finish 3.8.8 → 3.8.3 T1 → X1 → 3.6 plan limits. | Pending order | 2026-11-19 |
| ⛔2 | **Session-expired screen:** keep the full-screen modal (an exception to the "no modals" rule, since nothing works once you're signed out), or switch to an inline banner? | 3.8.8 | 2026-11-19 |
| ⛔3 | **AI in local dev:** it calls Amazon Bedrock with the dev key in `sourcecode/.env`. With AWS work parked, keep using it, switch provider, or leave AI off locally? (If you keep it, rotate that key first; it was briefly exposed in July.) | 3.8.3, any AI work | 2026-11-19 |
| ⛔4 | **Production AI model** (A5): stay on Nova Micro, move to Nova Lite (best value in the July A/B), or Claude Haiku 4.5 once the Anthropic use-case form is submitted? | AI quality | 2026-07-12 |
| ⛔5 | **Scoped Board trial** (DEC-1): is the "active sprint / all tickets" switch enough, or do you want the full Jira-style board restructure (backlog F8)? | F8 | 2026-07-24 |

## ✔ Completed — [docs/phases/4-completed/](docs/phases/4-completed/)

| Phase | What shipped | Done | Follow-ups |
|---|---|---|---|
| 1 | [Skeleton, Keycloak auth, organizations & projects](docs/phases/4-completed/phase-1-skeleton-auth-platform.md) | 2026-06-23 | Social sign-in apps → backlog F9 |
| 2 | [PM core: tickets, board, sprints, realtime, notifications, invites](docs/phases/4-completed/phase-2-pm-core.md) | 2026-06-24 | — |
| 2.1 | [Gap closure: 11 board and drawer items](docs/phases/4-completed/phase-2.1-gap-closure.md) | 2026-06-24 | Verification debt → T3 |
| 2.5 | [Dark mode, i18n, mobile, ⌘K palette, Playwright scaffold](docs/phases/4-completed/phase-2.5-ux-hardening.md) | 2026-06-24 | — |
| 2.6 | [UX delight: readiness rings, undo, presence, burndown, …](docs/phases/4-completed/phase-2.6-ux-delight.md) | 2026-06-25 | Agent items → 5.5 |
| 2.8 | [Branding "PMAgent"](docs/phases/4-completed/phase-2.8-branding.md) (superseded by the 2026-08-06 Buildenics rebrand) | 2026-06-27 | — |
| 2.8.5 | [In-app social sign-in buttons](docs/phases/4-completed/phase-2.8.5-auth-ux.md) | 2026-06-26 | Needs OAuth apps to verify → F9 |
| 3 | [Docker deployment + GitHub Actions CI/CD](docs/phases/4-completed/phase-3-dev-deployment-cicd.md) | 2026-07-01 | Prod now parked |
| 3.1 | [PM depth: search, list view, my work, relationships, bulk actions](docs/phases/4-completed/phase-3.1-pm-depth.md) | 2026-07-02 | — |
| 3.2 | [Collaboration: mentions, markdown, reactions](docs/phases/4-completed/phase-3.2-collaboration.md) | 2026-07-02 | Attachments → F1 |
| 3.3 | [Insights & reports](docs/phases/4-completed/phase-3.3-insights-reporting.md) | 2026-07-04 | Cumulative flow → F2 |
| 3.4 | [Workflow automation: templates, nudges, CSV import/export](docs/phases/4-completed/phase-3.4-workflow-automation.md) | 2026-07-03 | Recurring tickets → F3 |
| 3.5 | [Organization & project settings pages](docs/phases/4-completed/phase-3.5-platform-hygiene.md) | 2026-07-03 | The rest moved to 3.6 |
| 3.7 | [Overview, Timeline (Gantt), milestones, workstreams, release readiness](docs/phases/4-completed/phase-3.7-review-feedback.md) | 2026-07-05 | — |
| 3.7.1 | [3.7 gap closure](docs/phases/4-completed/phase-3.7.1-gap-closure.md) | 2026-07-06 | — |
| 3.7.2 | [UI/UX polish: the six product-wide UI standards](docs/phases/4-completed/phase-3.7.2-ui-ux-polish.md) | 2026-07-07 | Dormant blocked badge → B2 |
| 3.7.3 | [Archive & restore](docs/phases/4-completed/phase-3.7.3-archive-restore.md) | 2026-07-07 | — |
| 3.7.4 | [Compliance & security hardening](docs/phases/4-completed/phase-3.7.4-compliance-hardening.md) | 2026-07-08 | CSP enforce + a11y gate in CI (parked) |
| 3.8 | [AI ticket drafting on Amazon Bedrock](docs/phases/4-completed/phase-3.8-ai-tickets.md) | 2026-07-11 | ⛔4 |
| 3.8.1 | [AI polish: output quality + generation UX](docs/phases/4-completed/phase-3.8.1-ai-polish.md) | 2026-07-12 | ⛔4 |
| 3.8.4 | [Beta-feedback polish: 9 fixes](docs/phases/4-completed/phase-3.8.4-beta-polish.md) | 2026-07-16 | Dangling dependency rows → B1 |
| 3.8.5 | [Milestones v2](docs/phases/4-completed/phase-3.8.5-milestones-v2.md) | 2026-07-24 | — |
| 3.8.6 | [Scoped Board + "Needs attention" Overview](docs/phases/4-completed/phase-3.8.6-decisions.md) | 2026-07-24 | ⛔5 |
| 3.8.7 | [Inline List editing + Timeline PNG/CSV export](docs/phases/4-completed/phase-3.8.7-features.md) | 2026-07-24 | — |
| — | Unphased work: Timeline polish TL1–TL5, shared FilterBar, CVE overrides, Buildenics rebrand | 2026-07-16 → 2026-08-06 | Details in the [archived log](docs/history/PROGRESS-until-2026-11-19.md) |

## 🅿️ Parked — prod & AWS (owner, 2026-11-19)
Don't work on these unless the owner unparks them.
- **Prod server:** a single EC2 box at `buildenic.com` / `api.` / `auth.`. Domains moved from `pmagent.sanjaykumarp.info` on 2026-07-28. It wasn't answering on 2026-11-19.
- **`main` is frozen.** A push or merge to `main` runs `.github/workflows/deploy.yml`, which tries to deploy to that server. Everything merges into `dev` only. Backlog D3 makes the deploy job manual-only before `main` is used again.
- **Never deployed:** `dev` is 9 commits ahead of `main` (3.8.6, 3.8.7, FilterBar, rebrand).
- **AWS hardening:** EC2 instance role, a $5 budget alert, rotating the dev Bedrock key, promoting the Caddy CSP from Report-Only.
- **To unpark:** start with [14-deploy-config.md](docs/reference/14-deploy-config.md) and [12-docker-and-deployment.md](docs/reference/12-docker-and-deployment.md).
