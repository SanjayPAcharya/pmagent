import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { OrgRole, TicketStatus } from '@prisma/client'
import { z } from 'zod'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { assertOrgRole } from '../services/authz.js'
import { ApiError } from '../lib/errors.js'
import { publishEvent } from '../events/event-bus.js'
import { ticketInclude, serializeTicket } from '../services/tickets.service.js'

const createSprintSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(120),
  goal: z.string().max(2000).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})
const updateSprintSchema = z
  .object({
    name: z.string().min(1).max(120),
    goal: z.string().max(2000).nullable(),
    startDate: z.string().datetime().nullable(),
    endDate: z.string().datetime().nullable(),
  })
  .partial()
const sprintParams = z.object({ sprintId: z.string().uuid() })
const addTicketsSchema = z.object({ ticketIds: z.array(z.string().uuid()).min(1) })

/** Per-status counts + total, for the completion progress bar. */
async function sprintCounts(sprintId: string) {
  const groups = await prisma.ticket.groupBy({
    by: ['status'],
    where: { sprintId, archivedAt: null },
    _count: { _all: true },
  })
  const byStatus = Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Record<TicketStatus, number>
  const total = groups.reduce((n, g) => n + g._count._all, 0)
  return { total, done: byStatus.DONE ?? 0, byStatus }
}

async function loadSprintAuthorized(request: FastifyRequest, min: OrgRole) {
  const { sprintId } = request.params as { sprintId: string }
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { project: { select: { id: true, orgId: true } } },
  })
  if (!sprint) throw new ApiError(404, 'Sprint not found')
  await assertOrgRole(request.userId!, sprint.project.orgId, min)
  return sprint
}

