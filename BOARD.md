# PmAgent — Board

> **▶ Next session: `/pmagent-devops`.** The Tester passed 3.8.8 (§8, round 2). DevOps merges `feat/3.8.8-session-expiry` into `dev` (`--no-ff`), smokes it on the local stack, confirms the realm settings with kcadm, and closes the item. After that, 3.8.3-t1 is next in Ready (`/pmagent-dev`). Each session updates this line and tells you which command comes next.
>
> **Autopilot is on.** You do Planning; the Overview session wakes each role in turn from here ([how](docs/workflow/README.md#autopilot-the-overview-session)).
> **Waiting to push:** nothing yet.

The one place that says what's done, what's next, and who has the baton. **Every role session reads this first and updates its item's row when it hands off.** The four groups mirror the folders in [`docs/phases/`](docs/phases/). How the pipeline works: [docs/workflow/README.md](docs/workflow/README.md).

**Mode: local-only.** Everything runs in Docker on this machine. Prod and AWS deployment are parked (see the bottom of this page).

```
 1 Planning → 2 Product Manager → 3 Developer → 4 Reviewer → 5 Tester → 6 DevOps
 └──────── 1-pending ─────────┘ └ 2-ready ┘ └──────────────── 3-building ────────────┘ → 4-completed
```

Start each session with its command: `/pmagent-planning` · `/pmagent-pm` · `/pmagent-dev` · `/pmagent-review` · `/pmagent-test` · `/pmagent-devops`.

## 🔨 Building — [docs/phases/3-building/](docs/phases/3-building/)
*At most one item at a time.*

| Phase | Work item | Stage | Next role | Branch | Updated | Notes |
|---|---|---|---|---|---|---|
| 3.8.8 | [Session expiry & "Remember me"](docs/phases/3-building/phase-3.8.8-session-expiry.md) | `release` | **Product DevOps** | `feat/3.8.8-session-expiry` | 2026-11-19 | Test round 2: **Pass**. AC1's idle-tab repro now shows the prompt by itself 0.1 s after expiry, with no toast behind it. AC2–AC9 regression clean (VoiceOver not verified; AC6 by cookies and session flag). Suites: api 123/123, web 98/98, typecheck and build green, e2e a11y passed. Test data cleaned up; realm unchanged. |

## ✅ Reviewed — ready to build — [docs/phases/2-ready/](docs/phases/2-ready/)

| Phase | Work item | Size | Updated | Notes |
|---|---|---|---|---|
| 3.8.3-t1 | [AI suggests subtasks](docs/phases/2-ready/phase-3.8.3-t1-ai-subtasks.md) | M (3 steps) | 2026-11-19 | Checked against the code on 2026-11-19. 11 ACs, S1 API → S2 review logic → S3 drawer UI + guide. DevOps impact: none. Owner decisions recorded: the new subtasks copy only the parent's workstream, and their criteria are saved as plain bullets. Start it after 3.8.8 has merged (both touch `lib/api.ts` and `en.json`). |

## ⏳ Pending — [docs/phases/1-pending/](docs/phases/1-pending/)
*The top row is what the Product Manager picks up next. Planning owns the order (decision 1 below; the 3.6 part was revised by decisions 6–8).*

| # | Phase | Work item | Stage | Next role | Updated | Notes |
|---|---|---|---|---|---|---|
| 1 | 3.8.3-x1 | [Natural-language quick-add](docs/phases/1-pending/phase-3.8.3-x1-nl-quick-add.md) | `pm-review` | Product Manager | 2026-11-19 | Split out of 3.8.3 by the PM on 2026-11-19. The scope is carried over; §3–§6 aren't written yet. The PM writes them once T1 has merged, because T1 changes the same AI files. AI runs on Bedrock locally (decision 3). |
| 2 | 3.6-b | [Loose ends — delete cleanup, blocked-state bugs B1/B2, phone + a11y check](docs/phases/1-pending/phase-3.6-b-loose-ends.md) | `pm-review` | Product Manager | 2026-11-19 | First piece of the 3.6 split (decision 6). Size M. PM picks it up after 3.8.3. |
| 3 | 3.6-a2 | [Soft plan limits](docs/phases/1-pending/phase-3.6-polish-hardening.md#split-2026-11-19) | `draft` | Product Planning | 2026-11-19 | Free-plan caps with an "upgrade" hint, no billing. `Organization.plan` (FREE/PRO/TEAM) already exists. Still inside the 3.6 file; Planning gives it its own file next. |
| 4 | 3.6-a1 | [Error-reporting hook, off by default](docs/phases/1-pending/phase-3.6-polish-hardening.md#split-2026-11-19) | `draft` | Product Planning | 2026-11-19 | Re-scoped (decision 7): the error-reporting library in api + web, switched on only when a DSN is set. No account, no container. Size S. |
| 5 | — | [Backlog](docs/phases/1-pending/BACKLOG.md) | `idea` | Product Planning | 2026-11-19 | Deferred features, bugs noticed in passing, tech debt, DevOps chores. Planning turns the best into drafts. |
| 6 | 4 | [Notifications & channels](docs/phases/1-pending/phase-4-notifications-channels.md) | `draft` | Product Planning | 2026-11-19 | The plan assumes AWS SES; while prod is parked, use a local mail catcher. |
| 7 | 3.6-a3a | [Personal API tokens](docs/phases/1-pending/phase-3.6-polish-hardening.md#split-2026-11-19) | `draft` | Product Planning | 2026-11-19 | Moved to just before Phase 5 (decision 8). Size M. |
| 8 | 3.6-a3b | [Webhooks](docs/phases/1-pending/phase-3.6-polish-hardening.md#split-2026-11-19) | `draft` | Product Planning | 2026-11-19 | After 3.6-a3a (decision 8). Size M. Test locally against a receiver on this machine. |
| 9 | 5 | [GitHub integration + Code Agent](docs/phases/1-pending/phase-5-github-code-agent.md) | `draft` | Product Planning | 2026-11-19 | The product's headline feature. Needs 3.6-a3a and 3.6-a3b (API tokens + webhooks) first. |
| 10 | 5.5 | [Agent-first surfaces](docs/phases/1-pending/phase-5.5-agent-first.md) | `parked` | — | 2026-11-19 | Lands together with Phase 5. |
| 11 | 6 | [Full agent suite + autonomy](docs/phases/1-pending/phase-6-agent-suite-autonomy.md) | `draft` | Product Planning | 2026-11-19 | After Phase 5. |
| 12 | 7 | [Autonomous sprints](docs/phases/1-pending/phase-7-autonomous-sprints.md) | `draft` | Product Planning | 2026-11-19 | After Phase 6. |

## 🧑 Owner decisions

**Open: none.** When a role needs a decision, it adds a ⛔ row here and asks you in chat.

These were made on 2026-11-19 by Claude, at the owner's request ("you do these steps on your call"). To change one, just say so in any session.

| # | Decision | Why |
|---|---|---|
| 1 | **Order of work:** 3.8.8 session expiry → 3.8.3 T1 AI subtasks → 3.8.3 X1 natural-language quick-add → 3.6 polish (plan limits first) → Phase 4 → Phase 5. *The 3.6 part is replaced by decisions 6–8.* | Finish the half-built item first, then the AI features that are already designed, then hardening before the integrations. |
| 2 | **Session-expired screen:** keep the full-screen prompt. | A deliberate exception to "no modals", like ⌘K and the `?` help: once you're signed out nothing on the page can be saved, so one clear "Log in again" is the simplest honest answer. |
| 3 | **AI in local dev:** keep Amazon Bedrock with the dev key already set in `sourcecode/.env`. | It's wired up, costs pennies, and isn't a deployment. If the key stops working, AI features get built and tested against the mock provider, with live checks marked "not verified". Rotating the key is optional owner housekeeping. |
| 4 | **Production AI model (A5):** parked along with prod. | Local dev keeps Nova Micro. |
| 5 | **Scoped Board (DEC-1):** keep it as it is. | The full board restructure (backlog F8) reopens only if you find the scoped Board lacking. |

These were made by the owner on 2026-11-19, in the Planning session:

| # | Decision | Why |
|---|---|---|
| 6 | **3.6 is split into five items, and loose ends go first:** 3.6-b loose ends → 3.6-a2 plan limits → 3.6-a1 error-reporting hook. All three come after 3.8.3 X1. | Users notice the loose ends today. Plan limits only matter once there are paying customers. |
| 7 | **Error monitoring (3.6-a1) is a code hook only.** Add the error-reporting library, switched off unless a DSN is set. No Sentry account and no GlitchTip container for now. | On one machine, `docker compose logs` already shows errors. The hook lets Sentry or a self-hosted GlitchTip plug in later without code changes. |
| 8 | **API tokens + webhooks move to just before Phase 5,** after Phase 4, as two items: 3.6-a3a tokens, then 3.6-a3b webhooks. | Only the GitHub agent (Phase 5) needs them. |

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
| 3.8 | [AI ticket drafting on Amazon Bedrock](docs/phases/4-completed/phase-3.8-ai-tickets.md) | 2026-07-11 | Prod model choice parked (decision 4) |
| 3.8.1 | [AI polish: output quality + generation UX](docs/phases/4-completed/phase-3.8.1-ai-polish.md) | 2026-07-12 | Prod model choice parked (decision 4) |
| 3.8.3-s1 | [AI drafts the sprint goal](docs/phases/2-ready/phase-3.8.3-t1-ai-subtasks.md#background-s1-sprint-goal-shipped-2026-07-13) (recorded in the T1 file) | 2026-07-13 | T1 and X1 split out on 2026-11-19 |
| 3.8.4 | [Beta-feedback polish: 9 fixes](docs/phases/4-completed/phase-3.8.4-beta-polish.md) | 2026-07-16 | Dangling dependency rows → B1 |
| 3.8.5 | [Milestones v2](docs/phases/4-completed/phase-3.8.5-milestones-v2.md) | 2026-07-24 | — |
| 3.8.6 | [Scoped Board + "Needs attention" Overview](docs/phases/4-completed/phase-3.8.6-decisions.md) | 2026-07-24 | Kept as is (decision 5) |
| 3.8.7 | [Inline List editing + Timeline PNG/CSV export](docs/phases/4-completed/phase-3.8.7-features.md) | 2026-07-24 | — |
| — | Unphased work: Timeline polish TL1–TL5, shared FilterBar, CVE overrides, Buildenics rebrand | 2026-07-16 → 2026-08-06 | Details in the [archived log](docs/history/PROGRESS-until-2026-11-19.md) |

## 🅿️ Parked — prod & AWS (owner, 2026-11-19)
Don't work on these unless the owner unparks them.
- **Prod server:** a single EC2 box at `buildenic.com` / `api.` / `auth.`. Domains moved from `pmagent.sanjaykumarp.info` on 2026-07-28. It wasn't answering on 2026-11-19.
- **`main` is frozen.** A push or merge to `main` runs `.github/workflows/deploy.yml`, which tries to deploy to that server. Everything merges into `dev` only. Backlog D3 makes the deploy job manual-only before `main` is used again.
- **Never deployed:** `dev` is 9 commits ahead of `main` (3.8.6, 3.8.7, FilterBar, rebrand).
- **AWS hardening:** EC2 instance role, a $5 budget alert, rotating the dev Bedrock key, promoting the Caddy CSP from Report-Only.
- **Production AI model choice (A5):** Nova Micro vs Nova Lite vs Claude Haiku 4.5 (Haiku needs the Anthropic use-case form first). Revisit when prod is unparked.
- **To unpark:** start with [14-deploy-config.md](docs/reference/14-deploy-config.md) and [12-docker-and-deployment.md](docs/reference/12-docker-and-deployment.md).
