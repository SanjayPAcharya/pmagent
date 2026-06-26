# Phase 2 — PM Core: Tickets, Kanban Board, Sprints & Real-time

> **Goal:** Turn the platform into a usable project manager. Structured tickets (goal, acceptance criteria, dependencies), a drag-and-drop kanban board, sprint planning, and real-time updates over WebSocket so multiple users see the board change live.

> **UX direction (guideline, not a hard rule):** keep the UI **clean, smooth, and a little creative** — subtle motion on drag/drop and status changes, tasteful transitions, thoughtful empty states, good keyboard affordances. Favor clarity over density. It should feel closer to Linear than to a stock Bootstrap admin.

**Depends on:** Phase 1 (orgs/projects/auth). Can be built/deployed via Phase 3's pipeline.

**References:**
- [03-data-models.md](../references/03-data-models.md) — adds `Ticket`, `TicketDependency`, `Label`, `TicketLabel`, `Comment`, `Sprint`
- [04-api-reference.md](../references/04-api-reference.md) — ticket/sprint route map + Zod pattern
- [01-tech-stack.md](../references/01-tech-stack.md) — real-time architecture (WS in-process + Redis pub/sub)

---

## Deliverables

- [ ] Migration adding ticket/sprint/label/comment models (+ `TicketWatcher`, `TicketActivity` — see below)
- [ ] Tickets full CRUD + status transitions (status route is a stub gate now; full gate logic in Phase 5)
- [ ] Sequential per-project ticket numbering (e.g. AGP-42)
- [ ] Sprints CRUD + start/complete + add/remove tickets
- [ ] Event bus (Redis pub/sub)
- [ ] WebSocket server + room management + auth handshake
- [ ] Kanban board with drag-and-drop (dnd-kit)
- [ ] Ticket drawer with all fields + inline editing + comments
- [ ] Real-time board updates via WebSocket client
- [ ] Sprint view

**Added per feedback:**
- [ ] **JIRA-style quick status change** — change status from the card (dropdown) and by drag; reflected everywhere live
- [ ] **Assignee** — single assignee per ticket (`assignedToId`) with an assignee picker (avatars)
- [ ] **Watchers / "CC"** — add/remove multiple users who follow a ticket (`TicketWatcher`); they'll receive notifications once Phase 4 lands
- [ ] **Activity timeline** — record + show status changes, assignment, watcher and sprint moves (`TicketActivity`); shown as a timeline tab in the drawer
- [ ] **Completion progress bar** — done/total as a progress bar on the sprint header and the project header (and per-column counts on the board)
- [ ] **UI/UX polish** — clean, smooth, lightly creative per the UX direction above (drag motion, transitions, empty states)

**Expanded scope (round 2 — approved):**

_Tickets & board_
- [ ] **Due date** on tickets
- [ ] **Soft-delete** tickets (archive via `archivedAt`; lists exclude archived by default)
- [ ] **Search + filter + sort** on board & list — by assignee, label, priority, status, and free text (whitelisted sort enum)
- [ ] **Inline quick-add** per column  _(Cmd-K command palette → Phase 2.5)_
- [ ] **Deep-linkable ticket route** `/:orgSlug/:projectSlug/ticket/:number` (opens the drawer directly; shareable)
- [ ] **Markdown render + `@mention`** in description & comments, **sanitized (DOMPurify, client + server)**

_Real-time / notifications_
- [ ] **In-app notification center (bell)** over WS — notify the assignee, creator, watchers/CC, and `@mentioned` users on relevant events; unread badge + mark-read
- [ ] **Presence** — "who's viewing this board" via WS rooms

_Onboarding_
- [ ] **Org invite links** (token-based; copy-link now, emailed in Phase 4)

_API quality_
- [ ] **Pagination convention** (cursor/limit) on all list endpoints
- [ ] **OpenAPI/Swagger** at `/documentation` (`@fastify/swagger` + swagger-ui)
- [ ] **`/ready` readiness probe** (DB + Redis) + graceful shutdown (also needed for Phase 3 deploy)
- [ ] **Seed script** (`pnpm db:seed`) — demo org/project/tickets for a fresh stack

_Frontend foundation & feel_
- [ ] **UI component foundation** — adopt **shadcn/ui** (Radix: Dialog/Popover/Command/Toast); the drawer, pickers, and toasts depend on it
- [ ] **Optimistic UI + toasts + skeleton loaders** (drag/edits apply instantly)

> **Split out to [Phase 2.5 — UX hardening](phase-2.5-ux-hardening.md):** dark mode, i18n, mobile-perfect, Cmd-K palette, Playwright E2E. Phase 2 ships a **verifiable PM core**; 2.5 hardens UX before Phase 3 (deploy).

