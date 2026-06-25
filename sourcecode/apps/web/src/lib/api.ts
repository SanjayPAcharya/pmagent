import { keycloak } from './auth'

const API_URL = import.meta.env.VITE_API_URL as string

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Keep the access token fresh (refresh if it expires within 30s).
  await keycloak.updateToken(30).catch(() => undefined)

  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: {
        // Only declare a JSON body when we actually send one — Fastify rejects
        // `Content-Type: application/json` with an empty body (400), which breaks
        // body-less calls (DELETE, start/complete sprint, mark-read).
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

  let res = await doFetch()
  if (res.status === 401) {
    const refreshed = await keycloak.updateToken(-1).then(() => true).catch(() => false)
    if (refreshed) res = await doFetch()
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string }
    throw new ApiError(res.status, err.error ?? 'Request failed')
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Types (subset of the API responses) ──
export interface User { id: string; email: string; name: string; avatarUrl: string | null }
export interface Organization { id: string; name: string; slug: string; role?: string; accentColor?: string | null }
export interface Project { id: string; orgId: string; name: string; slug: string; description: string | null }
export interface Member {
  userId: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  email: string
  name: string
  avatarUrl: string | null
  initials: string
  joinedAt: string
}
export type OrgRole = 'ADMIN' | 'MEMBER'
export interface Invite {
  id: string
  token: string
  role: OrgRole
  email: string | null
  expiresAt: string
  url?: string // present on create; build from token elsewhere
}

export type TicketStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE' | 'CANCELLED'
export type Priority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
export type TicketType = 'FEATURE' | 'BUG' | 'CHORE' | 'SPIKE'

export interface Label {
  id: string
  name: string
  color: string
}
export interface Ticket {
  id: string
  number: number
  key: string
  projectId: string
  sprintId: string | null
  title: string
  description: string | null
  acceptanceCriteria: string | null
  goal: string | null
  constraints: string | null
  status: TicketStatus
  priority: Priority
  type: TicketType
  storyPoints: number | null
  dueDate: string | null
  position: number
  assignedToId: string | null
  assignedTo: User | null
  createdBy: User
  labels: Label[]
  watcherIds: string[]
  createdAt: string
  updatedAt: string
}
export interface Comment {
  id: string
  body: string
  isInternal: boolean
  createdAt: string
  author: User | null
}
export interface Activity {
  id: string
  type: string
  fromValue: string | null
  toValue: string | null
  createdAt: string
  actor: User | null
}
export interface Sprint {
  id: string
  projectId: string
  name: string
  goal: string | null
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  startDate: string | null
  endDate: string | null
  velocity: number | null
  _count?: { tickets: number }
}
export interface Burndown {
  total: number
  unit: 'points' | 'tickets'
  points: { date: string; ideal: number; remaining: number | null }[]
}
export interface SprintCounts {
  total: number
  done: number
  byStatus: Partial<Record<TicketStatus, number>>
}
export interface Notification {
  id: string
  type: string
  ticketId: string | null
  body: string
  subject: string | null
  readAt: string | null
  createdAt: string
}

export interface CreateTicketInput {
  projectId: string
  title: string
  status?: TicketStatus
  priority?: Priority
  type?: TicketType
  description?: string
  assignedToId?: string
  sprintId?: string
  storyPoints?: number
}
export interface UpdateTicketInput {
  title?: string
  description?: string | null
  acceptanceCriteria?: string | null
  goal?: string | null
  constraints?: string | null
  status?: TicketStatus
  priority?: Priority
  type?: TicketType
  storyPoints?: number | null
  dueDate?: string | null
  position?: number
  sprintId?: string | null
  assignedToId?: string | null
  labelIds?: string[]
}

export const api = {
  me: () => request<{ user: User }>('GET', '/api/me'),
  listOrgs: () => request<{ organizations: Organization[] }>('GET', '/api/orgs'),
  getOrg: (slug: string) => request<{ org: Organization }>('GET', `/api/orgs/${slug}`),
  createOrg: (name: string) => request<{ org: Organization }>('POST', '/api/orgs', { name }),
  updateOrg: (slug: string, body: { name?: string; accentColor?: string | null }) =>
    request<{ org: Organization }>('PATCH', `/api/orgs/${slug}`, body),
  listProjects: (orgId: string) =>
    request<{ projects: Project[] }>('GET', `/api/projects?orgId=${encodeURIComponent(orgId)}`),
  createProject: (orgId: string, name: string) =>
    request<{ project: Project }>('POST', '/api/projects', { orgId, name }),

  // Members & invites (Phase 2D)
  listMembers: (slug: string) => request<{ members: Member[] }>('GET', `/api/orgs/${slug}/members`),
  addMember: (slug: string, email: string, role: OrgRole) =>
    request<{ member: { userId: string; role: string; email: string; name: string } }>(
      'POST',
      `/api/orgs/${slug}/members`,
      { email, role },
    ),
  createInvite: (slug: string, body: { email?: string; role?: OrgRole }) =>
    request<{ invite: Invite }>('POST', `/api/orgs/${slug}/invites`, body),
  listInvites: (slug: string) => request<{ invites: Invite[] }>('GET', `/api/orgs/${slug}/invites`),
  revokeInvite: (slug: string, id: string) => request<void>('DELETE', `/api/orgs/${slug}/invites/${id}`),
  acceptInvite: (token: string) =>
    request<{ org: { id: string; slug: string; name: string }; role: string }>(
      'POST',
      `/api/invites/${encodeURIComponent(token)}/accept`,
    ),

  // Tickets (Phase 2E)
  listTickets: (projectId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ projectId, limit: '200', ...params }).toString()
    return request<{ items: Ticket[]; nextCursor: string | null }>('GET', `/api/tickets?${qs}`)
  },
  getTicket: (id: string) => request<{ ticket: Ticket }>('GET', `/api/tickets/${id}`),
  createTicket: (input: CreateTicketInput) => request<{ ticket: Ticket }>('POST', '/api/tickets', input),
  updateTicket: (id: string, input: UpdateTicketInput) =>
    request<{ ticket: Ticket }>('PATCH', `/api/tickets/${id}`, input),
  updateTicketStatus: (id: string, status: TicketStatus) =>
    request<{ ticket: Ticket }>('PATCH', `/api/tickets/${id}/status`, { status }),
  deleteTicket: (id: string) => request<void>('DELETE', `/api/tickets/${id}`),
  listComments: (id: string) => request<{ comments: Comment[] }>('GET', `/api/tickets/${id}/comments`),
  addComment: (id: string, body: string) =>
    request<{ comment: Comment }>('POST', `/api/tickets/${id}/comments`, { body }),
  listActivity: (id: string) => request<{ activity: Activity[] }>('GET', `/api/tickets/${id}/activity`),
  addWatcher: (id: string, userId: string) =>
    request<{ ok: true }>('POST', `/api/tickets/${id}/watchers`, { userId }),
  removeWatcher: (id: string, userId: string) =>
    request<void>('DELETE', `/api/tickets/${id}/watchers/${userId}`),

  // Labels (Phase 2F)
  listLabels: (orgId: string) => request<{ labels: Label[] }>('GET', `/api/labels?orgId=${encodeURIComponent(orgId)}`),
  createLabel: (orgId: string, name: string, color: string) =>
    request<{ label: Label }>('POST', '/api/labels', { orgId, name, color }),
  deleteLabel: (id: string) => request<void>('DELETE', `/api/labels/${id}`),

  // Sprints (Phase 2E)
  listSprints: (projectId: string) =>
    request<{ sprints: Sprint[] }>('GET', `/api/sprints?projectId=${encodeURIComponent(projectId)}`),
  getSprint: (id: string) =>
    request<{ sprint: Sprint; tickets: Ticket[]; counts: SprintCounts }>('GET', `/api/sprints/${id}`),
  getBurndown: (id: string) => request<Burndown>('GET', `/api/sprints/${id}/burndown`),
  createSprint: (projectId: string, name: string, goal?: string) =>
    request<{ sprint: Sprint }>('POST', '/api/sprints', { projectId, name, goal }),
  startSprint: (id: string) => request<{ sprint: Sprint }>('POST', `/api/sprints/${id}/start`),
  completeSprint: (id: string) =>
    request<{ sprint: Sprint; counts: SprintCounts }>('POST', `/api/sprints/${id}/complete`),
  addToSprint: (id: string, ticketIds: string[]) =>
    request<{ counts: SprintCounts }>('POST', `/api/sprints/${id}/tickets`, { ticketIds }),
  removeFromSprint: (id: string, ticketId: string) =>
    request<void>('DELETE', `/api/sprints/${id}/tickets/${ticketId}`),

  // Notifications (Phase 2E)
  listNotifications: () => request<{ items: Notification[]; nextCursor: string | null }>('GET', '/api/notifications'),
  unreadCount: () => request<{ count: number }>('GET', '/api/notifications/unread-count'),
  markNotificationRead: (id: string) => request<{ ok: true }>('POST', `/api/notifications/${id}/read`),
  markAllNotificationsRead: () => request<{ updated: number }>('POST', '/api/notifications/read-all'),
}
