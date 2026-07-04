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
export interface Organization {
  id: string
  name: string
  slug: string
  role?: string
  accentColor?: string | null
  plan?: 'FREE' | 'PRO' | 'TEAM'
  createdAt?: string
  // At-a-glance counts (present on the orgs list endpoint)
  projectCount?: number
  memberCount?: number
  openTicketCount?: number
}
export interface OrgStats {
  projectCount: number
  memberCount: number
  ticketsByStatus: Partial<Record<TicketStatus, number>>
  activeSprintCount: number
}
export interface MemberPreview { userId: string; name: string; avatarUrl: string | null; initials: string }
export interface OrgDetail extends Organization {
  stats: OrgStats
  membersPreview: MemberPreview[]
  pendingInviteCount: number
}
export interface ActiveSprintSummary {
  id: string
  name: string
  endDate: string | null
  total: number
  done: number
}
export interface Project {
  id: string
  orgId: string
  name: string
  slug: string
  key: string
  description: string | null
  defaultBranch?: string
  createdAt?: string
  updatedAt?: string
  // Per-project rollups (present on the projects list endpoint)
  openTicketCount?: number
  byStatus?: Partial<Record<TicketStatus, number>>
  activeSprint?: ActiveSprintSummary | null
  automation?: AutomationSettings | null
}
export interface AutomationSettings {
  unblockNudge?: boolean
  autoTodoOnAssign?: boolean
  subtasksDoneNudge?: boolean
}
export interface TicketTemplate {
  id: string
  orgId: string
  name: string
  type: TicketType
  priority: Priority
  title: string | null
  description: string | null
  acceptanceCriteria: string | null
  goal: string | null
  constraints: string | null
  labelIds: string[]
}
export interface ActivityItem {
  id: string
  type: string
  fromValue: string | null
  toValue: string | null
  createdAt: string
  actor: { id: string; name: string; avatarUrl: string | null } | null
  ticket: { id: string; number: number; title: string; projectId: string; projectKey: string; projectSlug: string }
}
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
  /** Tickets carrying this label — present on the list endpoint only. */
  usageCount?: number
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
  blockedBy?: number // count of incomplete dependencies (present on list responses)
  createdAt: string
  updatedAt: string
}
/** Ticket from a cross-project surface (search / my-work) — carries link slugs. */
export type TicketHit = Ticket & { orgSlug: string; projectSlug: string }
/** Project matched by the global search (by name, membership-scoped). */
export interface ProjectHit {
  id: string
  name: string
  slug: string
  key: string
  orgSlug: string
}
export interface TicketRef {
  id: string
  number: number
  key: string
  title: string
  status: TicketStatus
}
export interface TicketRelations {
  parent: TicketRef | null
  subtasks: TicketRef[]
  blockedBy: TicketRef[]
  blocks: TicketRef[]
}
export interface ImportTicketRow {
  title: string
  description?: string
  status?: TicketStatus
  priority?: Priority
  type?: TicketType
  storyPoints?: number
  acceptanceCriteria?: string
  // Resolved server-side: label names matched within the org (unknowns ignored),
  // assignee matched by member email or exact name.
  labels?: string[]
  assignee?: string
}
export interface BatchPatch {
  status?: TicketStatus
  assignedToId?: string | null
  sprintId?: string | null
  addLabelIds?: string[]
  archived?: boolean
}
export interface Comment {
  id: string
  body: string
  isInternal: boolean
  createdAt: string
  author: User | null
  reactions?: { userId: string; emoji: string }[]
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
  acceptanceCriteria?: string
  goal?: string
  constraints?: string
  labelIds?: string[]
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
  parentId?: string | null
}