const routes: FastifyPluginAsync = async (app) => {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', requireAuth)

  r.post('/', { schema: { body: createSprintSchema, tags: ['sprints'] } }, async (request, reply) => {
    const { projectId, ...rest } = request.body
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { orgId: true } })
    if (!project) throw new ApiError(404, 'Project not found')
    await assertOrgRole(request.userId!, project.orgId, 'MEMBER')
    const sprint = await prisma.sprint.create({
      data: {
        projectId,
        name: rest.name,
        goal: rest.goal,
        startDate: rest.startDate ? new Date(rest.startDate) : undefined,
        endDate: rest.endDate ? new Date(rest.endDate) : undefined,
      },
    })
    return reply.code(201).send({ sprint })
  })

  r.get('/', { schema: { querystring: z.object({ projectId: z.string().uuid() }), tags: ['sprints'] } }, async (request) => {
    const { projectId } = request.query
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { orgId: true } })
    if (!project) throw new ApiError(404, 'Project not found')
    await assertOrgRole(request.userId!, project.orgId, 'MEMBER')
    const sprints = await prisma.sprint.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tickets: true } } },
    })
    return { sprints }
  })

  r.get('/:sprintId', { schema: { params: sprintParams, tags: ['sprints'] } }, async (request) => {
    const sprint = await loadSprintAuthorized(request, 'MEMBER')
    const tickets = await prisma.ticket.findMany({
      where: { sprintId: sprint.id, archivedAt: null },
      include: ticketInclude,
      orderBy: [{ status: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    })
    return { sprint, tickets: tickets.map(serializeTicket), counts: await sprintCounts(sprint.id) }
  })

  // F1 — burndown reconstructed from activity (no snapshot table): remaining
  // work (story points, or ticket count if none are pointed) per day across the
  // sprint window, plus the ideal straight-line. `remaining` is null for future
  // days so the actual line stops at today.
  r.get('/:sprintId/burndown', { schema: { params: sprintParams, tags: ['sprints'] } }, async (request) => {
    const sprint = await loadSprintAuthorized(request, 'MEMBER')
    const tickets = await prisma.ticket.findMany({
      where: { sprintId: sprint.id, archivedAt: null },
      select: { id: true, storyPoints: true, status: true },
    })
    const usePoints = tickets.some((t) => (t.storyPoints ?? 0) > 0)
    const weight = (t: { storyPoints: number | null }) => (usePoints ? (t.storyPoints ?? 0) : 1)
    const total = tickets.reduce((n, t) => n + weight(t), 0)

    // Completion date per currently-done ticket = its latest STATUS_CHANGED→DONE.
    const doneIds = tickets.filter((t) => t.status === 'DONE').map((t) => t.id)
    const acts = doneIds.length
      ? await prisma.ticketActivity.findMany({
          where: { ticketId: { in: doneIds }, type: 'STATUS_CHANGED', toValue: 'DONE' },
          orderBy: { createdAt: 'desc' },
          select: { ticketId: true, createdAt: true },
        })
      : []
    const doneAt = new Map<string, Date>()
    for (const a of acts) if (!doneAt.has(a.ticketId)) doneAt.set(a.ticketId, a.createdAt)

    const dayMs = 86_400_000
    const start = sprint.startDate ?? sprint.createdAt
    const end = sprint.endDate ?? new Date(start.getTime() + 14 * dayMs)
    const nDays = Math.max(1, Math.min(60, Math.ceil((end.getTime() - start.getTime()) / dayMs)))
    const now = Date.now()

    const points = Array.from({ length: nDays + 1 }, (_, i) => {
      const boundary = start.getTime() + i * dayMs
      const doneWeight = tickets.reduce((n, t) => {
        const d = doneAt.get(t.id)
        return d && d.getTime() <= boundary ? n + weight(t) : n
      }, 0)
      return {
        date: new Date(boundary).toISOString().slice(0, 10),
        ideal: Math.round(total * (1 - i / nDays) * 10) / 10,
        remaining: boundary <= now + dayMs ? total - doneWeight : null,
      }
    })
    return { total, unit: usePoints ? 'points' : 'tickets', points }
  })

  r.patch('/:sprintId', { schema: { params: sprintParams, body: updateSprintSchema, tags: ['sprints'] } }, async (request) => {
    const s = await loadSprintAuthorized(request, 'MEMBER')
    const b = request.body
    const has = (k: keyof typeof b) => Object.prototype.hasOwnProperty.call(b, k)
    const sprint = await prisma.sprint.update({
      where: { id: s.id },
      data: {
        name: b.name,
        goal: has('goal') ? b.goal : undefined,
        startDate: has('startDate') ? (b.startDate ? new Date(b.startDate) : null) : undefined,
        endDate: has('endDate') ? (b.endDate ? new Date(b.endDate) : null) : undefined,
      },
    })
    await publishEvent('sprint.updated', { projectId: s.project.id, sprintId: s.id, actorId: request.userId! })
    return { sprint }
  })

  r.post('/:sprintId/start', { schema: { params: sprintParams, tags: ['sprints'] } }, async (request) => {
    const s = await loadSprintAuthorized(request, 'MEMBER')
    const sprint = await prisma.sprint.update({
      where: { id: s.id },
      data: { status: 'ACTIVE', startDate: s.startDate ?? new Date() },
    })
    await publishEvent('sprint.updated', { projectId: s.project.id, sprintId: s.id, actorId: request.userId! })
    return { sprint }
  })

  r.post('/:sprintId/complete', { schema: { params: sprintParams, tags: ['sprints'] } }, async (request) => {
    const s = await loadSprintAuthorized(request, 'MEMBER')
    // Velocity = story points of completed tickets at close.
    const done = await prisma.ticket.aggregate({
      where: { sprintId: s.id, status: 'DONE', archivedAt: null },
      _sum: { storyPoints: true },
    })
    const sprint = await prisma.sprint.update({
      where: { id: s.id },
      data: { status: 'COMPLETED', endDate: s.endDate ?? new Date(), velocity: done._sum.storyPoints ?? 0 },
    })
    await publishEvent('sprint.updated', { projectId: s.project.id, sprintId: s.id, actorId: request.userId! })
    return { sprint, counts: await sprintCounts(s.id) }
  })

  r.post('/:sprintId/tickets', { schema: { params: sprintParams, body: addTicketsSchema, tags: ['sprints'] } }, async (request) => {
    const s = await loadSprintAuthorized(request, 'MEMBER')
    // All tickets must belong to the sprint's project (cross-scope guard).
    const inProject = await prisma.ticket.count({ where: { id: { in: request.body.ticketIds }, projectId: s.project.id } })
    if (inProject !== new Set(request.body.ticketIds).size)
      throw new ApiError(400, 'One or more tickets do not belong to this project', 'CROSS_SCOPE')
    await prisma.ticket.updateMany({ where: { id: { in: request.body.ticketIds } }, data: { sprintId: s.id } })
    await publishEvent('sprint.updated', { projectId: s.project.id, sprintId: s.id, actorId: request.userId! })
    return { counts: await sprintCounts(s.id) }
  })

  r.delete('/:sprintId/tickets/:ticketId', { schema: { params: sprintParams.extend({ ticketId: z.string().uuid() }), tags: ['sprints'] } }, async (request, reply) => {
    const s = await loadSprintAuthorized(request, 'MEMBER')
    await prisma.ticket.updateMany({ where: { id: request.params.ticketId, sprintId: s.id }, data: { sprintId: null } })
    await publishEvent('sprint.updated', { projectId: s.project.id, sprintId: s.id, actorId: request.userId! })
    return reply.code(204).send()
  })
}

export default routes
