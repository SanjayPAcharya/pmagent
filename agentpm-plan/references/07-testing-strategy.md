# Reference: Testing Strategy

> Stable reference. Applies across all phases. Source: §14 of the original plan.

## Test stack

```
Unit tests:     Vitest (fast, native ESM)
Integration:    Vitest + real PostgreSQL (Docker) + real Redis
E2E:            Playwright (browser automation)
API testing:    Supertest (HTTP assertions on Fastify app)
Coverage:       Istanbul via Vitest
```

## Test file conventions

```
apps/api/src/routes/__tests__/tickets.test.ts   → integration tests for ticket routes
apps/api/src/services/__tests__/agent.service.test.ts
packages/agents/code-agent/__tests__/repo-reader.test.ts
apps/web/__tests__/e2e/board.spec.ts            → Playwright E2E
```

## Critical test cases

> **Phase 2 harness notes:** add `REDIS_URL` to `vitest.config.ts` env (buildServer now inits the event bus) and call `disposeEventBus()` in teardown; extend the `beforeEach` truncation to **every** new table in child→parent FK order (notification, ticketActivity, ticketWatcher, comment, ticketLabel, ticketDependency, ticket, sprint, label, orgInvite, orgMember, project, organization, user) or use `TRUNCATE … RESTART IDENTITY CASCADE`; reset the test DB when the `Project.key` backfill migration is introduced.

```typescript
// Ticket routes (Phase 2)
describe('POST /api/tickets', () => {
  it('creates ticket with all required fields')
  it('rejects ticket without projectId')
  it('rejects ticket without title')
  it('assigns sequential ticket number per project (atomic, no dup under concurrency)')
  it('returns 403 if user not project member')
  it('rejects a label/sprint/assignee/watcher from another org (400)')
})

describe('tickets list — search/filter/sort/pagination (Phase 2)', () => {
  it('paginates a known N-row set with no dupes/drops; nextCursor null at end')
  it('respects each whitelisted sort and rejects an unknown sort (400)')
  it('excludes archived tickets by default; includes with includeArchived=true')
})

describe('activity & realtime contracts (Phase 2)', () => {
  it('records TicketActivity on status/assignee/watcher/sprint change')
  it('publishes ticket.updated only after commit')
})

describe('notifications (Phase 2)', () => {
  it('returns 404 marking another user\'s notification read (caller-scoped, no IDOR)')
  it('@mention of a non-member produces no notification')
})

describe('org invites (Phase 2)', () => {
  it('accept adds an OrgMember at the invite role and is single-use')
  it('rejects expired/used token (uniform 404) and an OWNER invite from an ADMIN')
})

// WebSocket handshake (Phase 2) — real ws client against app.listen on an ephemeral port
describe('WS /ws', () => {
  it('closes 4001 if no auth within timeout')
  it('auth.ok on valid token + membership; 4001 on bad token / non-member')
  it('delivers publishEvent({projectId}) to a joined socket')
  it('delivers notification.new({userId}) only to that user\'s room')
})

// Agent assignment + concurrency (Phase 4)
describe('POST /api/tickets/:id/assign-agent', () => {
  it('enqueues BullMQ job with correct payload')
  it('updates ticket status to IN_PROGRESS and sets agentRunId')
  it('rejects if no GitHub repo linked')
  it('rejects with 409 if ticket already has an active agent')
  it('returns 409 for the loser when two assigns race (only one claim wins)')
  it('uses a deterministic jobId so a duplicate enqueue is a no-op')
  it('allows re-assignment after rollback (claim cleared, new agentRunId)')
})

describe('POST /api/tickets/:id/approve', () => {
  it('resolves pending approval record')
  it('transitions ticket to next phase')
  it('rejects if no pending approval exists')
  it('rejects if user has insufficient role')
  it('enforces prod deploy always requires human (even at autonomy level 2)')
})

// Code Agent (Phase 4)
describe('Code Agent - repo reader', () => {
  it('always includes README and package.json')
  it('scores files with matching keywords higher')
  it('respects token budget (never exceeds 80k tokens)')
  it('excludes node_modules')
})

describe('Code Agent - code generator', () => {
  it('parses valid JSON from Anthropic response')
  it('handles JSON wrapped in markdown code blocks')
  it('throws on unparseable response')
  it('includes PR title and description in output')
})

// Auth (Phase 1) — Keycloak-issued tokens; API is a resource server
describe('Auth middleware', () => {
  it('rejects an expired token')
  it('rejects a token with a tampered signature')
  it('rejects a token with the wrong audience (aud)')
  it('rejects a token from an unexpected issuer (iss)')
  it('JIT-provisions a User row on first valid token (keyed by sub)')
  it('reuses the existing User on subsequent requests from the same sub')
})
```

## Test database setup

File: `apps/api/src/test/setup.ts`

```typescript
import { execSync } from 'child_process'
import { prisma } from '../db/client'

beforeAll(async () => {
  // Run migrations on test DB
  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
  })
})

beforeEach(async () => {
  // Clean all tables (faster than migration rollback)
  await prisma.$transaction([
    prisma.agentAction.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.sprint.deleteMany(),
    prisma.project.deleteMany(),
    prisma.orgMember.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany()
  ])
})

afterAll(async () => {
  await prisma.$disconnect()
})
```
