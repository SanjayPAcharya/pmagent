import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { OrgRole, Prisma } from '@prisma/client'
import { z } from 'zod'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { assertOrgRole } from '../services/authz.js'
import { ApiError } from '../lib/errors.js'
import { publishEvent } from '../events/event-bus.js'
import { decodeCursor, paginate, DEFAULT_LIMIT, MAX_LIMIT } from '../lib/pagination.js'
import {
  createTicket,
  updateTicket,
  serializeTicket,
  ticketInclude,
  type CreateTicketInput,
  type UpdateTicketInput,
} from '../services/tickets.service.js'
import { parseMentions, filterOrgMembers } from '../services/notifications.service.js'
import { blockedByCounts, getRelations, addDependency, removeDependency } from '../services/relations.service.js'

const priorityEnum = z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW'])
const typeEnum = z.enum(['FEATURE', 'BUG', 'CHORE', 'SPIKE'])
const statusEnum = z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE', 'CANCELLED'])
const sortEnum = z.enum(['position', '-position', 'updatedAt', '-updatedAt', 'priority', '-priority', 'number', '-number'])

const createTicketSchema = z.object({
  projectId: z.string().uuid(),
  sprintId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  status: statusEnum.optional(),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  goal: z.string().optional(),
  constraints: z.string().optional(),
  priority: priorityEnum.optional(),
  type: typeEnum.optional(),
  storyPoints: z.number().int().positive().optional(),
  dueDate: z.string().datetime().optional(),
  assignedToId: z.string().uuid().optional(),
  assignedAgentType: z.enum(['CODE', 'SPEC']).optional(),
  labelIds: z.array(z.string().uuid()).optional(),
  dependsOnIds: z.array(z.string().uuid()).optional(),
  parentId: z.string().uuid().optional(),
})

const updateTicketSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().nullable(),
    acceptanceCriteria: z.string().nullable(),
    goal: z.string().nullable(),
    constraints: z.string().nullable(),
    status: statusEnum,
    priority: priorityEnum,
    type: typeEnum,
    storyPoints: z.number().int().positive().nullable(),
    dueDate: z.string().datetime().nullable(),
    position: z.number(),
    sprintId: z.string().uuid().nullable(),
    assignedToId: z.string().uuid().nullable(),
    labelIds: z.array(z.string().uuid()),
    parentId: z.string().uuid().nullable(),
  })
  .partial()

const batchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  patch: z
    .object({
      status: statusEnum,
      assignedToId: z.string().uuid().nullable(),
      sprintId: z.string().uuid().nullable(),
      addLabelIds: z.array(z.string().uuid()),
      archived: z.boolean(),
    })
    .partial(),
})
const dependencySchema = z.object({ dependsOnId: z.string().uuid() })

// 3.4 W4 — CSV import: pre-validated rows from the client (headers already
// alias-mapped there). Capped to keep a bad file from hammering the counter.
const importSchema = z.object({
  projectId: z.string().uuid(),
  tickets: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(10_000).optional(),
        status: statusEnum.optional(),
        priority: priorityEnum.optional(),
        type: typeEnum.optional(),
        storyPoints: z.number().int().positive().optional(),
        acceptanceCriteria: z.string().max(10_000).optional(),
        // Resolved here, not on the client: label names matched case-insensitively
        // within the org (unknowns dropped), assignee matched by member email/name.
        labels: z.array(z.string().min(1).max(50)).max(20).optional(),
        assignee: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(500),
})

const listQuerySchema = z.object({
  projectId: z.string().uuid(),
  q: z.string().max(200).optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  type: typeEnum.optional(),
  assignedToId: z.string().uuid().optional(),
  labelId: z.string().uuid().optional(),
  sprintId: z.string().uuid().optional(),
  includeArchived: z.coerce.boolean().optional(),
  sort: sortEnum.default('position'),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: z.string().optional(),
})

