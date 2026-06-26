# Reference: API Route Map & Validation Pattern

> Stable reference. The full REST surface as a quick map. Detailed request/response schemas live in the phase that builds each route group. Source: §5 of the original plan.

## Server setup

File: `apps/api/src/index.ts` — Fastify with JWT, CORS, WebSocket, rate-limit plugins. Routes registered under prefixes. (Full server bootstrap is in [phase-1](../phases/phase-1-skeleton-auth-platform.md).)

```typescript
await app.register(import('./routes/me'), { prefix: '/api/me' })  // profile only; login is Keycloak's
await app.register(import('./routes/organizations'), { prefix: '/api/orgs' })
await app.register(import('./routes/projects'), { prefix: '/api/projects' })
await app.register(import('./routes/tickets'), { prefix: '/api/tickets' })
await app.register(import('./routes/sprints'), { prefix: '/api/sprints' })
await app.register(import('./routes/agents'), { prefix: '/api/agents' })
await app.register(import('./routes/webhooks/github'), { prefix: '/webhooks/github' })
await app.register((await import('./websocket/ws-server')).wsServer)
```

## Route map

### Auth — handled by Keycloak, NOT the API (Phase 1)
Login, signup, social login (Google/Microsoft/GitHub), token refresh, and logout are all served by **Keycloak's** hosted endpoints — the API exposes no `/api/auth/login|register|refresh` surface. The SPA talks to Keycloak directly (Authorization Code + PKCE) and sends the resulting access token to the API as a bearer token. The API only:
```
GET    /api/me                     Current user profile (from the verified token + JIT-provisioned row)
PATCH  /api/me                     Update profile fields the app owns (name, avatar)
```
> Token verification (JWKS, iss, aud) + just-in-time `User` provisioning happen in the auth middleware — see [phase-1](../phases/phase-1-skeleton-auth-platform.md).

### Organizations (`/api/orgs`) — built in Phase 1
```
POST   /api/orgs                   Create organization
GET    /api/orgs                   List user's organizations
GET    /api/orgs/:slug             Get organization by slug
PATCH  /api/orgs/:slug             Update organization
DELETE /api/orgs/:slug             Delete organization (owner only)
GET    /api/orgs/:slug/members     List members → { members: { userId, name, email, avatarUrl, role }[] } (used by avatars, assignee/watcher + @mention pickers, presence)
POST   /api/orgs/:slug/members     Add existing user by email
PATCH  /api/orgs/:slug/members/:userId  Update member role
DELETE /api/orgs/:slug/members/:userId  Remove member
POST   /api/orgs/:slug/invites     Create invite link (Phase 2)
GET    /api/orgs/:slug/invites     List pending invites (Phase 2)
DELETE /api/orgs/:slug/invites/:id Revoke invite (Phase 2)
POST   /api/invites/:token/accept  Accept invite — current user joins (Phase 2)
```

### Projects (`/api/projects`) — Phase 1 (CRUD); GitHub/integration/autonomy endpoints land in Phase 5
```
POST   /api/projects                           Create project (body: { orgId, name, slug?, key? }) — key derived if omitted
GET    /api/projects?orgId=:orgId              List projects in org
GET    /api/projects/:projectId                Get project
PATCH  /api/projects/:projectId                Update project
DELETE /api/projects/:projectId                Delete project
POST   /api/projects/:projectId/github/connect Connect GitHub repo            (Phase 5)
POST   /api/projects/:projectId/integrations   Add integration (Slack, etc.)  (Phase 4)
GET    /api/projects/:projectId/integrations   List integrations              (Phase 4)
DELETE /api/projects/:projectId/integrations/:type Remove integration         (Phase 4)
GET    /api/projects/:projectId/autonomy       Get autonomy settings          (Phase 6)
PATCH  /api/projects/:projectId/autonomy       Update autonomy settings       (Phase 6)
```

### Tickets (`/api/tickets`) — Phase 2 (CRUD); agent endpoints land in Phase 5
```
POST   /api/tickets                            Create ticket
GET    /api/tickets?projectId=:id&sprintId=:id List tickets (filterable)
GET    /api/tickets/:ticketId                  Get single ticket (with agent actions)
PATCH  /api/tickets/:ticketId                  Update ticket
DELETE /api/tickets/:ticketId                  Delete ticket
PATCH  /api/tickets/:ticketId/status           Update status (triggers gate check)
POST   /api/tickets/:ticketId/assign-agent     Assign agent type, enqueue job   (Phase 5)
POST   /api/tickets/:ticketId/approve          Approve pending gate             (Phase 5)
POST   /api/tickets/:ticketId/reject           Reject pending gate              (Phase 5)
POST   /api/tickets/:ticketId/rollback         Close agent PR + reset ticket    (Phase 5)
POST   /api/tickets/:ticketId/comments         Add comment
GET    /api/tickets/:ticketId/comments         List comments
POST   /api/tickets/:ticketId/watchers         Add a watcher / CC ({ userId })
DELETE /api/tickets/:ticketId/watchers/:userId Remove a watcher
GET    /api/tickets/:ticketId/activity         Activity timeline (status/assignee/watcher/sprint)
GET    /api/tickets/:ticketId/actions          List agent actions               (Phase 5)
# POST /api/tickets/bulk-update — DEFERRED (board drag covers reorder/move; revisit post-Phase 2 with per-org authz)
```

