# Phase 4 — Third-Party Integration: GitHub App + Code Agent

> **Goal:** The first AI agent. Connect a project to a GitHub repository via a GitHub App, then let a user assign a ticket to the **Code Agent**, which reads the repo, generates an implementation with the Anthropic API, opens a PR, and links it back to the ticket. Includes the job queue, the in-process worker, the approval gate, and PR-level rollback.

**Depends on:** Phase 1 (projects), Phase 2 (tickets + event bus + WebSocket), Phase 3 (deploys the agent worker).

**References:**
- [03-data-models.md](../references/03-data-models.md) — adds `AgentAction`, `Approval`, `Integration`, and uses ticket agent fields
- [04-api-reference.md](../references/04-api-reference.md) — assign-agent / approve / reject / rollback / agents routes
- [05-environment-secrets.md](../references/05-environment-secrets.md) — `ANTHROPIC_API_KEY`, `GITHUB_APP_*`, secret loader
- [10-local-dev-and-github-app.md](../references/10-local-dev-and-github-app.md) — GitHub App creation & permissions
- [06-security-checklist.md](../references/06-security-checklist.md) — agent security rules

---

## Deliverables

- [ ] Create the GitHub App (see [10-local-dev-and-github-app.md](../references/10-local-dev-and-github-app.md))
- [ ] `POST /api/projects/:projectId/github/connect` — repo linking + installation ID storage
- [ ] GitHub webhook receiver (PR events update ticket status; verify HMAC signature)
- [ ] Shared agent utilities (logger, GitHub client, Anthropic client)
- [ ] Repo reader (file tree + relevance scoring, token budget)
- [ ] Code generator (Anthropic API + JSON output parsing)
- [ ] PR creator (branch, commits, PR with description)
- [ ] BullMQ queue + concurrency guard (atomic claim + deterministic jobId)
- [ ] Agent worker process (consumes `agent-jobs`, runs `runCodeAgent` in-process)
- [ ] Worker deployment: the FargateService reserved in Phase 3's compute stack
- [ ] AgentAction logging + rollback (close PR + delete branch, reset ticket)
- [ ] Agent approval gate — server-side enforcement
- [ ] Frontend: "Assign to Code Agent", agent activity feed, approval gate UI, PR link

---

## Agent architecture

Each agent is a self-contained, stateless async function (e.g. `runCodeAgent(payload)`) — all state lives in PostgreSQL. It takes a job payload, executes, logs every step, and returns.

**Phase 4 execution:** agents run **in-process inside the BullMQ worker**. The worker pulls a job and calls the agent function directly — one long-lived worker process handles all runs, no per-run containers.

**Migration path (later):** because the agent is a pure function decoupled from how it's invoked, it can move into an isolated per-run ECS Fargate task (the container entrypoint calls the same function) without changing the agent logic. That isolation is introduced in Phase 6 alongside the QA Agent, which executes generated code.

---

## GitHub App client (token lifecycle)

Agents access customer repos through a **GitHub App**, not a personal token. The App is installed once per customer org (they pick which repos to allow). Installation tokens expire after ~1 hour, so the client authenticates as the App (App ID + private key → short-lived JWT), then requests a fresh installation token per call. `@octokit/auth-app` handles signing, fetching, and caching/refresh automatically.

File: `packages/agents/shared/github-client.ts`

```typescript
import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'

/**
 * Octokit client scoped to a single GitHub App installation.
 *   App private key + App ID  →  signed JWT
 *   JWT + installationId       →  short-lived installation token (~1h)
 * The strategy caches and transparently refreshes — callers never deal with expiry.
 * Secrets (loaded by the worker at startup): GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (PEM, base64-decoded)
 */
export async function getInstallationClient(installationId: string): Promise<Octokit> {
  const privateKey = Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY!, 'base64').toString('utf-8')
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: process.env.GITHUB_APP_ID!, privateKey, installationId }
  })
}

/** App-level client (no installation) — used only during the connect flow. */
export function getAppClient(): Octokit {
  const privateKey = Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY!, 'base64').toString('utf-8')
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: process.env.GITHUB_APP_ID!, privateKey }
  })
}
```

### Connect flow (`POST /api/projects/:projectId/github/connect`)