> **Decisions (this round):** (1) **shadcn/ui adopted** in Phase 2 (drawer/dialog/popover/toast are core). (2) **`bulk-update` deferred** — board drag covers reorder/move; remove from Phase-2 scope. (3) **CI deferred to Phase 3** (a note in Phase 2; minimal local run only). (4) **org membership = project access** kept (no `ProjectMember`); invite role is **capped at the creator's role**. (5) **attachments deferred**.

---

## Resolved blockers (implementation decisions — read before 2A)

These five were found in a dry-run review and are settled here so the build starts clean.

1. **WS verification uses a shared async verifier, not `app.jwt.verify`.** `@fastify/jwt`'s sync verify can't resolve our async JWKS key, and `@fastify/websocket` v11 hands the handler `(socket, req)` (no `conn.socket`). A standalone **jose** verifier (`createRemoteJWKSet`) handles the WS handshake (see the WS section below). It's also reusable by HTTP if we ever unify.
2. **Event bus is lazily initialized**, not connected at import — so tests and the worker don't force a Redis connection on module load. `initEventBus()` runs in `buildServer`; `disposeEventBus()` on shutdown (see the corrected snippet below). **Tests run with `REDIS_URL` pointed at the dev/CI Redis.**
3. **Ticket numbering is atomic** via a per-project counter (`Project.ticketCounter`), incremented in the same transaction as the insert — no `MAX()+1` race.
4. **Ticket display id = `Project.key` + number** (e.g. `AGP-42`). `Project` gains `key` (short uppercase, unique per org, derived on create, overridable). The Phase-2 migration **backfills `key` for existing projects** (derive from name; ensure per-org uniqueness) before adding the `NOT NULL` + unique constraint.
5. **Validation + Swagger via `fastify-type-provider-zod`.** Phase-2 routes declare `schema: { body/querystring: <zod> }`; Fastify validates from the Zod schema **and** `@fastify/swagger` generates `/documentation` from it. (Phase-1 routes keep manual `.parse()` for now; migrate opportunistically.)

```typescript
// Ticket numbering (atomic) + display id
const ticket = await prisma.$transaction(async (tx) => {
  const p = await tx.project.update({
    where: { id: projectId },
    data: { ticketCounter: { increment: 1 } },
    select: { ticketCounter: true, key: true },
  })
  return tx.ticket.create({ data: { ...input, projectId, number: p.ticketCounter } })
})
// display: `${project.key}-${ticket.number}`  → "AGP-42"
```

```typescript
// apps/api/src/auth/verify-token.ts — shared async verifier (jose), used by the WS handshake
import { createRemoteJWKSet, jwtVerify } from 'jose'

const jwks = createRemoteJWKSet(
  new URL(`${process.env.KEYCLOAK_INTERNAL_URL}/protocol/openid-connect/certs`),
)
export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: process.env.KEYCLOAK_ISSUER_URL,
    audience: process.env.KEYCLOAK_API_AUDIENCE,
  })
  return payload as { sub: string; email?: string; name?: string }
}
```
> **Deps this adds.** API (runtime): `redis`, `jose` (promote from devDep), `fastify-type-provider-zod`, `@fastify/swagger`, `@fastify/swagger-ui`, `isomorphic-dompurify` (server-side sanitize). Web: `@dnd-kit/*`, **shadcn/ui + Radix primitives**, `marked` + `dompurify`, `date-fns`. (Cmd-K `cmdk` + `react-i18next` → Phase 2.5.)

## Round 2 — blocker fixes from the full audit (also plan contract)

A 7-dimension review of this plan + the Phase-1 code surfaced these. They are settled here.

**Security**
- **Notification endpoints scope to the caller** (per-user, no org guard): list/unread-count filter `where:{ userId: request.userId }`; `:id/read` matches `{ id, userId }` else 404. *(test: cannot read/mark another user's notification)*
- **@mention is org-bounded:** autocomplete and server-side mention resolution restrict to `OrgMember`s of the ticket's org; the final recipient set is intersected with current org membership, minus the actor. *(test: @mention of a non-member → no notification)*
- **Markdown sanitized both sides:** SPA renders `marked` + `DOMPurify` with raw-HTML disabled; any server-generated copy (notification body, later emails) is sanitized server-side (`isomorphic-dompurify`) or sent as plain text.
- **Invite tokens:** `crypto.randomBytes(32).toString('base64url')` (≥128-bit); `accept` requires an authenticated user, verifies `expiresAt > now && acceptedAt == null` in the same tx that creates the `OrgMember`, sets `acceptedAt` (single-use), and if `email` is set must match the caller; uniform `404` on miss; **invite role capped at the creator's role** (ADMIN can't mint OWNER); stricter rate-limit on accept.
- **Whitelisted sort/filter:** `sort` is a Zod enum (`position|-position|updatedAt|-updatedAt|priority|-priority|number|-number`); filter ids `z.string().uuid()`; status/priority/type enums.
- **Cross-scope validation:** `assignedToId` + each watcher `userId` must be `OrgMember`s of the ticket's org; `labelIds` must belong to that org; `sprintId`/`parentId`/`dependsOnIds` must belong to the same project — else `400`.
- **Per-user rate limit:** add a 1000/min limit alongside per-IP 100/min; set Fastify `trustProxy` (behind Caddy/ALB). **Keying gotcha:** `@fastify/rate-limit`'s `keyGenerator` runs at `onRequest`, *before* the route-level `requireAuth` sets `request.userId` — so derive the bucket key by cheaply reading the JWT `sub` in `keyGenerator` (no full verify needed just for bucketing), or fall back to per-IP. Don't assume `request.userId` exists there.

