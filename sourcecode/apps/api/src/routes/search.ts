import type { FastifyPluginAsync } from 'fastify'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { ticketIncludeWithOrg, serializeTicketWithOrg } from '../services/tickets.service.js'

const searchQuery = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

// GET /api/search?q= — tickets across every org the caller belongs to.
const searchRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get('/', async (request, reply) => {
    const parsed = searchQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'ValidationError', details: parsed.error.flatten() })
    const { q, limit } = parsed.data
    const userId = request.userId!

    const or: Prisma.TicketWhereInput[] = [{ title: { contains: q, mode: 'insensitive' } }]
    if (/^\d+$/.test(q)) or.push({ number: Number(q) })
    const keyed = q.match(/^([A-Za-z]+)-(\d+)$/)
    if (keyed) or.push({ project: { key: keyed[1].toUpperCase() }, number: Number(keyed[2]) })

    const rows = await prisma.ticket.findMany({
      where: {
        archivedAt: null,
        project: { organization: { members: { some: { userId } } } },
        OR: or,
      },
      include: ticketIncludeWithOrg,
      orderBy: { updatedAt: 'desc' },
      take: limit,
    })
    return { items: rows.map(serializeTicketWithOrg) }
  })
}

export default searchRoutes