1. The user installs the AgentPM GitHub App on their org and selects allowed repos (GitHub's own install UI — AgentPM never sees their password).
2. GitHub redirects back with an `installation_id`. The connect endpoint verifies the installation can access the requested repo (app-level client), then saves `githubRepoOwner`, `githubRepoName`, and `githubInstallationId` on the `Project`.
3. From then on, every agent run loads `githubInstallationId` and calls `getInstallationClient(installationId)` for a fresh, repo-scoped client. The hourly refresh is invisible.

---

## Code Agent

File: `packages/agents/code-agent/index.ts`

```typescript
/**
 * CODE AGENT — invoked in-process by the BullMQ worker.
 * Reads ticket → reads repo → generates code → opens PR → updates ticket.
 * SECRETS REQUIRED: DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY
 */
import { createAgentLogger } from '../shared/agent-logger'
import { readRepoContext } from './repo-reader'
import { generateImplementation } from './code-generator'
import { createPullRequest } from './pr-creator'
import { prisma } from '../shared/db'

interface CodeAgentJobPayload {
  ticketId: string; jobId: string; branchName?: string; targetBranch?: string
}

export async function runCodeAgent(payload: CodeAgentJobPayload) {
  const logger = await createAgentLogger({
    ticketId: payload.ticketId, agentType: 'CODE', jobId: payload.jobId
  })

  try {
    await logger.step('LOAD_TICKET', 'Loading ticket and project context')
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: payload.ticketId },
      include: { project: true, dependencies: { include: { dependsOn: true } } }
    })

    if (!ticket.project.githubRepoOwner || !ticket.project.githubRepoName) {
      throw new Error('Project has no GitHub repository linked. Please connect a repository first.')
    }
    if (!ticket.project.githubInstallationId) {
      throw new Error('GitHub App is not installed for this repository. Please reconnect the repository.')
    }

    await logger.step('READ_REPO', 'Scanning repository structure and relevant files')
    const repoContext = await readRepoContext({
      owner: ticket.project.githubRepoOwner,
      repo: ticket.project.githubRepoName,
      defaultBranch: ticket.project.defaultBranch,
      installationId: ticket.project.githubInstallationId,
      ticket
    })

    await logger.step('GENERATE_CODE', 'Generating implementation plan and code')
    const implementation = await generateImplementation({ ticket, repoContext })

    await logger.step('CREATE_PR', 'Creating branch, committing code, opening PR')
    const pr = await createPullRequest({
      owner: ticket.project.githubRepoOwner,
      repo: ticket.project.githubRepoName,
      installationId: ticket.project.githubInstallationId,
      implementation, ticket,
      branchName: payload.branchName,
      targetBranch: payload.targetBranch || ticket.project.defaultBranch
    })

    await prisma.ticket.update({
      where: { id: payload.ticketId },
      data: {
        status: 'IN_REVIEW', prUrl: pr.html_url, prNumber: pr.number,
        branchName: pr.head.ref, agentPhase: 'REVIEW'
      }
    })

    await logger.complete({
      prUrl: pr.html_url, prNumber: pr.number,
      filesChanged: implementation.files.length,
      linesAdded: implementation.totalLinesAdded
    })
  } catch (error) {
    await logger.fail(error as Error)
    await prisma.ticket.update({
      where: { id: payload.ticketId },
      data: {
        status: 'BLOCKED',
        assignedAgentType: null,  // release the concurrency claim
        agentRunId: null          // allow a fresh re-assignment after the block is resolved
      }
    })
    throw error
  }
}
```

> On success the ticket stays `IN_REVIEW` with `assignedAgentType` still set — the agent "owns" the ticket until the PR is merged (manual in this phase) or rolled back, at which point the claim is cleared and the ticket becomes assignable again.

### Repo reader

File: `packages/agents/code-agent/repo-reader.ts`

```typescript
/**
 * Reads repo structure and selects relevant files for agent context.
 * 1. Full file tree (GitHub Trees API, recursive)
 * 2. Score every file by relevance to ticket title + description (heuristics)
 * 3. Read top N files (capped at ~80k tokens total)
 * 4. Always include: README, package.json, tsconfig, main entry points
 * Token budget: 80,000 tokens for repo context (leaves ~40k for output)
 */
import { getInstallationClient } from '../shared/github-client'
import type { Ticket } from '@prisma/client'

const ALWAYS_INCLUDE_PATTERNS = [
  'README.md', 'package.json', 'tsconfig.json', '.env.example',
  'prisma/schema.prisma', 'src/index.ts', 'src/app.ts', 'src/main.ts'
]
const MAX_FILES = 30
const MAX_TOKENS = 80_000

export async function readRepoContext({ owner, repo, defaultBranch, installationId, ticket }) {
  const octokit = await getInstallationClient(installationId)
  const { data: tree } = await octokit.git.getTree({ owner, repo, tree_sha: defaultBranch, recursive: '1' })
  const files = tree.tree.filter(f => f.type === 'blob' && f.path)
  const scored = scoreFiles(files, ticket)
  const selected = scored.slice(0, MAX_FILES)
  const contents = await readFilesWithBudget(selected, owner, repo, MAX_TOKENS)
  return { fileTree: files.map(f => f.path), files: contents, totalTokens: countTokens(contents) }
}

function scoreFiles(files, ticket) {
  const keywords = extractKeywords(ticket.title + ' ' + (ticket.description || ''))
  return files
    .map(file => ({ ...file, score: computeRelevanceScore(file.path, keywords) }))
    .sort((a, b) => b.score - a.score)
}

function computeRelevanceScore(path: string, keywords: string[]): number {
  let score = 0
  const pathLower = path.toLowerCase()
  if (ALWAYS_INCLUDE_PATTERNS.some(p => pathLower.endsWith(p.toLowerCase()))) score += 100
  keywords.forEach(kw => { if (pathLower.includes(kw)) score += 10 })
  if (pathLower.includes('/src/')) score += 5
  if (pathLower.endsWith('.ts') || pathLower.endsWith('.tsx')) score += 3
  if (pathLower.includes('.test.') || pathLower.includes('.spec.')) score -= 2
  if (pathLower.includes('node_modules')) score -= 100
  return score
}
```

### Code generator (Anthropic integration)

File: `packages/agents/code-agent/code-generator.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from env

export async function generateImplementation({ ticket, repoContext }) {
  const systemPrompt = `You are an expert software engineer implementing features in an existing codebase.
You will be given a ticket with a goal, acceptance criteria, and constraints, plus the current codebase context.

Your job:
1. Analyze the existing code structure and patterns
2. Generate a complete implementation that follows existing conventions
3. Include all necessary file changes (new files and edits to existing files)
4. Write tests for the new code following the project's testing patterns
5. Generate a clear PR description explaining what changed and why

Rules:
- Never break existing APIs or interfaces unless the ticket explicitly requires it
- Follow the exact code style, naming, and patterns you see in the existing files
- If you're uncertain about a design decision, implement the simplest correct version
- Every function must have TypeScript types
- Do not include placeholder comments like "// TODO: implement this"

Output format: You MUST return valid JSON matching the ImplementationOutput schema. No prose outside the JSON.`

  const userPrompt = `TICKET:
Title: ${ticket.title}
Goal: ${ticket.goal || 'Not specified'}
Description: ${ticket.description || 'Not specified'}
Acceptance Criteria:
${ticket.acceptanceCriteria || 'Not specified'}
Constraints: ${ticket.constraints || 'None'}

REPOSITORY STRUCTURE:
${repoContext.fileTree.slice(0, 200).join('\n')}

EXISTING FILES (most relevant to this ticket):
${repoContext.files.map(f => `
=== ${f.path} ===
${f.content}
`).join('\n---\n')}

Generate the implementation. Return ONLY valid JSON, no other text.`

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-latest',   // verify current model id via the claude-api skill before shipping
    max_tokens: 16000,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt
  })

  const text = response.content.find(b => b.type === 'text')?.text || ''
  let impl: ImplementationOutput
  try {
    impl = JSON.parse(text)
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]+?)```/)
    if (match) impl = JSON.parse(match[1])
    else throw new Error(`Agent returned invalid JSON: ${text.slice(0, 200)}`)
  }
  return impl
}

