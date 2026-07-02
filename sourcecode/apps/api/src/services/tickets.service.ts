import type { Prisma, PrismaClient, TicketActivityType } from '@prisma/client'
import { prisma } from '../db/client.js'
import { ApiError } from '../lib/errors.js'
import type { DomainEvent } from '../events/event-bus.js'

// Tx-or-client: service helpers run inside a transaction during create/update,
// but the validation helpers also work standalone.
type Db = PrismaClient | Prisma.TransactionClient

/** Shape returned to clients — sprint/labels/people resolved, watcher ids only. */
export const ticketInclude = {
  project: { select: { id: true, name: true, slug: true, key: true } },
  sprint: true,
  assignedTo: { select: { id: true, name: true, email: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  labels: { include: { label: true } },
  watchers: { select: { userId: true } },
} satisfies Prisma.TicketInclude

type TicketWithIncludes = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>

/** Flatten the TicketLabel join so the response matches the `labels: Label[]` contract. */
export function serializeTicket(t: TicketWithIncludes) {
  const { labels, watchers, ...rest } = t
  return {
    ...rest,
    key: `${t.project.key}-${t.number}`,
    labels: labels.map((tl) => tl.label),
    watcherIds: watchers.map((w) => w.userId),
  }
}

// ─── Cross-scope validation ──────────────────────────────────
// Every referenced entity must live in the ticket's own org/project, checked
// after the org-role gate. A mismatch is a 400 (caller error), not a 403.

async function assertOrgMember(db: Db, orgId: string, userId: string, label: string) {
  const m = await db.orgMember.findUnique({ where: { orgId_userId: { orgId, userId } } })
  if (!m) throw new ApiError(400, `${label} is not a member of this organization`, 'CROSS_SCOPE')
}

async function assertLabelsInOrg(db: Db, orgId: string, labelIds: string[]) {
  if (labelIds.length === 0) return
  const found = await db.label.count({ where: { id: { in: labelIds }, orgId } })
  if (found !== new Set(labelIds).size)
    throw new ApiError(400, 'One or more labels do not belong to this organization', 'CROSS_SCOPE')
}

async function assertSprintInProject(db: Db, projectId: string, sprintId: string) {
  const s = await db.sprint.findUnique({ where: { id: sprintId } })
  if (!s || s.projectId !== projectId)
    throw new ApiError(400, 'Sprint does not belong to this project', 'CROSS_SCOPE')
}

async function assertTicketsInProject(db: Db, projectId: string, ticketIds: string[], label: string) {
  if (ticketIds.length === 0) return
  const found = await db.ticket.count({ where: { id: { in: ticketIds }, projectId } })
  if (found !== new Set(ticketIds).size)
    throw new ApiError(400, `${label} do not belong to this project`, 'CROSS_SCOPE')
}

// ─── Create ──────────────────────────────────────────────────

export interface CreateTicketInput {
  projectId: string
  sprintId?: string
  title: string
  status?: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE' | 'CANCELLED'
  description?: string
  acceptanceCriteria?: string
  goal?: string
  constraints?: string
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  type?: 'FEATURE' | 'BUG' | 'CHORE' | 'SPIKE'
  storyPoints?: number
  dueDate?: string
  assignedToId?: string
  assignedAgentType?: 'CODE' | 'SPEC'
  labelIds?: string[]
  dependsOnIds?: string[]
  parentId?: string
}

export interface ServiceResult {
  ticket: ReturnType<typeof serializeTicket>
  events: DomainEvent[]
}

/**
 * Transactional create with atomic per-project numbering. The number comes from
 * incrementing Project.ticketCounter inside the same transaction, so concurrent
 * creates can never collide on (projectId, number). New cards sort to the end of
 * the BACKLOG column. Returns a `ticket.created` event to publish after commit.
 */
export async function createTicket(orgId: string, createdById: string, input: CreateTicketInput): Promise<ServiceResult> {
  const labelIds = input.labelIds ?? []
  const dependsOnIds = input.dependsOnIds ?? []

  const ticket = await prisma.$transaction(async (tx) => {
    if (input.assignedToId) await assertOrgMember(tx, orgId, input.assignedToId, 'Assignee')
    await assertLabelsInOrg(tx, orgId, labelIds)
    if (input.sprintId) await assertSprintInProject(tx, input.projectId, input.sprintId)
    if (input.parentId) await assertTicketsInProject(tx, input.projectId, [input.parentId], 'Parent ticket')
    await assertTicketsInProject(tx, input.projectId, dependsOnIds, 'Dependencies')

    const project = await tx.project.update({
      where: { id: input.projectId },
      data: { ticketCounter: { increment: 1 } },
      select: { ticketCounter: true },
    })
    const number = project.ticketCounter

    const status = input.status ?? 'BACKLOG'
    // New card sorts to the end of its target column.
    const last = await tx.ticket.findFirst({
      where: { projectId: input.projectId, status },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    const position = (last?.position ?? 0) + 1000

    // Creator + assignee auto-watch.
    const watcherIds = new Set<string>([createdById])
    if (input.assignedToId) watcherIds.add(input.assignedToId)

    const created = await tx.ticket.create({
      data: {
        projectId: input.projectId,
        sprintId: input.sprintId,
        number,
        title: input.title,
        status,
        description: input.description,
        acceptanceCriteria: input.acceptanceCriteria,
        goal: input.goal,
        constraints: input.constraints,
        priority: input.priority ?? 'MEDIUM',
        type: input.type ?? 'FEATURE',
        storyPoints: input.storyPoints,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        assignedToId: input.assignedToId,
        assignedAgentType: input.assignedAgentType,
        parentId: input.parentId,
        position,
        createdById,
        labels: { create: labelIds.map((labelId) => ({ labelId })) },
        dependencies: { create: dependsOnIds.map((dependsOnId) => ({ dependsOnId })) },
        watchers: { create: [...watcherIds].map((userId) => ({ userId })) },
        activity: { create: { actorId: createdById, type: 'CREATED' } },
      },
      include: ticketInclude,
    })
    return created
  })

  return {
    ticket: serializeTicket(ticket),
    events: [{ type: 'ticket.created', payload: { projectId: ticket.projectId, ticketId: ticket.id, actorId: createdById } }],
  }
}

// ─── Update ──────────────────────────────────────────────────

export interface UpdateTicketInput {
  title?: string
  description?: string
  acceptanceCriteria?: string
  goal?: string
  constraints?: string
  status?: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE' | 'CANCELLED'
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  type?: 'FEATURE' | 'BUG' | 'CHORE' | 'SPIKE'
  storyPoints?: number | null
  dueDate?: string | null
  position?: number
  sprintId?: string | null
  assignedToId?: string | null
  labelIds?: string[]
  parentId?: string | null
}

/**
 * Update a ticket and record activity for each meaningful change, all in one
 * transaction. Returns the updated ticket plus the events the caller publishes
 * AFTER commit (so subscribers never see a row the transaction later rolls back).
 */
export async function updateTicket(
  ticketId: string,
  orgId: string,
  actorId: string,
  input: UpdateTicketInput,
): Promise<ServiceResult> {
  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.ticket.findUnique({ where: { id: ticketId } })
    if (!before) throw new ApiError(404, 'Ticket not found')

    const has = <K extends keyof UpdateTicketInput>(k: K) => Object.prototype.hasOwnProperty.call(input, k)

    if (input.assignedToId) await assertOrgMember(tx, orgId, input.assignedToId, 'Assignee')
    if (input.sprintId) await assertSprintInProject(tx, before.projectId, input.sprintId)
    if (has('labelIds')) await assertLabelsInOrg(tx, orgId, input.labelIds ?? [])
    // Parent must be in the same project; walk ancestors to reject a cycle.
    if (has('parentId') && input.parentId) {
      if (input.parentId === ticketId) throw new ApiError(400, 'A ticket cannot be its own parent', 'CYCLE')
      await assertTicketsInProject(tx, before.projectId, [input.parentId], 'Parent ticket')
      let cursor: string | null = input.parentId
      for (let i = 0; i < 100 && cursor; i++) {
        const p: { parentId: string | null } | null = await tx.ticket.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        })
        if (p?.parentId === ticketId) throw new ApiError(400, 'That would create a circular parent link', 'CYCLE')
        cursor = p?.parentId ?? null
      }
    }

    const activity: { type: TicketActivityType; fromValue: string | null; toValue: string | null }[] = []

    if (has('status') && input.status !== before.status)
      activity.push({ type: 'STATUS_CHANGED', fromValue: before.status, toValue: input.status! })
    if (has('priority') && input.priority !== before.priority)
      activity.push({ type: 'PRIORITY_CHANGED', fromValue: before.priority, toValue: input.priority! })
    if (has('assignedToId') && input.assignedToId !== before.assignedToId)
      activity.push({ type: 'ASSIGNED', fromValue: before.assignedToId, toValue: input.assignedToId ?? null })
    if (has('sprintId') && input.sprintId !== before.sprintId)
      activity.push({ type: 'SPRINT_CHANGED', fromValue: before.sprintId, toValue: input.sprintId ?? null })

    // New assignee auto-watches (before the update so the response reflects it).
    if (input.assignedToId && input.assignedToId !== before.assignedToId) {
      await tx.ticketWatcher.upsert({
        where: { ticketId_userId: { ticketId, userId: input.assignedToId } },
        create: { ticketId, userId: input.assignedToId },
        update: {},
      })
    }

    return tx.ticket.update({
      where: { id: ticketId },
      data: {
        title: input.title,
        description: input.description,
        acceptanceCriteria: input.acceptanceCriteria,
        goal: input.goal,
        constraints: input.constraints,
        status: input.status,
        priority: input.priority,
        type: input.type,
        storyPoints: input.storyPoints,
        position: input.position,
        dueDate: has('dueDate') ? (input.dueDate ? new Date(input.dueDate) : null) : undefined,
        sprintId: has('sprintId') ? input.sprintId : undefined,
        parentId: has('parentId') ? input.parentId : undefined,
        assignedToId: has('assignedToId') ? input.assignedToId : undefined,
        // Replace the whole label set when labelIds is provided.
        labels: has('labelIds')
          ? { deleteMany: {}, create: (input.labelIds ?? []).map((labelId) => ({ labelId })) }
          : undefined,
        activity: activity.length ? { create: activity.map((a) => ({ ...a, actorId })) } : undefined,
      },
      include: ticketInclude,
    })
  })

  return {
    ticket: serializeTicket(result),
    events: [{ type: 'ticket.updated', payload: { projectId: result.projectId, ticketId: result.id, actorId } }],
  }
}