**Correctness / data**
- **Publish-after-commit:** emit events only after the `$transaction` resolves; events are "hints" → clients refetch.
- **Fully transactional create:** ticketCounter increment + ticket insert + label/dependency rows + auto-add creator(+assignee) watcher + `CREATED` activity, all in one `$transaction`; strip non-scalar keys before `ticket.create`.
- **Single `updateTicket(diff, actor)` service** used by `PATCH /tickets/:id`, `/status`, and sprint add/remove — computes field diffs and writes the right `TicketActivity` rows (incl. `PRIORITY_CHANGED`, `SPRINT_CHANGED`) in one `$transaction`, then **returns the event(s) so the caller publishes after the tx commits** (publish-after-commit — never inside the tx).
- **Board ordering:** `position` = midpoint between neighbours on move (append = max+step); document a rebalance when the gap collapses; every board/list query appends `id` as the final tiebreaker. (Keep `Float`; revisit LexoRank only if precision bites.)
- **Cursor pagination is total:** ORDER BY ends with `id`; cursor encodes the `(sortKey…, id)` tuple; keyset predicate `(sortVal,id) > (cursorSortVal,cursorId)`; add covering indexes.
- **`onDelete` + Label relation** (see [03](../references/03-data-models.md)): `Label` gets an `organization` relation (cascade); `Ticket.assignedTo`→`SetNull`, `TicketActivity.actor`→`SetNull`, `Notification.ticket`→`Cascade`, `OrgInvite.invitedBy`→`Cascade`, `Ticket.createdBy`→`Restrict` (block user delete).
- **Agent enums stay, relations don't:** the Phase-2 schema keeps `AgentType`/`AgentPhase` enums + the ticket agent **scalar** columns (nullable); it omits the `agentActions`/`Approval` **relations + tables** (Phase 5). Phase-2 ticket include set = `{ project, sprint, labels, assignedTo, watchers, activity, comments }` (no `agentActions`).
- **Notification-writer ownership:** in Phase 2 (single API instance) the API writes `Notification` rows and fans out. For multi-instance (Phase 3 scale) move the writer to the worker or add a dedupe unique key.
- **Schema header:** Phase-2 schema keeps the Phase-1 generator/datasource header — **no managed `extensions`/pgvector** (defer to Phase 5).

**Real-time**
- **Self-echo dedupe:** every event payload carries `actorId`; the client ignores events where `actorId === me` for its own optimistic mutations (or the server skips the originating socket). **Board events carry only `projectId`; `notification.new` only `userId`** (no double-delivery).
- **Refetch-on-reconnect:** after `auth.ok` on every (re)connect, the client invalidates board + sprint-counts + unread-count queries (WS is a "something changed" hint, not a lossless stream — Redis pub/sub has no replay).
- **WS handshake hardening:** client `onopen` does `await keycloak.updateToken(30)` then sends a fresh token (the plan's `getAccessToken` → use `getToken`/refresh); reconnect re-refreshes; treat `4001` as retry-once-after-refresh. Server sets an `authPending` flag **synchronously before any await** (no double-join race), one project per socket, optional heartbeat/idle reap. (Tokens aren't re-checked mid-session — acceptable for Phase 2.)
- **Shared WS types:** `WSMessage`/`WSEventType` live in `@agentpm/shared-types` (api + web import the one definition).

**Frontend integration**
- **Routing restructure:** mount `<BrowserRouter>` unconditionally; split **public** routes (`/invite/:token`, landing) from **auth-gated** routes (board/drawer/dashboard) via a guard wrapper — don't `return <Landing/>` before the router. `/invite/:token` persists the token across the Keycloak round-trip. Reconcile the URL scheme (`/orgs/:slug` vs `/:orgSlug/:projectSlug`) before layering the deep-link drawer.
- **Members endpoint shape:** **enhance the existing Phase-1** `GET /api/orgs/:slug/members` (it already returns `userId/name/email/role`) to add `avatarUrl` → `{ members: { userId, name, email, avatarUrl, role }[] }`; add `api.listMembers(slug)` cached in React Query, shared by presence avatars, assignee/watcher pickers, and the @mention picker. **`avatarUrl` is null until a Keycloak claim is mapped, so the UI falls back to initials.**