interface ImplementationOutput {
  reasoning: string
  files: FileChange[]
  prTitle: string
  prDescription: string
  totalLinesAdded: number
}
interface FileChange {
  path: string
  action: 'create' | 'modify' | 'delete'
  content?: string
  patch?: string
}
```

---

## Queue, concurrency guard & worker

### BullMQ queue

File: `apps/api/src/queues/agent.queue.ts`

```typescript
import { Queue, QueueEvents } from 'bullmq'
import { redisConnection } from './queue.client'
import { publishEvent } from '../events/event-bus'

export const agentQueue = new Queue('agent-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 }
  }
})

// Queue events → WebSocket broadcasts (every payload carries projectId)
const queueEvents = new QueueEvents('agent-jobs', { connection: redisConnection })

queueEvents.on('active', async ({ jobId }) => {
  const job = await agentQueue.getJob(jobId); if (!job) return
  await publishEvent('agent.started', {
    ticketId: job.data.ticketId, projectId: job.data.projectId,
    agentType: job.data.agentType, jobId
  })
})
queueEvents.on('completed', async ({ jobId, returnvalue }) => {
  const job = await agentQueue.getJob(jobId); if (!job) return
  await publishEvent('agent.completed', {
    ticketId: job.data.ticketId, projectId: job.data.projectId,
    agentType: job.data.agentType, result: returnvalue
  })
})
queueEvents.on('failed', async ({ jobId, failedReason }) => {
  const job = await agentQueue.getJob(jobId); if (!job) return
  await publishEvent('agent.failed', {
    ticketId: job.data.ticketId, projectId: job.data.projectId,
    agentType: job.data.agentType, reason: failedReason
  })
})

