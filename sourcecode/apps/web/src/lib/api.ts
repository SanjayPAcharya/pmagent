import { keycloak } from './auth'

const API_URL = import.meta.env.VITE_API_URL as string

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
  }
}

async function authedFetch(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
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
      signal,
    })

  let res = await doFetch()
  if (res.status === 401) {
    const refreshed = await keycloak.updateToken(-1).then(() => true).catch(() => false)
    if (refreshed) res = await doFetch()
  }
  return res
}

/** How long to wait before the single silent 429 retry: server's Retry-After
 *  (seconds), clamped to 1–10s; 1s when the header is missing/garbled. */
export function retryAfterMs(header: string | null): number {
  const s = Number(header)
  return Math.min(Math.max(Number.isFinite(s) && s > 0 ? s : 1, 1), 10) * 1000
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res = await authedFetch(method, path, body, signal)
  // Graceful 429 (2026-07-13): a transient rate-limit burst on an idempotent GET
  // self-heals with ONE silent retry after the server's Retry-After, instead of
  // flashing an error at the user. Mutations still fail fast — a write is never
  // silently re-fired.
  if (res.status === 429 && method === 'GET') {
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs(res.headers.get('retry-after'))))
    if (!signal?.aborted) res = await authedFetch(method, path, body, signal)
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string; code?: string }
    throw new ApiError(res.status, err.error ?? 'Request failed', err.code)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// GDPR export — the response is a downloadable file, not JSON to parse; pull
