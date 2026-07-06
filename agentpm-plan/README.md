# AgentPM — Implementation Plan (split & phased)

> **This folder is the single source of truth.** It started as a split of an earlier single-file spec, but has since evolved well beyond it (Keycloak SSO, all-Docker with Compose-on-VM + managed-data toggle, the 7-phase resequencing). The original single-file plan was removed to avoid stale, contradictory guidance. Content here is organized into a **practical build sequence** and **shared reference files** so that an LLM, an SDE, or a PM can load only what a given phase needs — not the whole spec every day.

---

## How to use this folder

- **Every day / per task:** open the **one phase file** you're working on. It is written to be self-contained for that slice of work.
- **When the phase file references a model, route, env var, or stack:** open the matching file in `references/`. These are stable specs that many phases share — load them on demand, not by default.
- **PMs:** read this README + the phase headers (Goal / Deliverables / Definition of Done). You don't need the code blocks.
- **LLMs:** the phase file + the reference files it links to are the complete context for generating that phase's code. Do not load other phases.

---

## Build flow (re-sequenced)

This re-sequences the original plan into the order things should actually be built: **stand up the platform skeleton + login first, layer the PM core second, get it deploying to dev with CI/CD third, then third-party integrations and agents.**

```
Phase 1  Skeleton + Auth + Platform     → app shell, Keycloak login/signup (Google/Microsoft/GitHub), orgs & projects
   │
Phase 2  PM Core                        → tickets, kanban board, sprints, real-time, in-app notifications, invites
   │
Phase 2.1 Gap closure                   → 11 drawer/board/UX gaps found verifying Phase 2 (labels API, mention picker, invite UI, reorder)
   │
Phase 2.5 UX Hardening                  → dark mode, i18n, mobile, Cmd-K, Playwright E2E (after Phase 2 is verified)
   │
Phase 2.6 UX Delight                    → readiness rings, undo, confetti, palette power, ticket presence, burndown, accent/theme
   │
Phase 2.8 Branding (pmagent)            → rename product + Keycloak sign-in to "pmagent" (display only); before deploy
   │
Phase 2.8.5 Auth UX (in-app OAuth)      → Google/Microsoft/GitHub buttons on our login screen; Keycloak brokers, no hosted page
   │
Phase 3  Dev Deployment + CI/CD         → Docker, GitHub Actions, managed data, deploy to dev/staging
   │
Phase 4  Notifications + Channels       → email (SES), then WhatsApp + Slack two-way
   │
Phase 5  GitHub Integration + Code Agent→ GitHub App, repo linking, queue/worker, Code Agent → PR
   │
Phase 5.5 Agent-First Surfaces          → @agent mention/assignee, draft-with-agent, agent swimlane (UI for the Code Agent)
   │
Phase 6  Full Agent Suite + Autonomy    → Spec, QA, Deploy, Observability agents + autonomy dial
   │
Phase 7  Autonomous Sprints             → milestone → planned & shipped sprint, multi-agent coordination
```

> **Note on relationship to the original phasing:** the original document grouped work as Phase 1 = Foundation (incl. Code Agent), Phase 2 = Full Agent Suite, Phase 3 = Autonomous Sprints. This split breaks Foundation into smaller shippable slices (Phases 1–5 here) so login + platform land before agents, and dev deployment is in place early. Phases 6–7 here map to the original Phases 2–3. No technical content was dropped — it was redistributed.

---

## Index

### `references/` — shared specs (load on demand)
| File | What's in it |
|---|---|
| [00-product-overview.md](references/00-product-overview.md) | What we're building, MVP scope, non-goals, target user |
| [01-tech-stack.md](references/01-tech-stack.md) | Technology choices, architecture principles, region, ticket-execution data flow |
| [02-repository-structure.md](references/02-repository-structure.md) | Monorepo layout, pnpm workspaces, Turborepo |
| [03-data-models.md](references/03-data-models.md) | Full Prisma schema, enums, indexes |
| [04-api-reference.md](references/04-api-reference.md) | All REST route tables + validation pattern (quick map) |
| [05-environment-secrets.md](references/05-environment-secrets.md) | `.env.example`, Secrets Manager keys, secret loader |
| [06-security-checklist.md](references/06-security-checklist.md) | API, secrets, agent, data security checklists |
| [07-testing-strategy.md](references/07-testing-strategy.md) | Test stack, conventions, critical test cases |
| [08-monitoring.md](references/08-monitoring.md) | CloudWatch alarms, metrics, structured logging, Sentry |
| [09-cost-estimates.md](references/09-cost-estimates.md) | AWS + Anthropic monthly cost, path back to HA |
| [10-local-dev-and-github-app.md](references/10-local-dev-and-github-app.md) | Local dev setup, Docker Compose, GitHub App setup |
| [11-launch-checklist.md](references/11-launch-checklist.md) | Pre-launch checklist + ongoing operations |
| [12-docker-and-deployment.md](references/12-docker-and-deployment.md) | Full container topology, Dockerfiles, Compose (dev/prod), Caddy, deploy |
| [13-social-login-setup.md](references/13-social-login-setup.md) | Register Google/Microsoft/GitHub OAuth apps + wire creds into Keycloak (Phase 2.8.5) |