export const api = {
  me: () => request<{ user: User }>('GET', '/api/me'),
  updateMe: (body: { name?: string; avatarUrl?: string | null }) => request<{ user: User }>('PATCH', '/api/me', body),
  listOrgs: () => request<{ organizations: Organization[] }>('GET', '/api/orgs'),
  getOrg: (slug: string) => request<{ org: OrgDetail }>('GET', `/api/orgs/${slug}`),
  createOrg: (name: string) => request<{ org: Organization }>('POST', '/api/orgs', { name }),
  deleteOrg: (slug: string) => request<void>('DELETE', `/api/orgs/${slug}`),
  deleteProject: (projectId: string) => request<void>('DELETE', `/api/projects/${projectId}`),
  updateOrg: (slug: string, body: { name?: string; accentColor?: string | null }) =>
    request<{ org: Organization }>('PATCH', `/api/orgs/${slug}`, body),
  orgActivity: (slug: string) => request<{ activity: ActivityItem[] }>('GET', `/api/orgs/${slug}/activity`),
  listProjects: (orgId: string) =>
    request<{ projects: Project[] }>('GET', `/api/projects?orgId=${encodeURIComponent(orgId)}`),
  createProject: (orgId: string, name: string, body?: { key?: string; description?: string }) =>
    request<{ project: Project }>('POST', '/api/projects', { orgId, name, ...body }),
  projectActivity: (projectId: string) =>
    request<{ activity: ActivityItem[] }>('GET', `/api/projects/${projectId}/activity`),
  updateProject: (projectId: string, body: { name?: string; description?: string; defaultBranch?: string; automation?: AutomationSettings }) =>
    request<{ project: Project }>('PATCH', `/api/projects/${projectId}`, body),

  // Templates (3.4 W1)
  listTemplates: (orgId: string) =>
    request<{ templates: TicketTemplate[] }>('GET', `/api/templates?orgId=${encodeURIComponent(orgId)}`),
  createTemplate: (body: Partial<TicketTemplate> & { orgId: string; name: string }) =>
    request<{ template: TicketTemplate }>('POST', '/api/templates', body),
  deleteTemplate: (id: string) => request<void>('DELETE', `/api/templates/${id}`),
  seedDefaultTemplates: (orgId: string) =>
    request<{ templates: TicketTemplate[] }>('POST', '/api/templates/seed-defaults', { orgId }),

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
  addReaction: (ticketId: string, commentId: string, emoji: string) =>
    request<{ ok: true }>('POST', `/api/tickets/${ticketId}/comments/${commentId}/reactions`, { emoji }),
  removeReaction: (ticketId: string, commentId: string, emoji: string) =>
    request<void>('DELETE', `/api/tickets/${ticketId}/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`),
  addWatcher: (id: string, userId: string) =>
    request<{ ok: true }>('POST', `/api/tickets/${id}/watchers`, { userId }),
  removeWatcher: (id: string, userId: string) =>
    request<void>('DELETE', `/api/tickets/${id}/watchers/${userId}`),

  // Relationships, search, my-work, bulk
  getRelations: (id: string) => request<{ relations: TicketRelations }>('GET', `/api/tickets/${id}/relations`),
  addDependency: (id: string, dependsOnId: string) =>
    request<{ ok: true }>('POST', `/api/tickets/${id}/dependencies`, { dependsOnId }),
  removeDependency: (id: string, dependsOnId: string) =>
    request<void>('DELETE', `/api/tickets/${id}/dependencies/${dependsOnId}`),
  searchTickets: (q: string) =>
    request<{ items: TicketHit[]; projects: ProjectHit[] }>('GET', `/api/search?q=${encodeURIComponent(q)}`),
  myWork: () => request<{ assigned: TicketHit[]; watching: TicketHit[] }>('GET', '/api/me/work'),
  batchUpdateTickets: (ids: string[], patch: BatchPatch) =>
    request<{ updated: number }>('POST', '/api/tickets/batch', { ids, patch }),
  importTickets: (projectId: string, tickets: ImportTicketRow[]) =>
    request<{ created: number }>('POST', '/api/tickets/import', { projectId, tickets }),

  // Labels (Phase 2F)
  listLabels: (orgId: string) => request<{ labels: Label[] }>('GET', `/api/labels?orgId=${encodeURIComponent(orgId)}`),
  createLabel: (orgId: string, name: string, color: string) =>
    request<{ label: Label }>('POST', '/api/labels', { orgId, name, color }),
  updateLabel: (id: string, body: { name?: string; color?: string }) =>
    request<{ label: Label }>('PATCH', `/api/labels/${id}`, body),
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