// Idempotent enqueue: deterministic jobId per (ticket, run). BullMQ ignores an
// add() whose jobId already exists, so a double-submit/retry can't create a
// second concurrent job. agentRunId rotates per fresh assignment.
export async function enqueueCodeAgent(payload: {
  ticketId: string; projectId: string; agentRunId: string
  branchName?: string; targetBranch?: string
}) {
  return agentQueue.add('run-code-agent', { agentType: 'CODE', ...payload },
    { jobId: `code-${payload.ticketId}-${payload.agentRunId}` })
}
```

### Concurrency guard (optimistic locking)

Two things must never happen: two agents on one ticket at once, and a duplicate/retry opening a second PR. The guard uses **optimistic concurrency** — a single atomic conditional update the DB arbitrates.

```typescript
import { randomUUID } from 'crypto'

export async function assignAgent(ticketId: string, body: AssignAgentBody) {
  const agentRunId = randomUUID()

  // Atomic claim: flip to IN_PROGRESS only if assignable. count===0 means lost the race.
  const claimed = await prisma.ticket.updateMany({
    where: {
      id: ticketId,
      status: { in: ['BACKLOG', 'TODO', 'BLOCKED'] },
      assignedAgentType: null
    },
    data: { status: 'IN_PROGRESS', assignedAgentType: body.agentType, agentRunId }
  })

  if (claimed.count === 0) {
    throw new ApiError(409, 'An agent is already assigned or running on this ticket.')
  }

  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: ticketId }, select: { projectId: true }
  })

  const job = await enqueueCodeAgent({
    ticketId, projectId: ticket.projectId, agentRunId,
    branchName: body.branchName, targetBranch: body.targetBranch
  })

  await publishEvent('ticket.updated', { ticketId, projectId: ticket.projectId })
  return { jobId: job.id!, agentRunId }
}
```

- **DB conditional update** is the source of truth — only one request transitions the ticket out of an assignable state, so only one job is enqueued; the loser gets a clean `409`.
- **Deterministic `jobId`** is a second net against double-fire / BullMQ retries.
- **`agentRunId`** rotates on each fresh assignment, so a legitimate re-run after rollback gets a new id while stale duplicates collide.

On completion/failure the agent clears `assignedAgentType` back to `null` (failure also sets `BLOCKED`), re-opening the ticket.

### Assign-agent API contract

```typescript
// POST /api/tickets/:ticketId/assign-agent
interface AssignAgentBody {
  agentType: 'CODE' | 'SPEC' | 'QA' | 'DEPLOY'
  branchName?: string    // default: agent/ticket-number-slug
  targetBranch?: string  // default: project.defaultBranch
}
// 202 Accepted (job queued):
interface AssignAgentResponse {
  jobId: string
  agentRunId: string
  message: string   // "Code agent queued. Watch the activity feed for progress."
  ticket: Ticket
}
// 409 Conflict: an agent is already assigned/running (atomic claim lost the race).
```

### Agent worker (in-process execution)

File: `packages/agents/worker.ts`

```typescript
import { Worker } from 'bullmq'
import { redisConnection } from '../../apps/api/src/queues/queue.client'
import { loadSecrets } from '../../apps/api/src/config'
import { runCodeAgent } from './code-agent'

/**
 * AGENT WORKER — long-lived process. Consumes `agent-jobs` and dispatches each
 * job to the right agent function, in-process. Bounded concurrency; each run is
 * wrapped so its failure can't crash the worker (BullMQ records + retries).
 * To graduate to isolated Fargate tasks later: replace the in-process dispatch
 * with an ECS runTask call. Agent functions stay identical.
 */
async function start() {
  await loadSecrets()  // writes secrets into process.env (see 05-environment-secrets.md)

  const worker = new Worker('agent-jobs', async (job) => {
    switch (job.data.agentType) {
      case 'CODE':
        return runCodeAgent({
          ticketId: job.data.ticketId, jobId: job.id!,
          branchName: job.data.branchName, targetBranch: job.data.targetBranch
        })
      // SPEC / QA / DEPLOY added in Phase 6
      default:
        throw new Error(`Unknown agentType: ${job.data.agentType}`)
    }
  }, {
    connection: redisConnection,
    concurrency: 3,                 // MVP cap
    lockDuration: 10 * 60 * 1000    // 10 min — agent runs are long
  })

  worker.on('failed', (job, err) => { console.error(`Agent job ${job?.id} failed:`, err) })
  console.log('Agent worker started (in-process execution)')
}

