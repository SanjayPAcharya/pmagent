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

```typescript
// Ticket routes (Phase 2)
describe('POST /api/tickets', () => {
  it('creates ticket with all required fields')
  it('rejects ticket without projectId')
  it('rejects ticket without title')
  it('assigns sequential ticket number per project')
  it('returns 403 if user not project member')
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