**Lifecycle / ops**
- **Graceful shutdown (gates Phase 3):** SIGTERM/SIGINT → flip `/ready` to 503 → `app.close()` (onClose hook closes all WS sockets + clears rooms) → `disposeEventBus()` → `prisma.$disconnect()`. `/ready` checks Postgres (`SELECT 1`) + Redis ping.
- **zod type-provider scope:** register the validator/serializer compilers **inside the Phase-2 route plugins' encapsulated scope** (Phase-1 manual-parse routes untouched); register `@fastify/swagger` with `jsonSchemaTransform` before the route plugins.
- **Idempotent seed:** `pnpm db:seed` upserts on unique keys (sets `ticketCounter`) and ties demo data to a known user.
- **Test harness:** add `REDIS_URL` to `vitest.config.ts` env; call `disposeEventBus()` in teardown; extend the `beforeEach` truncation to every new table in child→parent FK order (or `TRUNCATE … RESTART IDENTITY CASCADE`); reset the test DB when the `Project.key` backfill migration lands.

## Sub-stage plan (2A–2E) — build + verify + commit each

- **2A — Data & migration.** Schema additions (Label relation + onDelete, `dueDate`, `archivedAt`, `Project.key` + `ticketCounter`; enums kept/added: `AgentType`/`AgentPhase` (scalars, relations deferred) **and `NotificationType`/`NotificationChannel`** for `Notification`; `TicketWatcher`/`TicketActivity`/`OrgInvite`/in-app `Notification`), the hand-written `key` backfill migration (add nullable → derive+dedup `UPDATE` → set NOT NULL+unique), **soft-delete by filtering `archivedAt` in list queries only** (fetch-by-id still returns archived for the drawer/restore — avoid a global Prisma extension that hides it everywhere), and the idempotent seed. **Verify:** migrate + seed clean.
- **2B — Tickets backend.** Ticket CRUD (transactional create + atomic numbering), the `updateTicket` service + activity, comments, assignee, watchers, label/dep/sprint cross-scope validation, search/filter/sort (whitelist) + cursor pagination, Swagger via zod-provider, `/ready` + graceful shutdown. **+ API tests.**
- **2C — Sprints + real-time + notifications + invites (backend).** Sprint CRUD + completion counts; event bus init/dispose; WS server (project+user rooms, presence, hardened handshake) + shared `WSMessage`; caller-scoped in-app notifications; org invite tokens (+role cap, accept). **+ API/WS tests.**
- **2D — Frontend foundation.** shadcn/ui adoption; routing restructure (public vs gated) + `/invite/:token` accept page; members endpoint + `api.listMembers`; typed WS client (refresh + reconnect-refetch + echo-dedupe).
- **2E — Board & drawer & verify.** Kanban (dnd-kit + position) + quick-add + JIRA-style status; ticket drawer (comments / activity / assignee / watchers / labels / due) + markdown(@mention, sanitized); sprint view + completion bars; optimistic UI + toasts + skeletons; notification bell. **You verify in-browser; fill remaining API test gaps; close Phase 2.**

Hard dependencies: 2B needs 2A; 2C needs 2A (+2B service for activity); 2D/2E need 2B+2C APIs. **Phase 2.5 (dark mode, i18n, mobile-perfect, Cmd-K, Playwright E2E) runs after Phase 2 is verified.**

## Ticket request/response contracts

### Create ticket

```typescript
// POST /api/tickets — request body (Zod-validated; see 04-api-reference.md for the schema)
interface CreateTicketBody {
  projectId: string           // required
  sprintId?: string
  title: string               // required, max 200 chars
  description?: string        // markdown supported
  acceptanceCriteria?: string // "Given X, When Y, Then Z" format
  goal?: string               // one sentence, used later by the agent
  constraints?: string        // e.g. "Must not break existing API contract"
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'   // default: MEDIUM
  type?: 'FEATURE' | 'BUG' | 'CHORE' | 'SPIKE'       // default: FEATURE
  storyPoints?: number
  assignedToId?: string
  assignedAgentType?: 'CODE' | 'SPEC'   // honored from Phase 5
  labelIds?: string[]
  dependsOnIds?: string[]
  parentId?: string
}

// Response 201:
interface CreateTicketResponse {
  ticket: {
    id: string
    number: number           // e.g. 42, displayed as AGP-42
    status: TicketStatus
    // ... all ticket fields
    project: { id: string; name: string; slug: string }
    sprint: Sprint | null
    labels: Label[]
    agentActions: []
  }
}
```