### Sprints (`/api/sprints`) — Phase 2
```
POST   /api/sprints                            Create sprint
GET    /api/sprints?projectId=:id              List sprints
GET    /api/sprints/:sprintId                  Get sprint with tickets
PATCH  /api/sprints/:sprintId                  Update sprint
POST   /api/sprints/:sprintId/start            Start sprint (sets startDate, status=ACTIVE)
POST   /api/sprints/:sprintId/complete         Complete sprint
POST   /api/sprints/:sprintId/tickets          Add tickets to sprint
DELETE /api/sprints/:sprintId/tickets/:ticketId Remove from sprint
```

### Notifications (`/api/notifications`) — Phase 2 (in-app)
```
GET    /api/notifications?limit=&cursor=      List (most recent first)
GET    /api/notifications/unread-count         Unread badge count
POST   /api/notifications/:id/read             Mark one read
POST   /api/notifications/read-all             Mark all read
```
> **Caller-scoped (no org guard):** every handler filters by `request.userId` — list/count use `where:{ userId }`; `:id/read` matches `{ id, userId }` and returns 404 otherwise. Notifications are per-user, so do **not** reuse `requireOrgRole`.

### Agents (`/api/agents`) — Phase 5
```
GET    /api/agents/feed?projectId=:id         Live agent activity (paginated)
GET    /api/agents/actions/:actionId          Get single action detail
POST   /api/agents/actions/:actionId/retry    Retry failed action
```

## List conventions (pagination, filter, sort) — Phase 2

All list endpoints share a cursor convention: `?limit=<n>&cursor=<opaque>` → response `{ items, nextCursor }` (`nextCursor: null` at the end). Tickets additionally accept `q`, `status`, `priority`, `type`, `assignedToId`, `labelId`, `sprintId`, and `sort`. Filters/sorts are enforced server-side after the org-role check. Archived tickets (`archivedAt != null`) are excluded unless `?includeArchived=true`.

> **Total order + tiebreaker (required for correct cursors):** every list `ORDER BY` ends with `id`, and the cursor encodes the `(sortKey…, id)` tuple with a keyset predicate `(sortVal, id) > (cursorSortVal, cursorId)`. Otherwise ties (e.g. `priority`, or `position` which many rows share) drop/duplicate rows across pages.
> **`sort` is a whitelist** (Zod enum: `position|-position|updatedAt|-updatedAt|priority|-priority|number|-number`); filter ids are `z.string().uuid()`, status/priority/type are enums. No raw client string ever reaches `orderBy`.
> **Cross-scope validation:** `assignedToId` + watcher ids must be `OrgMember`s of the ticket's org; `labelId(s)` must belong to that org; `sprintId`/`parentId`/`dependsOnIds` must belong to the same project — else `400`.

## Validation pattern (applies to every route)

The **runtime source of truth is a Zod schema per route** — TypeScript interfaces do not validate at runtime, and the [security checklist](06-security-checklist.md) depends on real validation. For each route, define a Zod schema and derive the type from it so type and validator can never drift:

```typescript
import { z } from 'zod'

export const createTicketSchema = z.object({
  projectId: z.string().uuid(),
  sprintId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  goal: z.string().optional(),
  constraints: z.string().optional(),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  type: z.enum(['FEATURE', 'BUG', 'CHORE', 'SPIKE']).default('FEATURE'),
  storyPoints: z.number().int().positive().optional(),
  assignedToId: z.string().uuid().optional(),
  assignedAgentType: z.enum(['CODE', 'SPEC']).optional(),
  labelIds: z.array(z.string().uuid()).optional(),
  dependsOnIds: z.array(z.string().uuid()).optional(),
  parentId: z.string().uuid().optional()
})

// Type is derived from the schema — single source of truth
export type CreateTicketBody = z.infer<typeof createTicketSchema>
```

`validate.middleware.ts` runs the matching schema's `.parse()` on the request body (and params/query where relevant) before the handler runs, returning `400` with field errors on failure. **Writing the Zod schema is the first coding task per route.**

> **From Phase 2 onward** routes use **`fastify-type-provider-zod`**: declare `schema: { body, querystring, params }` with Zod directly — Fastify validates from it *and* `@fastify/swagger` generates `/documentation` from the same schema (no drift, no separate JSON schema). Phase-1 routes keep the manual `.parse()` pattern above until migrated.
