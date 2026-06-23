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
- [ ] Tickets full CRUD + status transitions (status route is a stub gate now; full gate logic in Phase 4)
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
- [ ] **Watchers / "CC"** — add/remove multiple users who follow a ticket (`TicketWatcher`); they'll receive notifications once Phase 5 lands
- [ ] **Activity timeline** — record + show status changes, assignment, watcher and sprint moves (`TicketActivity`); shown as a timeline tab in the drawer
- [ ] **Completion progress bar** — done/total as a progress bar on the sprint header and the project header (and per-column counts on the board)
- [ ] **UI/UX polish** — clean, smooth, lightly creative per the UX direction above (drag motion, transitions, empty states)

---

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
  assignedAgentType?: 'CODE' | 'SPEC'   // honored from Phase 4
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

> The `goal`, `acceptanceCriteria`, and `constraints` fields are the structured inputs the Code Agent consumes in Phase 4 — capture them well now even though nothing reads them yet.

---

## Assignment, watchers (CC) & activity

**Assignee (single)** — set via `assignedToId` on create or `PATCH /api/tickets/:id`. The assignee must be a member of the ticket's org (validated). Changing it writes a `TicketActivity` row and emits `ticket.updated`.

**Watchers / CC (many)** — a `TicketWatcher` join (`ticketId` × `userId`). The creator and assignee are auto-added; anyone can add others (org members). Watchers receive notifications once Phase 5 lands.
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
import { createClient } from 'redis'

const publisher = createClient({ url: process.env.REDIS_URL })
const subscriber = createClient({ url: process.env.REDIS_URL })

await Promise.all([publisher.connect(), subscriber.connect()])

export async function publishEvent(type: string, payload: unknown) {
  await publisher.publish('agentpm:events',
    JSON.stringify({ type, payload, timestamp: new Date().toISOString() }))
}

export async function subscribeToEvents(handler: (type: string, payload: unknown) => void) {
  await subscriber.subscribe('agentpm:events', (message) => {
    const { type, payload } = JSON.parse(message)
    handler(type, payload)
  })
}
```

> **Contract that everything depends on:** every published event payload includes `projectId`. The WS server fans out by room `project:{projectId}`, so events without it never reach clients.

## Real-time: WebSocket server

Real-time runs **inside the API process** via `@fastify/websocket` — no AWS API Gateway. The server holds open connections in memory, grouped into rooms (`project:{projectId}`), subscribes to the Redis event bus, and fans incoming events out to sockets in the matching room. Redis keeps this correct even with multiple API instances: every instance receives every event and delivers it to whichever clients it holds.

**Auth handshake (no token in the URL):** the client opens `wss://api.agentpm.io/ws` with no credentials, then sends `{ type: 'auth', token, projectId }` as its first message. The server verifies the JWT, checks project membership, then joins the socket to the room and replies `auth.ok`. A socket that doesn't authenticate within a few seconds is closed. This keeps tokens out of access logs and proxy history.

File: `apps/api/src/websocket/ws-server.ts`

```typescript
import type { FastifyPluginAsync } from 'fastify'
import { subscribeToEvents } from '../events/event-bus'

const rooms = new Map<string, Set<WebSocket>>()   // room -> live sockets

function join(room: string, socket: WebSocket) {
  if (!rooms.has(room)) rooms.set(room, new Set())
  rooms.get(room)!.add(socket)
}
function leaveAll(socket: WebSocket) {
  for (const set of rooms.values()) set.delete(socket)
}
function broadcast(room: string, message: object) {
  const data = JSON.stringify(message)
  rooms.get(room)?.forEach((s) => { try { s.send(data) } catch {} })
}

export const wsServer: FastifyPluginAsync = async (app) => {
  await subscribeToEvents((type, payload: any) => {
    if (!payload?.projectId) return
    broadcast(`project:${payload.projectId}`, {
      type, room: `project:${payload.projectId}`,
      payload, timestamp: new Date().toISOString()
    })
  })

  app.get('/ws', { websocket: true }, (conn, req) => {
    const socket = conn.socket
    let authed = false
    const authTimer = setTimeout(() => { if (!authed) socket.close(4001, 'auth timeout') }, 5000)

    socket.on('message', async (raw) => {
      let msg: any
      try { msg = JSON.parse(raw.toString()) } catch { return }

      if (!authed) {
        if (msg.type !== 'auth') return
        try {
          const { sub: userId } = app.jwt.verify(msg.token) as { sub: string }
          const member = await isProjectMember(userId, msg.projectId)
          if (!member) throw new Error('not a member')
          join(`project:${msg.projectId}`, socket)
          authed = true
          clearTimeout(authTimer)
          socket.send(JSON.stringify({ type: 'auth.ok' }))
        } catch {
          socket.send(JSON.stringify({ type: 'auth.error' }))
          socket.close(4001, 'auth failed')
        }
        return
      }
      // (Phase 2 clients only listen; inbound messages after auth are ignored.)
    })

    socket.on('close', () => { clearTimeout(authTimer); leaveAll(socket) })
  })
}
```

`rooms` is in-memory per API instance — exactly right for the single-task MVP, and still correct without sticky sessions if you scale to multiple API tasks (because every instance subscribes to Redis). Only move to AWS API Gateway WebSockets if you outgrow what a few API instances can hold in concurrent connections.

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
```

> Ticket CRUD handlers in this phase call `publishEvent('ticket.created' | 'ticket.updated' | 'ticket.deleted', { ..., projectId })`. The `agent.*` and `approval.*` events are emitted starting in Phase 4.

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
 *   watcher count; agent badge (Phase 4), PR link (Phase 4)
 * - Per-column counts; project completion progress bar in the board header
 * - Click ticket → slide-in drawer with full detail
 * - "Assign to agent" button (Phase 4)
 * - Agent activity feed sidebar (Phase 4)
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
 * 4. Agent Assignment panel        (wired in Phase 4)
 * 5. Agent Action Log              (Phase 4)
 * 6. Approval Gate                 (Phase 4)
 * 7. PR Link                       (Phase 4)
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

## Definition of Done

- A user can create/edit/delete tickets with the full structured schema, organize them into sprints, and start/complete a sprint.
- Tickets get sequential per-project numbers.
- Dragging a card on the board updates status/position and the change appears live in another browser via WebSocket.
- Status can be changed JIRA-style from the card dropdown (not only by drag).
- A ticket can be **assigned** to a member and have **watchers (CC)** added/removed; both changes appear in the **activity timeline**.
- The **completion progress bar** reflects done/total on the sprint and project headers.
- The UI feels clean and smooth (per the UX direction) — subjective, reviewed in-browser.
- The ticket CRUD test cases in [07-testing-strategy.md](../references/07-testing-strategy.md) pass, plus assignment/watcher/activity coverage.
