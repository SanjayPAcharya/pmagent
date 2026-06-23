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
Phase 2  PM Core                        → tickets, kanban board, sprints, real-time (WebSocket)
   │
Phase 3  Dev Deployment + CI/CD         → Docker, GitHub Actions, managed data, deploy to dev/staging
   │
Phase 4  GitHub Integration + Code Agent→ GitHub App, repo linking, queue/worker, Code Agent → PR
   │
Phase 5  Notifications + Channels       → email (SES), then WhatsApp + Slack two-way
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

### `phases/` — sequential build work
| Phase | File | Goal |
|---|---|---|
| 1 | [phase-1-skeleton-auth-platform.md](phases/phase-1-skeleton-auth-platform.md) | Frontend + backend skeleton, Keycloak login + self-signup (Google/Microsoft/GitHub), create the platform (orgs & projects) |
| 2 | [phase-2-pm-core.md](phases/phase-2-pm-core.md) | Tickets, kanban board, sprints, real-time updates |
| 3 | [phase-3-dev-deployment-cicd.md](phases/phase-3-dev-deployment-cicd.md) | Basic deployment to dev/staging with CI/CD |
| 4 | [phase-4-github-code-agent.md](phases/phase-4-github-code-agent.md) | Third-party integration: GitHub App + Code Agent → PR |
| 5 | [phase-5-notifications-channels.md](phases/phase-5-notifications-channels.md) | Email notifications, then WhatsApp + Slack |
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