const idParams = z.object({ ticketId: z.string().uuid() })
const commentSchema = z.object({ body: z.string().min(1).max(10_000), isInternal: z.boolean().optional() })
const watcherSchema = z.object({ userId: z.string().uuid() })

// position|-position → [{ position: 'asc' }, { id: 'asc' }]; id tiebreaker keeps the cursor a total order.
function buildOrderBy(sort: z.infer<typeof sortEnum>): Prisma.TicketOrderByWithRelationInput[] {
  const desc = sort.startsWith('-')
  const field = (desc ? sort.slice(1) : sort) as 'position' | 'updatedAt' | 'priority' | 'number'
  const dir = desc ? 'desc' : 'asc'
  return [{ [field]: dir }, { id: dir }]
}

/** Load a ticket + its project's orgId and assert the caller has >= min role. */
async function loadTicketAuthorized(request: FastifyRequest, min: OrgRole) {
  const { ticketId } = request.params as { ticketId: string }
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { project: { select: { orgId: true } } },
  })
  if (!ticket) throw new ApiError(404, 'Ticket not found')
  await assertOrgRole(request.userId!, ticket.project.orgId, min)
  return ticket
}

const routes: FastifyPluginAsync = async (app) => {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', requireAuth)

  // ── Create ──────────────────────────────────────────────
  r.post('/', { schema: { body: createTicketSchema, tags: ['tickets'] } }, async (request, reply) => {
    const body = request.body
    const project = await prisma.project.findUnique({ where: { id: body.projectId }, select: { orgId: true } })
    if (!project) throw new ApiError(404, 'Project not found')
    await assertOrgRole(request.userId!, project.orgId, 'MEMBER')

    const { ticket, events } = await createTicket(project.orgId, request.userId!, body as CreateTicketInput)
    for (const e of events) await publishEvent(e.type, e.payload)
    return reply.code(201).send({ ticket })
  })

  // ── List (filter / sort / cursor) ───────────────────────
  r.get('/', { schema: { querystring: listQuerySchema, tags: ['tickets'] } }, async (request) => {
    const q = request.query
    const project = await prisma.project.findUnique({ where: { id: q.projectId }, select: { orgId: true } })
    if (!project) throw new ApiError(404, 'Project not found')
    await assertOrgRole(request.userId!, project.orgId, 'MEMBER')

    const where: Prisma.TicketWhereInput = { projectId: q.projectId }
    if (!q.includeArchived) where.archivedAt = null
    if (q.status) where.status = q.status
    if (q.priority) where.priority = q.priority
    if (q.type) where.type = q.type
    if (q.assignedToId) where.assignedToId = q.assignedToId
    if (q.sprintId) where.sprintId = q.sprintId
    if (q.labelId) where.labels = { some: { labelId: q.labelId } }
    if (q.q) {
      const or: Prisma.TicketWhereInput[] = [{ title: { contains: q.q, mode: 'insensitive' } }]
      if (/^\d+$/.test(q.q)) or.push({ number: Number(q.q) })
      where.OR = or
    }

    const rows = await prisma.ticket.findMany({
      where,
      include: ticketInclude,
      orderBy: buildOrderBy(q.sort),
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: decodeCursor(q.cursor) }, skip: 1 } : {}),
    })
    const { items, nextCursor } = paginate(rows, q.limit)
    const blocked = await blockedByCounts(items.map((t) => t.id))
    return {
      items: items.map((t) => ({ ...serializeTicket(t), blockedBy: blocked.get(t.id) ?? 0 })),
      nextCursor,
    }
  })

  // ── Read one ────────────────────────────────────────────
  r.get('/:ticketId', { schema: { params: idParams, tags: ['tickets'] } }, async (request) => {
    await loadTicketAuthorized(request, 'MEMBER')
    const ticket = await prisma.ticket.findUnique({ where: { id: request.params.ticketId }, include: ticketInclude })
    return { ticket: serializeTicket(ticket!) }
  })

  // ── Update ──────────────────────────────────────────────
  r.patch('/:ticketId', { schema: { params: idParams, body: updateTicketSchema, tags: ['tickets'] } }, async (request) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    const { ticket, events } = await updateTicket(t.id, t.project.orgId, request.userId!, request.body as UpdateTicketInput)
    for (const e of events) await publishEvent(e.type, e.payload)
    return { ticket }
  })

  // ── Status-only (JIRA-style quick change) ───────────────
  r.patch('/:ticketId/status', { schema: { params: idParams, body: z.object({ status: statusEnum }), tags: ['tickets'] } }, async (request) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    const { ticket, events } = await updateTicket(t.id, t.project.orgId, request.userId!, { status: request.body.status })
    for (const e of events) await publishEvent(e.type, e.payload)
    return { ticket }
  })

  // ── Soft delete ─────────────────────────────────────────
  r.delete('/:ticketId', { schema: { params: idParams, tags: ['tickets'] } }, async (request, reply) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    await prisma.ticket.update({ where: { id: t.id }, data: { archivedAt: new Date() } })
    await publishEvent('ticket.deleted', { projectId: t.projectId, ticketId: t.id, actorId: request.userId! })
    return reply.code(204).send()
  })

  // ── Comments ────────────────────────────────────────────
  r.post('/:ticketId/comments', { schema: { params: idParams, body: commentSchema, tags: ['tickets'] } }, async (request, reply) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    const comment = await prisma.comment.create({
      data: { ticketId: t.id, authorId: request.userId!, body: request.body.body, isInternal: request.body.isInternal ?? false },
      include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    })
    // Resolve @[uuid] mentions, org-bounded, so only real org members are notified.
    const mentionedUserIds = await filterOrgMembers(t.project.orgId, parseMentions(request.body.body))
    await publishEvent('ticket.commented', {
      projectId: t.projectId,
      ticketId: t.id,
      actorId: request.userId!,
      mentionedUserIds,
    })
    return reply.code(201).send({ comment })
  })

  r.get('/:ticketId/comments', { schema: { params: idParams, tags: ['tickets'] } }, async (request) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    const comments = await prisma.comment.findMany({
      where: { ticketId: t.id },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reactions: { select: { userId: true, emoji: true } },
      },
    })
    return { comments }
  })

  // ── Comment reactions (3.2 C3) — fixed emoji set, one per user+emoji ──
  const reactionEmoji = z.enum(['👍', '🎉', '👀', '❤️'])
  const commentParams = idParams.extend({ commentId: z.string().uuid() })

  r.post('/:ticketId/comments/:commentId/reactions', { schema: { params: commentParams, body: z.object({ emoji: reactionEmoji }), tags: ['tickets'] } }, async (request, reply) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    const { commentId } = request.params
    const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { ticketId: true } })
    if (!comment || comment.ticketId !== t.id) throw new ApiError(404, 'Comment not found')
    await prisma.commentReaction.upsert({
      where: { commentId_userId_emoji: { commentId, userId: request.userId!, emoji: request.body.emoji } },
      create: { commentId, userId: request.userId!, emoji: request.body.emoji },
      update: {},
    })
    return reply.code(201).send({ ok: true })
  })

  r.delete('/:ticketId/comments/:commentId/reactions/:emoji', { schema: { params: commentParams.extend({ emoji: z.string() }), tags: ['tickets'] } }, async (request, reply) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    const { commentId, emoji } = request.params
    const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { ticketId: true } })
    if (!comment || comment.ticketId !== t.id) throw new ApiError(404, 'Comment not found')
    await prisma.commentReaction.deleteMany({ where: { commentId, userId: request.userId!, emoji } })
    return reply.code(204).send()
  })

  // ── Watchers (CC) ───────────────────────────────────────
  r.post('/:ticketId/watchers', { schema: { params: idParams, body: watcherSchema, tags: ['tickets'] } }, async (request, reply) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    const member = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: t.project.orgId, userId: request.body.userId } },
    })
    if (!member) throw new ApiError(400, 'User is not a member of this organization', 'CROSS_SCOPE')

    await prisma.$transaction([
      prisma.ticketWatcher.upsert({
        where: { ticketId_userId: { ticketId: t.id, userId: request.body.userId } },
        create: { ticketId: t.id, userId: request.body.userId },
        update: {},
      }),
      prisma.ticketActivity.create({
        data: { ticketId: t.id, actorId: request.userId!, type: 'WATCHER_ADDED', toValue: request.body.userId },
      }),
    ])
    await publishEvent('ticket.updated', { projectId: t.projectId, ticketId: t.id, actorId: request.userId! })
    return reply.code(201).send({ ok: true })
  })

  r.delete('/:ticketId/watchers/:userId', { schema: { params: idParams.extend({ userId: z.string().uuid() }), tags: ['tickets'] }, }, async (request, reply) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    const { userId } = request.params
    await prisma.$transaction([
      prisma.ticketWatcher.deleteMany({ where: { ticketId: t.id, userId } }),
      prisma.ticketActivity.create({ data: { ticketId: t.id, actorId: request.userId!, type: 'WATCHER_REMOVED', fromValue: userId } }),
    ])
    await publishEvent('ticket.updated', { projectId: t.projectId, ticketId: t.id, actorId: request.userId! })
    return reply.code(204).send()
  })

  // ── Activity timeline ───────────────────────────────────
  r.get('/:ticketId/activity', { schema: { params: idParams, tags: ['tickets'] } }, async (request) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    const activity = await prisma.ticketActivity.findMany({
      where: { ticketId: t.id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    })
    return { activity }
  })

  // ── Relationships (parent / subtasks / blocked-by / blocks) ─
  r.get('/:ticketId/relations', { schema: { params: idParams, tags: ['tickets'] } }, async (request) => {
    await loadTicketAuthorized(request, 'MEMBER')
    return { relations: await getRelations(request.params.ticketId) }
  })

  r.post('/:ticketId/dependencies', { schema: { params: idParams, body: dependencySchema, tags: ['tickets'] } }, async (request, reply) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    // The dependency target must live in the same project.
    const dep = await prisma.ticket.findUnique({ where: { id: request.body.dependsOnId }, select: { projectId: true } })
    if (!dep || dep.projectId !== t.projectId)
      throw new ApiError(400, 'Dependency must be in the same project', 'CROSS_SCOPE')
    await addDependency(t.id, request.body.dependsOnId)
    await publishEvent('ticket.updated', { projectId: t.projectId, ticketId: t.id, actorId: request.userId! })
    return reply.code(201).send({ ok: true })
  })

  r.delete('/:ticketId/dependencies/:dependsOnId', { schema: { params: idParams.extend({ dependsOnId: z.string().uuid() }), tags: ['tickets'] } }, async (request, reply) => {
    const t = await loadTicketAuthorized(request, 'MEMBER')
    await removeDependency(t.id, request.params.dependsOnId)
    await publishEvent('ticket.updated', { projectId: t.projectId, ticketId: t.id, actorId: request.userId! })
    return reply.code(204).send()
  })

  // ── CSV import (3.4 W4) ─────────────────────────────────
  r.post('/import', { schema: { body: importSchema, tags: ['tickets'] } }, async (request, reply) => {
    const { projectId, tickets } = request.body
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { orgId: true } })
    if (!project) throw new ApiError(404, 'Project not found')
    await assertOrgRole(request.userId!, project.orgId, 'MEMBER')

    // Resolve label names / assignee identifiers once for the whole file.
    // Unknown values are silently dropped — a half-matching import should
    // still land the tickets.
    const needsLookups = tickets.some((t) => t.labels?.length || t.assignee)
    const labelByName = new Map<string, string>()
    const memberByKey = new Map<string, string>()
    if (needsLookups) {
      const [orgLabels, orgMembers] = await Promise.all([
        prisma.label.findMany({ where: { orgId: project.orgId }, select: { id: true, name: true } }),
        prisma.orgMember.findMany({
          where: { orgId: project.orgId },
          select: { userId: true, user: { select: { email: true, name: true } } },
        }),
      ])
      for (const l of orgLabels) labelByName.set(l.name.toLowerCase(), l.id)
      // Email wins over a same-string name; names only match exactly (case-insensitive).
      for (const m of orgMembers) if (m.user.name) memberByKey.set(m.user.name.toLowerCase(), m.userId)
      for (const m of orgMembers) memberByKey.set(m.user.email.toLowerCase(), m.userId)
    }

    let created = 0
    for (const { labels, assignee, ...row } of tickets) {
      const labelIds = [...new Set(labels?.map((n) => labelByName.get(n.trim().toLowerCase())).filter((id): id is string => !!id))]
      const assignedToId = assignee ? memberByKey.get(assignee.trim().toLowerCase()) : undefined
      const { events } = await createTicket(project.orgId, request.userId!, {
        projectId,
        ...row,
        labelIds: labelIds.length ? labelIds : undefined,
        assignedToId,
      })
      for (const e of events) await publishEvent(e.type, e.payload)
      created++
    }
    return reply.code(201).send({ created })
  })

  // ── Bulk update (board / list multi-select) ─────────────
  r.post('/batch', { schema: { body: batchSchema, tags: ['tickets'] } }, async (request) => {
    const { ids, patch } = request.body
    const tickets = await prisma.ticket.findMany({
      where: { id: { in: ids } },
      select: { id: true, projectId: true, project: { select: { orgId: true } } },
    })
    if (tickets.length !== new Set(ids).size) throw new ApiError(404, 'One or more tickets not found')
    const orgIds = new Set(tickets.map((t) => t.project.orgId))
    if (orgIds.size !== 1) throw new ApiError(400, 'Tickets must belong to a single organization', 'CROSS_SCOPE')
    const orgId = [...orgIds][0]
    await assertOrgRole(request.userId!, orgId, 'MEMBER')

    const fieldPatch: UpdateTicketInput = {}
    if (patch.status !== undefined) fieldPatch.status = patch.status
    if (patch.assignedToId !== undefined) fieldPatch.assignedToId = patch.assignedToId
    if (patch.sprintId !== undefined) fieldPatch.sprintId = patch.sprintId
    const hasFieldPatch = Object.keys(fieldPatch).length > 0

    if (patch.addLabelIds?.length) {
      const n = await prisma.label.count({ where: { id: { in: patch.addLabelIds }, orgId } })
      if (n !== new Set(patch.addLabelIds).size)
        throw new ApiError(400, 'One or more labels do not belong to this organization', 'CROSS_SCOPE')
    }

    for (const t of tickets) {
      if (hasFieldPatch) {
        const { events } = await updateTicket(t.id, orgId, request.userId!, fieldPatch)
        for (const e of events) await publishEvent(e.type, e.payload)
      }
      if (patch.addLabelIds?.length) {
        await prisma.ticketLabel.createMany({
          data: patch.addLabelIds.map((labelId) => ({ ticketId: t.id, labelId })),
          skipDuplicates: true,
        })
      }
      if (patch.archived !== undefined) {
        await prisma.ticket.update({ where: { id: t.id }, data: { archivedAt: patch.archived ? new Date() : null } })
        await publishEvent(patch.archived ? 'ticket.deleted' : 'ticket.updated', {
          projectId: t.projectId,
          ticketId: t.id,
          actorId: request.userId!,
        })
      }
    }
    return { updated: tickets.length }
  })
}

export default routes