start().catch((err) => { console.error('Agent worker failed to start:', err); process.exit(1) })
```

**Deployment:** the worker is a separate long-lived process. Define the `AgentWorkerService` (`ecs.FargateService`) reserved in [phase-3](phase-3-dev-deployment-cicd.md)'s compute stack — it reuses the API image with `command: ['node', 'dist/worker.js']`, runs in a public subnet (no NAT) so it can reach Anthropic + GitHub, has no load balancer, and gets the `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `GITHUB_APP_PRIVATE_KEY` secrets. For the earliest MVP it may be folded into the API container to save ~$36/mo (see [09-cost-estimates.md](../references/09-cost-estimates.md)).

**Job lifecycle:** API enqueues + sets `IN_PROGRESS` → `QueueEvents` emits `agent.started` (WS) → worker runs `runCodeAgent()` → agent writes `AgentAction` + updates ticket (`IN_REVIEW`+PR on success, `BLOCKED` on failure) → `QueueEvents` emits `agent.completed`/`agent.failed` (WS) → notification workers fan out (Phase 5).

---

## Rollback (PR-level)

The only durable side effect an agent produces here is a GitHub PR. "Rollback" = **close the agent's PR, delete its branch, return the ticket to a clean state.** It does not touch releases/deployments — those are manual until the Deploy Agent (Phase 6). **Authorization: Admin+ only.**

`POST /api/tickets/:ticketId/rollback`:

```typescript
// services/ticket.service.ts
export async function rollbackTicket(ticketId: string, userId: string) {
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: ticketId }, include: { project: true }
  })

  if (!ticket.prNumber || !ticket.branchName) {
    throw new ApiError(400, 'Nothing to roll back — no agent PR on this ticket.')
  }
  if (!ticket.project.githubInstallationId) {
    throw new ApiError(400, 'GitHub App not connected for this repository.')
  }

  const octokit = await getInstallationClient(ticket.project.githubInstallationId)

  // 1. Close the PR (does not merge)
  await octokit.pulls.update({
    owner: ticket.project.githubRepoOwner!, repo: ticket.project.githubRepoName!,
    pull_number: ticket.prNumber, state: 'closed'
  })

  // 2. Delete the agent branch (best-effort)
  try {
    await octokit.git.deleteRef({
      owner: ticket.project.githubRepoOwner!, repo: ticket.project.githubRepoName!,
      ref: `heads/${ticket.branchName}`
    })
  } catch { /* branch already deleted — fine */ }

  // 3. Record rollback + reset ticket
  await prisma.agentAction.create({
    data: {
      ticketId, agentType: 'CODE', actionType: 'ROLLBACK', status: 'COMPLETED',
      reasoning: `PR #${ticket.prNumber} closed and branch deleted by user.`,
      completedAt: new Date()
    }
  })

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: 'TODO', prUrl: null, prNumber: null, branchName: null,
      agentPhase: null, assignedAgentType: null, agentRunId: null
    }
  })

  await publishEvent('ticket.updated', { ticketId, projectId: ticket.projectId })
  return updated
}
```

---

## Frontend additions

Wire the deferred Phase 2 ticket-drawer sections:
- **Agent Assignment panel:** "Assign to Code Agent" → `POST /api/tickets/:id/assign-agent`; show current agent type + status.
- **Agent Action Log:** collapsible `AgentAction` list (action type, reasoning, duration, status); "Rollback" button when a PR exists.
- **Approval Gate:** when awaiting approval, show what the agent did (diff preview) + Approve / Request Changes.
- **PR Link:** opens the GitHub PR in a new tab.
- **Agent Activity Feed** (`AgentActivityFeed.tsx`): real-time feed of agent actions, filterable by agent type, virtualized, updates live via the WebSocket `agent.*` events from Phase 2's client.

---

## Definition of Done

- A user connects a real GitHub repo to a project (install App once), assigns a real ticket to the Code Agent, and a PR appears on GitHub linked back to the ticket, with the ticket moving to `IN_REVIEW`.
- Racing two assigns yields exactly one run; the loser gets `409`. A retry/double-fire never opens a second PR.
- Rollback closes the PR, deletes the branch, and resets the ticket; re-assignment then works.
- The assign-agent / approve / Code Agent test cases in [07-testing-strategy.md](../references/07-testing-strategy.md) pass, and agent-security items in [06-security-checklist.md](../references/06-security-checklist.md) hold.
