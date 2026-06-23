# Reference: Product Overview & Scope

> Stable reference. Read once for orientation. Source: §1 of the original plan.

## What we are building

**AgentPM** is an AI-agent-first project management platform for software teams. It unifies:

- A full PM board (kanban + sprint view) replacing JIRA/Linear
- AI agents (Spec, Code, QA, Deploy, Observability) that execute tickets autonomously
- A graduated autonomy system (human-in-the-loop → full auto, per phase)
- Two-way communication channels (WhatsApp, Email, Slack)
- A complete deploy pipeline from ticket → PR → staging → canary → production

## MVP scope

The earliest shippable product (Phases 1–4 in this folder's sequencing) must ship these and nothing else:

1. User auth via Keycloak — self-signup + social login (Google, Microsoft, GitHub)
2. Organization + project creation
3. Ticket CRUD with structured schema (goal, acceptance criteria, priority, dependencies)
4. Kanban board + sprint view
5. GitHub repository linking
6. Code Agent: assign ticket → agent reads repo → opens PR → PR linked to ticket
7. Agent activity feed (real-time via WebSocket)
8. Human approval gates (per phase transition)
9. Basic email notifications

**Deliberately NOT in the MVP:** WhatsApp, QA Agent, Deploy Agent, Observability Agent, multi-agent coordination, autonomous sprints. (These land in Phases 5–7.)

## Non-goals for MVP

- Mobile apps (responsive web only)
- Multi-repo per ticket
- Self-hosted option
- Custom agent training
- JIRA/Linear import (post-MVP)

## Target user

5–15 engineer startups already using GitHub, comfortable with AI tools, frustrated with JIRA overhead. Willing to pay $49/seat/month if it ships faster.
