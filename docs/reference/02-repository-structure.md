# Reference: Repository Structure

> Stable reference. The target monorepo layout — phases fill it in incrementally. Source: §3 of the original plan.

## Monorepo layout

Use **pnpm workspaces** as the monorepo manager, with **Turborepo** for build orchestration.

```
agentpm/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                  # Lint, test, type-check on every PR
│   │   ├── deploy-staging.yml      # Deploy to staging on merge to main
│   │   └── deploy-prod.yml         # Deploy to prod on release tag
│   └── CODEOWNERS
├── apps/
│   ├── web/                        # Vite + React 18 SPA frontend
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── components.json          # shadcn/ui CLI config
│   │   ├── src/
│   │   │   ├── main.tsx            # App entry: mounts React, Router, QueryClient
│   │   │   ├── App.tsx
│   │   │   ├── routes/
│   │   │   │   ├── router.tsx      # createBrowserRouter config
│   │   │   │   ├── auth/
│   │   │   │   │   ├── LoginPage.tsx
│   │   │   │   │   └── RegisterPage.tsx
│   │   │   │   ├── DashboardLayout.tsx   # protected layout (auth guard)
│   │   │   │   ├── DashboardHome.tsx
│   │   │   │   └── project/
│   │   │   │       ├── BoardPage.tsx       # /:orgSlug/:projectSlug/board
│   │   │   │       ├── SprintPage.tsx
│   │   │   │       ├── BacklogPage.tsx
│   │   │   │       ├── SettingsPage.tsx
│   │   │   │       └── TicketPage.tsx      # /:orgSlug/:projectSlug/ticket/:ticketId
│   │   │   ├── components/
│   │   │   │   ├── board/
│   │   │   │   │   ├── KanbanBoard.tsx
│   │   │   │   │   ├── TicketCard.tsx
│   │   │   │   │   ├── TicketDrawer.tsx
│   │   │   │   │   ├── SprintHeader.tsx
│   │   │   │   │   └── AgentActivityFeed.tsx
│   │   │   │   ├── agents/
│   │   │   │   │   ├── AgentStatusBadge.tsx
│   │   │   │   │   ├── AgentActionLog.tsx
│   │   │   │   │   └── ApprovalGate.tsx
│   │   │   │   └── ui/             # shadcn components (copied into repo)
│   │   │   ├── lib/
│   │   │   │   ├── api-client.ts   # Typed fetch wrapper for backend
│   │   │   │   ├── websocket.ts    # WS client + reconnect logic
│   │   │   │   └── auth.ts         # Token storage + auth context/helpers
│   │   │   └── hooks/
│   │   │       ├── useBoard.ts
│   │   │       ├── useTicket.ts
│   │   │       └── useAgentFeed.ts
│   │
│   └── api/                        # Fastify backend
│       ├── src/
│       │   ├── index.ts            # Server entry point
│       │   ├── config.ts           # Env + secrets loading
│       │   ├── db/
│       │   │   ├── client.ts       # Prisma client singleton
│       │   │   └── migrations/
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── organizations.ts
│       │   │   ├── projects.ts
│       │   │   ├── tickets.ts
│       │   │   ├── sprints.ts
│       │   │   ├── agents.ts
│       │   │   ├── webhooks/
│       │   │   │   └── github.ts   # GitHub webhook receiver
│       │   │   └── notifications.ts
│       │   ├── services/
│       │   │   ├── ticket.service.ts
│       │   │   ├── agent.service.ts
│       │   │   ├── github.service.ts
│       │   │   ├── notification.service.ts
│       │   │   └── sprint.service.ts
│       │   ├── queues/
│       │   │   ├── queue.client.ts # BullMQ setup
│       │   │   ├── agent.queue.ts
│       │   │   └── notification.queue.ts
│       │   ├── events/
│       │   │   └── event-bus.ts    # Redis pub/sub wrapper
│       │   ├── middleware/
│       │   │   ├── auth.middleware.ts
│       │   │   ├── ratelimit.middleware.ts
│       │   │   └── validate.middleware.ts
│       │   └── websocket/
│       │       └── ws-server.ts    # WS handler + room management
│       ├── prisma/
│       │   └── schema.prisma
│       └── package.json
│
├── packages/
│   ├── agents/                     # Agent runtimes (in-process via worker.ts)
│   │   ├── worker.ts               # BullMQ worker entrypoint — runs agents in-process
│   │   ├── shared/
│   │   │   ├── anthropic-client.ts
│   │   │   ├── github-client.ts    # GitHub App client (installation tokens)
│   │   │   ├── agent-logger.ts     # Writes AgentAction to DB
│   │   │   ├── db.ts
│   │   │   └── types.ts
│   │   ├── code-agent/
│   │   │   ├── index.ts            # runCodeAgent()
│   │   │   ├── repo-reader.ts
│   │   │   ├── code-generator.ts
│   │   │   └── pr-creator.ts
│   │   ├── spec-agent/             # Phase 6
│   │   ├── qa-agent/               # Phase 6
│   │   └── deploy-agent/           # Phase 6
│   │
│   ├── shared-types/               # TypeScript types shared across apps
│   │   ├── ticket.types.ts
│   │   ├── agent.types.ts
│   │   ├── user.types.ts
│   │   └── index.ts
│   │
│   └── notification-workers/       # Standalone notification consumers
│       ├── email.worker.ts
│       ├── slack.worker.ts
│       └── whatsapp.worker.ts      # Phase 4
│
├── infra/                          # AWS CDK v2
│   ├── bin/
│   │   └── agentpm.ts
│   ├── lib/
│   │   ├── agentpm-stack.ts
│   │   ├── database-stack.ts
│   │   ├── compute-stack.ts
│   │   ├── network-stack.ts
│   │   └── monitoring-stack.ts
│   ├── cdk.json
│   └── package.json
│
├── .env.example
├── pnpm-workspace.yaml
├── package.json
└── turbo.json
```

## Package manager setup

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "infra"
```

```json
// turbo.json
{
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "lint": {},
    "typecheck": {},
    "test": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```
