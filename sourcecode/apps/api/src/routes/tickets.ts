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
  })
  .partial()

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
    return { items: items.map(serializeTicket), nextCursor }
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
      include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    })
    return { comments }
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
}

export default routes