> The `goal`, `acceptanceCriteria`, and `constraints` fields are the structured inputs the Code Agent consumes in Phase 5 — capture them well now even though nothing reads them yet.

---

## Assignment, watchers (CC) & activity

**Assignee (single)** — set via `assignedToId` on create or `PATCH /api/tickets/:id`. The assignee must be a member of the ticket's org (validated). Changing it writes a `TicketActivity` row and emits `ticket.updated`.

**Watchers / CC (many)** — a `TicketWatcher` join (`ticketId` × `userId`). The creator and assignee are auto-added; anyone can add others (org members). Watchers receive notifications once Phase 4 lands.
```
POST   /api/tickets/:id/watchers      { userId }   add a watcher (CC)
DELETE /api/tickets/:id/watchers/:userId           remove
```

**Activity timeline** — server records a `TicketActivity` entry on each meaningful change (status, assignee, watcher add/remove, sprint move, created). Returned with the ticket and via:
```
GET    /api/tickets/:id/activity       chronological activity feed
```
Recorded server-side (not client-trusted); rendered as a timeline tab in the drawer. Comments (`Comment`) stay separate from activity.

**Completion progress** — computed, no new storage. Sprint and project detail responses include `{ counts: { total, done, ... per status } }`; the board derives column counts. The UI renders a progress bar (done ÷ total). Sprint velocity (story points completed) is set on `complete`.

---

## Real-time: Event Bus

File: `apps/api/src/events/event-bus.ts`

```typescript
import { createClient, type RedisClientType } from 'redis'

// Lazy — NOT connected at import (so tests/worker don't force a Redis connection
// on module load). initEventBus() runs in buildServer; disposeEventBus() on shutdown.
let publisher: RedisClientType | undefined
let subscriber: RedisClientType | undefined

export async function initEventBus() {
  publisher = createClient({ url: process.env.REDIS_URL })
  subscriber = publisher.duplicate()
  await Promise.all([publisher.connect(), subscriber.connect()])
}

export async function publishEvent(
  type: string,
  payload: { projectId?: string; userId?: string; [k: string]: unknown },
) {
  if (!publisher) return
  await publisher.publish('agentpm:events',
    JSON.stringify({ type, payload, timestamp: new Date().toISOString() }))
}

export async function subscribeToEvents(handler: (type: string, payload: any) => void) {
  if (!subscriber) return
  await subscriber.subscribe('agentpm:events', (message) => {
    const { type, payload } = JSON.parse(message)
    handler(type, payload)
  })
}

export async function disposeEventBus() {
  await Promise.allSettled([publisher?.quit(), subscriber?.quit()])
  publisher = subscriber = undefined
}
```

> **Contract that everything depends on:** every published event payload includes a `projectId` (board events) and/or a `userId` (personal events). The WS server fans out by `project:{projectId}` and `user:{userId}`; an event with neither reaches no one.

## Real-time: WebSocket server

Real-time runs **inside the API process** via `@fastify/websocket` — no AWS API Gateway. The server holds open connections in memory, grouped into rooms (`project:{projectId}`), subscribes to the Redis event bus, and fans incoming events out to sockets in the matching room. Redis keeps this correct even with multiple API instances: every instance receives every event and delivers it to whichever clients it holds.

**Auth handshake (no token in the URL):** the client opens `wss://api.agentpm.io/ws` with no credentials, then sends `{ type: 'auth', token, projectId }` as its first message. The server verifies the JWT, checks project membership, then joins the socket to the room and replies `auth.ok`. A socket that doesn't authenticate within a few seconds is closed. This keeps tokens out of access logs and proxy history.

File: `apps/api/src/websocket/ws-server.ts`

