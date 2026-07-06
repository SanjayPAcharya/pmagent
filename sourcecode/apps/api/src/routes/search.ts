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

// GET /api/search?q= — tickets (title, description, number, KEY-n) and
// projects (name), across every org the caller belongs to.
const searchRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get('/', async (request, reply) => {
    const parsed = searchQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'ValidationError', details: parsed.error.flatten() })
    const { q, limit } = parsed.data
    const userId = request.userId!

    const or: Prisma.TicketWhereInput[] = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ]
    if (/^\d+$/.test(q)) or.push({ number: Number(q) })
    const keyed = q.match(/^([A-Za-z]+)-(\d+)$/)
    if (keyed) or.push({ project: { key: keyed[1].toUpperCase() }, number: Number(keyed[2]) })

    const memberOrg = { organization: { members: { some: { userId } } } }
    const [rows, projects] = await Promise.all([
      prisma.ticket.findMany({
        where: { archivedAt: null, project: memberOrg, OR: or },
        include: ticketIncludeWithOrg,
        // Title matches read as more intentional than body matches — surface them first.
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      prisma.project.findMany({
        where: { ...memberOrg, name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true, slug: true, key: true, organization: { select: { slug: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
    ])
    const titleHit = (t: string) => t.toLowerCase().includes(q.toLowerCase())
    const items = rows.map(serializeTicketWithOrg).sort((a, b) => Number(titleHit(b.title)) - Number(titleHit(a.title)))
    return {
      items,
      projects: projects.map((p) => ({ id: p.id, name: p.name, slug: p.slug, key: p.key, orgSlug: p.organization.slug })),
    }
  })
}

export default searchRoutes
