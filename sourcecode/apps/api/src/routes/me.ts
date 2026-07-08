import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { ticketIncludeWithOrg, serializeTicketWithOrg } from '../services/tickets.service.js'
import { blockedByCounts } from '../services/relations.service.js'
import { audit } from '../services/audit.service.js'

const updateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  // null clears the avatar back to initials
  avatarUrl: z.string().url().max(500).nullable().optional(),
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

  // GET /api/me/export — GDPR Art. 20 data portability: a full JSON bundle of
  // everything this account owns or is referenced by. Downloadable, not paginated
  // — this is a one-shot personal-data export, not a list endpoint.
  app.get('/export', async (request, reply) => {
    const userId = request.userId!
    const [user, memberships, createdTickets, assignedTickets, comments, watching, notifications] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
      }),
      prisma.orgMember.findMany({
        where: { userId },
        select: { role: true, joinedAt: true, organization: { select: { name: true, slug: true } } },
      }),
      prisma.ticket.findMany({
        where: { createdById: userId },
        select: { title: true, status: true, createdAt: true, number: true, project: { select: { key: true } } },
      }),
      prisma.ticket.findMany({
        where: { assignedToId: userId },
        select: { title: true, status: true, createdAt: true, number: true, project: { select: { key: true } } },
      }),
      prisma.comment.findMany({
        where: { authorId: userId },
        select: { ticketId: true, body: true, createdAt: true },
      }),
      prisma.ticketWatcher.findMany({ where: { userId }, select: { ticketId: true } }),
      prisma.notification.findMany({
        where: { userId },
        select: { type: true, subject: true, body: true, readAt: true, createdAt: true },
      }),
    ])
    const keyOf = (t: { number: number; project: { key: string } }) => `${t.project.key}-${t.number}`
    const bundle = {
      exportedAt: new Date().toISOString(),
      format: 'agentpm/v1',
      data: {
        profile: user,
        memberships: memberships.map((m) => ({ org: m.organization, role: m.role, joinedAt: m.joinedAt })),
        createdTickets: createdTickets.map((t) => ({ key: keyOf(t), title: t.title, status: t.status, createdAt: t.createdAt })),
        assignedTickets: assignedTickets.map((t) => ({ key: keyOf(t), title: t.title, status: t.status, createdAt: t.createdAt })),
        comments,
        watchingTicketIds: watching.map((w) => w.ticketId),
        notifications,
      },
    }
    await audit({ actorId: userId, action: 'account.exported', targetType: 'account', targetId: userId })
    reply.header('Content-Disposition', `attachment; filename="agentpm-export-${bundle.exportedAt.slice(0, 10)}.json"`)
    return bundle
  })

  // GET /api/me/work — tickets assigned to or watched by me, across all my orgs
  app.get('/work', async (request) => {
    const userId = request.userId!
    const memberOf = { project: { organization: { members: { some: { userId } } }, archivedAt: null } }
    const [assigned, watching] = await Promise.all([
      prisma.ticket.findMany({
        where: { assignedToId: userId, archivedAt: null, ...memberOf },
        include: ticketIncludeWithOrg,
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
        include: ticketIncludeWithOrg,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        take: 100,
      }),
    ])
    const blocked = await blockedByCounts([...assigned, ...watching].map((t) => t.id))
    const ser = (t: (typeof assigned)[number]) => ({ ...serializeTicketWithOrg(t), blockedBy: blocked.get(t.id) ?? 0 })
    return { assigned: assigned.map(ser), watching: watching.map(ser) }
  })
}

export default meRoutes