```typescript
// @fastify/websocket v11: the handler receives (socket, req) — `socket` IS the
// WebSocket (no conn.socket). Token is verified with the shared jose verifier
// (async JWKS), NOT app.jwt.verify (which can't resolve the async key).
import type { FastifyPluginAsync } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import { subscribeToEvents } from '../events/event-bus.js'
import { verifyAccessToken } from '../auth/verify-token.js'
import { prisma } from '../db/client.js'
import { assertOrgRole } from '../services/authz.js'

const rooms = new Map<string, Set<WebSocket>>()                 // room -> sockets
const socketUser = new Map<WebSocket, { userId: string; projectId: string }>()

const join = (room: string, s: WebSocket) =>
  (rooms.get(room) ?? rooms.set(room, new Set()).get(room)!).add(s)
const leaveAll = (s: WebSocket) => { for (const set of rooms.values()) set.delete(s) }
const broadcast = (room: string, msg: object) => {
  const data = JSON.stringify(msg)
  rooms.get(room)?.forEach((s) => { try { s.send(data) } catch {} })
}
function presenceState(projectId: string) {
  const ids = new Set<string>()
  for (const s of rooms.get(`project:${projectId}`) ?? []) {
    const u = socketUser.get(s); if (u) ids.add(u.userId)
  }
  return [...ids]
}

export const wsServer: FastifyPluginAsync = async (app) => {
  // One subscription routes events by whichever key the payload carries.
  await subscribeToEvents((type, payload: any) => {
    const env = (room: string) => ({ type, room, payload, timestamp: new Date().toISOString() })
    if (payload?.projectId) broadcast(`project:${payload.projectId}`, env(`project:${payload.projectId}`))
    if (payload?.userId) broadcast(`user:${payload.userId}`, env(`user:${payload.userId}`))
  })

  app.get('/ws', { websocket: true }, (socket, _req) => {
    let authed = false
    const authTimer = setTimeout(() => { if (!authed) socket.close(4001, 'auth timeout') }, 5000)

    socket.on('message', async (raw) => {
      let msg: any
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (authed) return // Phase 2 clients only listen after auth

      if (msg.type !== 'auth') return
      try {
        const claims = await verifyAccessToken(msg.token)
        // Map the Keycloak subject to our local user id (created on first API call).
        const user = await prisma.user.findUniqueOrThrow({ where: { idpSub: claims.sub } })
        const project = await prisma.project.findUniqueOrThrow({
          where: { id: msg.projectId }, select: { orgId: true },
        })
        await assertOrgRole(user.id, project.orgId, 'MEMBER') // throws if not a member

        join(`project:${msg.projectId}`, socket)
        join(`user:${user.id}`, socket)
        socketUser.set(socket, { userId: user.id, projectId: msg.projectId })
        authed = true
        clearTimeout(authTimer)
        socket.send(JSON.stringify({ type: 'auth.ok' }))
        broadcast(`project:${msg.projectId}`, { type: 'presence.state', payload: { projectId: msg.projectId, viewers: presenceState(msg.projectId) } })
      } catch {
        socket.send(JSON.stringify({ type: 'auth.error' }))
        socket.close(4001, 'auth failed')
      }
    })

    socket.on('close', () => {
      clearTimeout(authTimer)
      const u = socketUser.get(socket)
      leaveAll(socket); socketUser.delete(socket)
      if (u) broadcast(`project:${u.projectId}`, { type: 'presence.state', payload: { projectId: u.projectId, viewers: presenceState(u.projectId) } })
    })
  })
}
```

`rooms`/presence are in-memory per API instance — correct for the single-task MVP. **Board events** still propagate across instances via Redis (every instance subscribes), so live updates stay correct without sticky sessions; only **presence** is per-instance (move to a Redis presence set if you run multiple API tasks).

### WebSocket event envelope

```typescript
interface WSMessage {
  type: WSEventType
  room: string           // "project:{projectId}"
  payload: unknown
  timestamp: string      // ISO 8601
}

type WSEventType =
  | 'ticket.created' | 'ticket.updated' | 'ticket.deleted'
  | 'agent.started' | 'agent.progress' | 'agent.completed' | 'agent.failed'
  | 'agent.needs_approval' | 'approval.resolved'
  | 'notification.new' | 'sprint.updated' | 'member.joined'
  | 'presence.state'                       // current viewers of a board
```

> Ticket CRUD handlers in this phase call `publishEvent('ticket.created' | 'ticket.updated' | 'ticket.deleted', { ..., projectId })`. The `agent.*` and `approval.*` events are emitted starting in Phase 5.

### Rooms: project + per-user (added round 2)

The WS server joins each authenticated socket to **two** rooms:
- `project:{projectId}` — board events (ticket/sprint/presence), as above.
- `user:{userId}` — **personal** events, used for the in-app notification bell (`notification.new`).

So the fan-out routes an event by whichever key its payload carries: `payload.projectId → project:*`, `payload.userId → user:*`. A notification published with `{ userId, ... }` reaches exactly that user across all their open tabs/devices.

### Presence ("who's viewing this board")

On join/leave, the server tracks the set of `userId`s in each `project:{projectId}` room and broadcasts `presence.state` (the deduped list of current viewers) to that room. No DB — purely the in-memory room membership. The board renders viewer avatars; it updates as people open/close the board.

---

## Frontend

### Board page

File: `apps/web/src/routes/project/BoardPage.tsx`

