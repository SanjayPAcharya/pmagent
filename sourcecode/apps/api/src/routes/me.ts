import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { ticketInclude, serializeTicket } from '../services/tickets.service.js'
import { blockedByCounts } from '../services/relations.service.js'

const updateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().optional(),
})

const meRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  // GET /api/me — current user (JIT-provisioned on first authenticated request)
  app.get('/', async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId! } })
    return { user }
  })

  // PATCH /api/me — update profile fields the app owns
  app.patch('/', async (request, reply) => {
    const parsed = updateMeSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', details: parsed.error.flatten() })
    }
    const user = await prisma.user.update({
      where: { id: request.userId! },
      data: parsed.data,
    })
    return { user }
  })

  // GET /api/me/work — tickets assigned to or watched by me, across all my orgs
  app.get('/work', async (request) => {
    const userId = request.userId!
    const memberOf = { project: { organization: { members: { some: { userId } } } } }
    const [assigned, watching] = await Promise.all([
      prisma.ticket.findMany({
        where: { assignedToId: userId, archivedAt: null, ...memberOf },
        include: ticketInclude,
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }],
        take: 100,
      }),
      prisma.ticket.findMany({
        where: {
          watchers: { some: { userId } },
          archivedAt: null,
          ...memberOf,
          OR: [{ assignedToId: null }, { assignedToId: { not: userId } }],
        },
        include: ticketInclude,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        take: 100,
      }),
    ])
    const blocked = await blockedByCounts([...assigned, ...watching].map((t) => t.id))
    const ser = (t: (typeof assigned)[number]) => ({ ...serializeTicket(t), blockedBy: blocked.get(t.id) ?? 0 })
    return { assigned: assigned.map(ser), watching: watching.map(ser) }
  })
}

export default meRoutes
