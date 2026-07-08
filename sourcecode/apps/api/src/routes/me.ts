import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { ticketIncludeWithOrg, serializeTicketWithOrg } from '../services/tickets.service.js'
import { blockedByCounts } from '../services/relations.service.js'
import { audit } from '../services/audit.service.js'
import { ApiError } from '../lib/errors.js'

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

  // DELETE /api/me — GDPR Art. 17 erasure. Ticket.createdBy is onDelete:Restrict
  // (a ticket author can't be hard-deleted), so this ANONYMIZES the user row
  // rather than removing it: memberships/watches/notifications/reactions are
  // deleted, but tickets they created and comments they wrote remain, now
  // attributed to "Deleted user". The Keycloak account itself is untouched (the
  // API holds no IdP admin credentials) — signing in again JIT-provisions a
  // fresh, unrelated account.
  app.delete('/', async (request, reply) => {
    const userId = request.userId!

    // Block erasure if it would leave any org without an owner.
    const ownerships = await prisma.orgMember.findMany({
      where: { userId, role: 'OWNER' },
      select: { orgId: true, organization: { select: { slug: true } } },
    })
    const soleOwnerOf: string[] = []
    for (const m of ownerships) {
      const owners = await prisma.orgMember.count({ where: { orgId: m.orgId, role: 'OWNER' } })
      if (owners <= 1) soleOwnerOf.push(m.organization.slug)
    }
    if (soleOwnerOf.length > 0) {
      throw new ApiError(
        409,
        `Transfer ownership or delete these organizations first: ${soleOwnerOf.join(', ')}`,
        'SOLE_OWNER',
      )
    }

    await prisma.$transaction([
      // Don't leave live work assigned to a tombstoned account.
      prisma.ticket.updateMany({ where: { assignedToId: userId }, data: { assignedToId: null } }),
      prisma.orgMember.deleteMany({ where: { userId } }),
      prisma.ticketWatcher.deleteMany({ where: { userId } }),
      prisma.notification.deleteMany({ where: { userId } }),
      prisma.commentReaction.deleteMany({ where: { userId } }),
      // Anonymize rather than delete — createdTickets is Restrict, and comments/
      // activity attributed to this user should read "Deleted user", not vanish.
      prisma.user.update({
        where: { id: userId },
        data: { email: `deleted-${userId}@anonymized.invalid`, name: 'Deleted user', avatarUrl: null, idpSub: null },
      }),
    ])

    await audit({ actorId: userId, action: 'account.erased', targetType: 'account', targetId: userId })
    return reply.code(204).send()
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