```typescript
/**
 * KANBAN BOARD PAGE
 * Columns: BACKLOG | TODO | IN_PROGRESS | IN_REVIEW | DONE
 * - Drag-and-drop ticket reordering (dnd-kit) — smooth motion, subtle drop animation
 * - JIRA-style quick status change on the card (dropdown) in addition to drag
 * - Real-time updates via WebSocket
 * - Ticket card: number (AGP-42), title, priority, assignee avatar, label chips,
 *   watcher count; agent badge (Phase 5), PR link (Phase 5)
 * - Per-column counts; project completion progress bar in the board header
 * - Click ticket → slide-in drawer with full detail
 * - "Assign to agent" button (Phase 5)
 * - Agent activity feed sidebar (Phase 5)
 *
 * Libraries: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
 * State: React Query for tickets, WebSocket for real-time updates
 * UX: clean/smooth/lightly creative (see UX direction at top) — not a hard rule
 */
```

### Ticket drawer

```typescript
/**
 * TICKET DRAWER — slides in from right when a ticket is clicked
 * 1. Header: title (editable inline), ticket number, status (quick-change dropdown), priority
 * 2. Description (markdown — styled textarea + render; rich editor optional later)
 * 3. Acceptance Criteria (structured text area)
 * 4. Agent Assignment panel        (wired in Phase 5)
 * 5. Agent Action Log              (Phase 5)
 * 6. Approval Gate                 (Phase 5)
 * 7. PR Link                       (Phase 5)
 * 8. Tabs: Comments | Activity timeline (status/assignee/watcher/sprint changes)
 * 9. Metadata sidebar: assignee (picker), watchers/CC (add/remove chips),
 *    sprint, labels, story points, dates
 */
```

### WebSocket client

File: `apps/web/src/lib/websocket.ts`