// the filename from Content-Disposition so the browser save-dialog matches
// what the API named it.
async function requestBlob(method: string, path: string): Promise<{ blob: Blob; filename: string }> {
  const res = await authedFetch(method, path)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string; code?: string }
    throw new ApiError(res.status, err.error ?? 'Request failed', err.code)
  }
  const match = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')
  return { blob: await res.blob(), filename: match?.[1] ?? 'export.json' }
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
export type Workstream = 'SPRINT' | 'ADHOC'

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
  milestoneId: string | null
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
  startDate: string | null
  workstream: Workstream
  position: number
  assignedToId: string | null
  assignedTo: User | null
  createdBy: User
  labels: Label[]
  watcherIds: string[]
  blockedBy?: number // count of incomplete dependencies (present on list responses)
  subtasks?: { done: number; total: number } // subtask progress (list responses; absent when childless)
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
  startDate?: string
  workstream?: Workstream
  // Resolved server-side: label names matched within the org (unknowns ignored),
  // assignee matched by member email or exact name.
  labels?: string[]
  assignee?: string
}
export interface BatchPatch {
  status?: TicketStatus
  assignedToId?: string | null
  sprintId?: string | null
  milestoneId?: string | null
  workstream?: Workstream
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
// 3.7 R2 — project milestone (target date on the timeline).
export interface Milestone {
  id: string
  projectId: string
  name: string
  description: string | null
  date: string
  done: boolean
  // 3.8.5 MS-2 — done/total over linked tickets (present on list/gantt responses).
  progress?: { done: number; total: number }
}

// 3.8.5 MS-4 — milestone detail: linked tickets with status + assignee.
export interface MilestoneDetail {
  milestone: Milestone
  progress: { done: number; total: number }
  tickets: { id: string; number: number; key: string; title: string; status: TicketStatus; assignedTo: User | null }[]
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

// 3.3 — per-project reporting aggregates (read-only)
export interface VelocityPoint {
  id: string
  name: string
  velocity: number | null
  endDate: string | null
}
export interface CycleWeek {
  weekStart: string
  count: number
  leadMedianDays: number | null
  cycleMedianDays: number | null
}
export interface CycleReport {
  windowDays: number
  closedCount: number
  leadMedianDays: number | null
  leadP85Days: number | null
  cycleMedianDays: number | null
  cycleP85Days: number | null
  weekly: CycleWeek[]
}
export interface WorkloadRow {
  userId: string | null
  name: string
  avatarUrl: string | null
  openCount: number
  inProgressCount: number
  sprintCount: number
  adhocCount: number
}
export interface ReadinessMilestone {
  id: string
  name: string
  date: string
  done: number
  total: number
}
export interface ProjectReports {
  velocity: VelocityPoint[]
  cycle: CycleReport
  workload: WorkloadRow[]
  readiness: ReadinessMilestone[]
  overall: { done: number; open: number }
}

// 3.7 R6 — Gantt payload (raw dates; all date math lives in lib/gantt.ts).
export interface GanttItem {
  id: string
  number: number
  key: string
  title: string
  status: TicketStatus
  priority: Priority
  assignedToId: string | null
  sprintId: string | null
  milestoneId: string | null
  workstream: Workstream
  startDate: string | null
  dueDate: string | null
  storyPoints: number | null
  labelIds: string[]
}
export interface GanttEdge {
  ticketId: string
  dependsOnId: string
}
export interface GanttPayload {
  items: GanttItem[]
  edges: GanttEdge[]
  milestones: Milestone[]
  truncated: boolean
}

// 3.7 R4 — project Overview dashboard aggregate.
export interface OverviewBlocker {
  id: string
  number: number
  key: string
  title: string
  openBlockerCount: number
}
export interface OverviewMilestone {
  id: string
  name: string
  date: string
  done: boolean
  readiness: { done: number; total: number }
}
export interface ProjectOverview {
  status: {
    byStatus: Partial<Record<TicketStatus, number>>
    open: number
    done: number
    byWorkstream: { SPRINT: number; ADHOC: number }
  }
  activeSprint: { id: string; name: string; endDate: string | null; total: number; done: number } | null
  blockers: OverviewBlocker[]
  milestones: OverviewMilestone[]
  capacity: { rows: WorkloadRow[]; recentVelocityAvg: number | null }
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
  parentId?: string
  milestoneId?: string
  workstream?: Workstream
  startDate?: string | null
  dueDate?: string | null
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
  startDate?: string | null
  workstream?: Workstream
  position?: number
  sprintId?: string | null
  milestoneId?: string | null
  assignedToId?: string | null
  labelIds?: string[]
  parentId?: string | null
}

// ── AI (3.8) — self-hosted drafting ──
export interface AIHealth {
  enabled: boolean
  reachable: boolean
  modelReady: boolean
  provider: string | null
}
export interface AITicketDraft {
  title: string
  description: string
  acceptanceCriteria: string[]
  priority: Priority
}
export interface AIExpandDraft {
  description: string
  acceptanceCriteria: string[]
  goal: string
  constraints: string
}
export interface AIProjectSummary {
  headline: string
  bullets: string[]
  risks: string[]
}

export const api = {
  me: () => request<{ user: User }>('GET', '/api/me'),
  updateMe: (body: { name?: string; avatarUrl?: string | null }) => request<{ user: User }>('PATCH', '/api/me', body),
  exportMyData: () => requestBlob('GET', '/api/me/export'),
  deleteMyAccount: () => request<void>('DELETE', '/api/me'),
  listOrgs: () => request<{ organizations: Organization[] }>('GET', '/api/orgs'),
  getOrg: (slug: string) => request<{ org: OrgDetail }>('GET', `/api/orgs/${slug}`),
  createOrg: (name: string) => request<{ org: Organization }>('POST', '/api/orgs', { name }),
  deleteOrg: (slug: string) => request<void>('DELETE', `/api/orgs/${slug}`),
  deleteProject: (projectId: string) => request<void>('DELETE', `/api/projects/${projectId}`),
  getProjectReports: (projectId: string) => request<{ reports: ProjectReports }>('GET', `/api/projects/${projectId}/reports`),
  getProjectOverview: (projectId: string) => request<{ overview: ProjectOverview }>('GET', `/api/projects/${projectId}/overview`),
  getProjectGantt: (projectId: string) => request<{ gantt: GanttPayload }>('GET', `/api/projects/${projectId}/gantt`),
  updateOrg: (slug: string, body: { name?: string; accentColor?: string | null }) =>
    request<{ org: Organization }>('PATCH', `/api/orgs/${slug}`, body),
  orgActivity: (slug: string) => request<{ activity: ActivityItem[] }>('GET', `/api/orgs/${slug}/activity`),
  listProjects: (orgId: string, opts?: { archivedOnly?: boolean }) =>
    request<{ projects: Project[] }>(
      'GET',
      `/api/projects?orgId=${encodeURIComponent(orgId)}${opts?.archivedOnly ? '&archivedOnly=true' : ''}`,
    ),
  archiveProject: (projectId: string) => request<{ project: Project }>('POST', `/api/projects/${projectId}/archive`),
  restoreProject: (projectId: string) => request<{ project: Project }>('POST', `/api/projects/${projectId}/restore`),
  createProject: (orgId: string, name: string, body?: { key?: string; description?: string }) =>
    request<{ project: Project }>('POST', '/api/projects', { orgId, name, ...body }),
  projectActivity: (projectId: string) =>
    request<{ activity: ActivityItem[] }>('GET', `/api/projects/${projectId}/activity`),
  updateProject: (projectId: string, body: { name?: string; description?: string; defaultBranch?: string; automation?: AutomationSettings }) =>
    request<{ project: Project }>('PATCH', `/api/projects/${projectId}`, body),

  // Milestones (3.7 R2)
  listMilestones: (projectId: string) =>
    request<{ milestones: Milestone[] }>('GET', `/api/projects/${projectId}/milestones`),
  // 3.8.5 MS-4 — milestone detail with its linked tickets.
  getMilestone: (projectId: string, id: string) =>
    request<MilestoneDetail>('GET', `/api/projects/${projectId}/milestones/${id}`),
  createMilestone: (projectId: string, body: { name: string; description?: string; date: string }) =>
    request<{ milestone: Milestone }>('POST', `/api/projects/${projectId}/milestones`, body),
  updateMilestone: (projectId: string, id: string, body: { name?: string; description?: string | null; date?: string; done?: boolean }) =>
    request<{ milestone: Milestone }>('PATCH', `/api/projects/${projectId}/milestones/${id}`, body),
  deleteMilestone: (projectId: string, id: string) =>
    request<void>('DELETE', `/api/projects/${projectId}/milestones/${id}`),

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
  // Hard delete (ADMIN) — irreversible; used from the Archived view.
  deleteTicketPermanent: (id: string) => request<void>('DELETE', `/api/tickets/${id}/permanent`),
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
  updateSprint: (id: string, body: { name?: string; goal?: string | null }) =>
    request<{ sprint: Sprint }>('PATCH', `/api/sprints/${id}`, body),
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

  // AI (3.8) — cloud drafting; all return a draft the user reviews (never auto-saves).
  // The generation calls take an AbortSignal (3.8.1 B2 cancel) — the server-side
  // call still completes and is discarded, acceptable at these token sizes.
  aiHealth: () => request<AIHealth>('GET', '/api/ai/health'),
  aiDraftTicket: (projectId: string, notes: string, signal?: AbortSignal) =>
    request<{ draft: AITicketDraft }>('POST', '/api/ai/draft-ticket', { projectId, notes }, signal),
  aiExpandTicket: (ticketId: string, prompt?: string, signal?: AbortSignal) =>
    request<{ draft: AIExpandDraft }>('POST', '/api/ai/expand-ticket', { ticketId, ...(prompt ? { prompt } : {}) }, signal),
  aiProjectSummary: (projectId: string, signal?: AbortSignal) =>
    request<{ summary: AIProjectSummary }>('POST', '/api/ai/project-summary', { projectId }, signal),
  aiSprintGoal: (sprintId: string, signal?: AbortSignal) =>
    request<{ goal: string }>('POST', '/api/ai/sprint-goal', { sprintId }, signal),
}