### `phases/` — sequential build work
| Phase | File | Goal |
|---|---|---|
| 1 | [phase-1-skeleton-auth-platform.md](phases/phase-1-skeleton-auth-platform.md) | Frontend + backend skeleton, Keycloak login + self-signup (Google/Microsoft/GitHub), create the platform (orgs & projects) |
| 2 | [phase-2-pm-core.md](phases/phase-2-pm-core.md) | Tickets, board, sprints, real-time, in-app notifications, invites, assignee/watchers/activity |
| 2.1 | [phase-2.1-gap-closure.md](phases/phase-2.1-gap-closure.md) | Gap closure — 11 drawer/board/UX items found verifying Phase 2 (labels API, mention picker, invite UI, within-column reorder, optimistic) |
| 2.5 | [phase-2.5-ux-hardening.md](phases/phase-2.5-ux-hardening.md) | Dark mode, i18n, mobile, Cmd-K, Playwright E2E (after Phase 2 verified) |
| 2.6 | [phase-2.6-ux-delight.md](phases/phase-2.6-ux-delight.md) | UX delight — readiness rings, undo, confetti, palette power, ticket presence, burndown, per-org accent + theme |
| 2.8 | [phase-2.8-branding.md](phases/phase-2.8-branding.md) | Branding — rename product + Keycloak sign-in to **pmagent** (display only; runs before Phase 3) |
| 2.8.5 | [phase-2.8.5-auth-ux.md](phases/phase-2.8.5-auth-ux.md) | Auth UX — Google/Microsoft/GitHub sign-in on the app's own screen (Keycloak brokers via `idpHint`, no hosted login page); email/password kept |
| 2.9.1 | [phase-2.9.1-deploy-config.md](phases/phase-2.9.1-deploy-config.md) | Deploy config reference — dev vs prod env files, infra to provision, mandatory vs deferrable for a testing deploy |
| 3 | [phase-3-dev-deployment-cicd.md](phases/phase-3-dev-deployment-cicd.md) | Basic deployment to dev/staging with CI/CD |
| 3.1 | [phase-3.1-pm-depth.md](phases/phase-3.1-pm-depth.md) | PM depth — global search, list/table view, my-work, ticket relationships (parent/deps), blocked badges, bulk actions |
| 3.2 | [phase-3.2-collaboration.md](phases/phase-3.2-collaboration.md) | Collaboration — @mention autocomplete UI, markdown rendering, comment reactions, attachments |
| 3.3 | [phase-3.3-insights-reporting.md](phases/phase-3.3-insights-reporting.md) | Insights — velocity trend, cycle time, cumulative flow, workload, per-project Reports tab |
| 3.4 | [phase-3.4-workflow-automation.md](phases/phase-3.4-workflow-automation.md) | Simple workflow — ticket templates, unblock nudges, fixed automation toggles, CSV import/export |
| 3.5 | [phase-3.5-platform-hygiene.md](phases/phase-3.5-platform-hygiene.md) | Hygiene — org/project **settings pages** (done); monitoring / plan limits / API tokens **moved to 3.6** |
| 3.6 | [phase-3.6-polish-hardening.md](phases/phase-3.6-polish-hardening.md) | Polish & hardening — carried-over hygiene (monitoring, plan limits, tokens/webhooks) + a loose-ends audit across the 3.x arc + the first web test scaffold |
| 3.7 | [phase-3.7-review-feedback.md](phases/phase-3.7-review-feedback.md) | Review-driven planning surfaces — project Overview dashboard (new landing), interactive Gantt + milestones, quick-create/inline-subtask, sprint-vs-ad-hoc workstreams, release readiness; AI asks deferred to Phase 5 (Beta affordances only) |
| 3.7.1 | [phase-3.7.1-gap-closure.md](phases/phase-3.7.1-gap-closure.md) | 3.7 gap closure from the 2026-07-06 audit — drawer Start date, milestone rename/delete UI, sprint-detail live sync, subtask chips (R9.4), List Due column (R13), Gantt mobile rail (R7.7) |
| 3.7.2 | [phase-3.7.2-ui-ux-polish.md](phases/phase-3.7.2-ui-ux-polish.md) | UI/UX polish from the 2026-07-06 UX audit — inline field validation, shared EmptyState, blocked badge → destructive token (+ dark-token fix), spinner busy feedback, bulk-archive confirm hardening, global :focus-visible; keeps PMAgent's own identity (no Jira/Monday cloning) |
| 4 | [phase-4-notifications-channels.md](phases/phase-4-notifications-channels.md) | Email notifications, then WhatsApp + Slack |
| 5 | [phase-5-github-code-agent.md](phases/phase-5-github-code-agent.md) | Third-party integration: GitHub App + Code Agent + agent-first UI |
| 5.5 | [phase-5.5-agent-first.md](phases/phase-5.5-agent-first.md) | Agent-first surfaces (@agent, draft-with-agent, agent swimlane) — **parked; lands with Phase 5** (was 2.7) |
| 6 | [phase-6-agent-suite-autonomy.md](phases/phase-6-agent-suite-autonomy.md) | Spec / QA / Deploy / Observability agents + autonomy dial |
| 7 | [phase-7-autonomous-sprints.md](phases/phase-7-autonomous-sprints.md) | Milestone → auto-planned & shipped sprint |

---

## Conventions used in every phase file

Each phase file follows the same header so it can be skimmed:

- **Goal** — one sentence.
- **Depends on** — which earlier phases / reference files must exist first.
- **References** — links into `references/`.
- **Deliverables** — the checklist (carried from the original build order).
- **Implementation detail** — code, schemas, contracts needed to build it.
- **Definition of Done** — how you know the phase is shippable.