```typescript
import { useEffect, useRef, useCallback } from 'react'
import type { WSMessage } from '@agentpm/shared-types'

const WS_URL = import.meta.env.VITE_WS_URL!

export function useProjectWebSocket(
  projectId: string,
  handlers: Partial<Record<string, (payload: any) => void>>
) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<NodeJS.Timeout>()

  const connect = useCallback(() => {
    // Connect without secrets in the URL. The token is NEVER in the query string
    // (it would leak into access logs / proxies). Authenticate with a first
    // message after the socket opens, and only then join the room.
    const ws = new WebSocket(`${WS_URL}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      const token = getAccessToken()
      ws.send(JSON.stringify({ type: 'auth', token, projectId }))
    }

    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data)
      if (msg.type === 'auth.ok') return
      if (msg.type === 'auth.error') { ws.close(4001, 'auth failed'); return }
      const handler = handlers[msg.type]
      if (handler) handler(msg.payload)
    }

    ws.onclose = (event) => {
      // 1000 = intentional, 4001 = auth failure — don't reconnect on either
      if (event.code !== 1000 && event.code !== 4001) {
        reconnectTimeout.current = setTimeout(connect, 3000)
      }
    }

    ws.onerror = (error) => { console.error('WS error', error); ws.close() }
  }, [projectId])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimeout.current)
      wsRef.current?.close(1000, 'Component unmounted')
    }
  }, [connect])
}
```

---

## Onboarding: org invite links

Adding a member by email (Phase 1/PM-core) only works if they've already signed up. Invite links fix onboarding without depending on email (which arrives in Phase 4).

- `OrgInvite` model: `{ id, orgId, email?, role, token (random, unique), invitedById, expiresAt, acceptedAt? }`.
```
POST   /api/orgs/:slug/invites        create invite → returns a link /invite/:token  (ADMIN+)
GET    /api/orgs/:slug/invites         list pending invites                          (ADMIN+)
DELETE /api/orgs/:slug/invites/:id     revoke                                        (ADMIN+)
POST   /api/invites/:token/accept      accept (current Keycloak user joins the org)
```
Flow now: admin creates invite → **copies the link** → recipient signs in/up via Keycloak → hits `/invite/:token` → `accept` adds them as an `OrgMember` with the invite's role. In Phase 4 the same invite is *emailed*; nothing else changes.

## Search, filter, sort & pagination

- **List endpoints** (`/api/tickets`, `/api/sprints`, `/api/orgs`, notifications, …) accept a shared query convention:
  `?limit=50&cursor=<opaque>` (cursor = base64 of the last id/createdAt). Responses return `{ items, nextCursor }`.
- **Tickets** additionally accept: `q` (text over title/number), `status`, `priority`, `type`, `assignedToId`, `labelId`, `sprintId`, `sort` (e.g. `position`, `-updatedAt`, `priority`). All combine; all enforced server-side after the org-role check.
- Board view fetches per-column (status) with its own cursor so large columns stay fast.

## In-app notifications (bell)

Pulls the **in-app slice** of notifications forward to Phase 2 (email/Slack/WhatsApp stay Phase 4). Uses the existing `Notification` model with `channel = IN_APP`.

- A small **notification service** subscribes to ticket events and, for each, resolves recipients and writes `Notification` rows + publishes `notification.new` to each recipient's `user:{userId}` room.
- **Who gets notified:** the ticket's **assignee**, **creator**, **watchers/CC**, and any **`@mentioned`** users — minus the actor themselves.
- **Triggers (Phase 2):** assigned to you, commented / `@mention`, status changed, added as watcher, ticket in your sprint moved. (Agent events join in Phase 5.)
```
GET    /api/notifications?limit=&cursor=   list (most recent first)
GET    /api/notifications/unread-count
POST   /api/notifications/:id/read
POST   /api/notifications/read-all
```
- Frontend: a **bell** with an unread badge (seeded by `unread-count`, kept live by `notification.new`), a dropdown list, click → deep-link to the ticket, mark-read.

## API docs, readiness & seed

- **Swagger:** `@fastify/swagger` + `@fastify/swagger-ui` with `jsonSchemaTransform`, fed by **fastify-type-provider-zod** route schemas (compilers registered in the Phase-2 plugins' scope only). Served at `/documentation`.
- **`/ready`:** 200 only when Postgres (`SELECT 1`) + Redis (ping) are reachable (distinct from `/health` liveness). **Graceful shutdown** on SIGTERM/SIGINT: flip `/ready`→503 → `app.close()` (onClose closes WS sockets + clears rooms) → `disposeEventBus()` → `prisma.$disconnect()`.
- **Seed:** idempotent `pnpm db:seed` (upserts on unique keys, sets `ticketCounter`) — demo org/project/tickets/sprint tied to a known user.

## Frontend UX (Phase 2 scope)

- **Optimistic UI:** drag/drop, status change, and inline edits apply immediately via React Query optimistic updates; reconcile on server response; suppress self-echo (ignore WS events with `actorId === me`); **toasts** for success/error; **skeleton loaders** on first load.
- **Inline quick-add:** "add ticket" at the top of each column. _(Cmd-K palette → Phase 2.5.)_
- **Deep-link route:** `/:orgSlug/:projectSlug/ticket/:number` opens the board with the drawer pre-opened; closing returns to the board URL. (Public-vs-gated routing restructured first — see Round 2.)
- **Markdown + mentions:** render sanitized markdown (**marked + DOMPurify**, raw HTML off) in description/comments; `@` opens an org-member picker; the mention is stored in a fixed token format and resolved server-side (org-bounded) into a notification.
- **Presence / empty states:** viewer avatars (resolved via `api.listMembers`) on the board header; friendly empty states.

> **Deferred to [Phase 2.5](phase-2.5-ux-hardening.md):** dark mode, i18n, mobile-perfect, Cmd-K palette.

## Testing (Phase 2)

Hermetic-token harness (as Phase 1), now with `REDIS_URL` set + `disposeEventBus()` in teardown and the `beforeEach` truncation extended to every new table in FK order:
- tickets/sprints CRUD, atomic numbering, RBAC 403, assignment/watcher/activity, cross-scope rejection (label/sprint/watcher from another org → 400/403)
- invite accept (single-use, role-cap, expiry), **notification scoping (IDOR: can't read/mark another user's)**
- pagination round-trip (no dupes/drops; `nextCursor:null` at end), soft-delete exclusion
- WS handshake (auth timeout → 4001, valid → `auth.ok`, bad token / non-member → 4001; a `publishEvent({projectId})` reaches a joined socket; `notification.new` reaches only the target user room)

> **Playwright E2E → Phase 2.5** (needs Keycloak storageState + seeded users; CI wiring lands in Phase 3).

## Definition of Done

- A user can create/edit/delete tickets with the full structured schema, organize them into sprints, and start/complete a sprint.
- Tickets get sequential per-project numbers (`AGP-42`).
- Dragging a card updates status/position and appears live in another browser via WebSocket; status is also changeable JIRA-style from the card dropdown.
- A ticket can be **assigned** to a member and have **watchers (CC)** added/removed; both appear in the **activity timeline**.
- The **completion progress bar** reflects done/total on the sprint and project headers.
- The UI feels clean and smooth (per the UX direction) — optimistic drag, toasts, skeletons. _(Dark mode / mobile-perfect → 2.5.)_
- Search/filter/sort works on the board & list; all list endpoints paginate; `/documentation` (Swagger) and `/ready` respond; graceful shutdown works.
- Org invite link → accept adds a member (role-capped); the **bell** shows in-app notifications to assignee/creator/watchers/@mentioned in real time, scoped to the recipient.
- Deep-link `/…/ticket/:number` opens the drawer directly; markdown is rendered sanitized.
- The Phase-2 test set in [07-testing-strategy.md](../references/07-testing-strategy.md) is green (CRUD, RBAC, pagination, soft-delete, invite, notification scoping, WS handshake). _(Playwright E2E is a Phase-2.5 gate.)_
