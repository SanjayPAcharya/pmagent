import type { FastifyPluginAsync } from 'fastify'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { requireAuth, requireOrgRole } from '../middleware/auth.middleware.js'
import { guardLastOwner, ROLE_ORDER } from '../services/authz.js'
import { orgListStats } from '../services/stats.service.js'
import { DEFAULT_TEMPLATES } from './templates.js'
import { recentActivity } from '../services/activity.service.js'
import { ApiError } from '../lib/errors.js'
import { slugify } from '../lib/slug.js'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const createInviteSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
})

const createOrgSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(50).optional(),
})
const updateOrgSchema = z
  .object({
    name: z.string().min(1).max(120),
    // G2 — per-org accent (hex, e.g. "#6d28d9"); null clears it back to default.
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable(),
  })
  .partial()
const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
})
const updateMemberSchema = z.object({ role: z.enum(['OWNER', 'ADMIN', 'MEMBER']) })

/** Up to two initials for an avatar fallback; derived from name, else email. */
function initialsOf(name: string, email: string): string {
  const source = name.trim() || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  const letters = (parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2)) || '?'
  return letters.toUpperCase()
}

async function uniqueOrgSlug(base: string): Promise<string> {
  let slug = base
  let n = 1
  while (await prisma.organization.findUnique({ where: { slug } })) {
    n += 1
    slug = `${base}-${n}`
  }
  return slug
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  // Create org — the creator becomes OWNER; seeded with the starter templates (3.4 W1)
  app.post('/', async (request, reply) => {
    const body = createOrgSchema.parse(request.body)
    const slug = await uniqueOrgSlug(body.slug ?? slugify(body.name))
    const org = await prisma.organization.create({
      data: {
        name: body.name,
        slug,
        members: { create: { userId: request.userId!, role: 'OWNER' } },
        templates: { create: DEFAULT_TEMPLATES },
      },
    })
    return reply.code(201).send({ org })
  })

  // List orgs the caller belongs to (with their role + at-a-glance counts)
  app.get('/', async (request) => {
    const memberships = await prisma.orgMember.findMany({
      where: { userId: request.userId! },
      include: { organization: true },
      orderBy: { joinedAt: 'asc' },
    })
    const stats = await orgListStats(memberships.map((m) => m.organization.id))
    return {
      organizations: memberships.map((m) => ({
        ...m.organization,
        role: m.role,
        ...(stats.get(m.organization.id) ?? { projectCount: 0, memberCount: 0, openTicketCount: 0 }),
      })),
    }
  })

  app.get('/:slug', { preHandler: requireOrgRole('MEMBER') }, async (request) => {
    const { slug } = request.params as { slug: string }
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug } })
    // The caller's own role — needed by the settings page to gate rename/delete.
    const membership = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: request.userId! } },
      select: { role: true },
    })
    const [projectCount, memberCount, ticketGroups, activeSprintCount, previewMembers, pendingInviteCount] =
      await Promise.all([
        prisma.project.count({ where: { orgId: org.id } }),
        prisma.orgMember.count({ where: { orgId: org.id } }),
        prisma.ticket.groupBy({
          by: ['status'],
          where: { project: { orgId: org.id }, archivedAt: null },
          _count: { _all: true },
        }),
        prisma.sprint.count({ where: { project: { orgId: org.id }, status: 'ACTIVE' } }),
        prisma.orgMember.findMany({
          where: { orgId: org.id },
          include: { user: true },
          orderBy: { joinedAt: 'asc' },
          take: 5,
        }),
        prisma.orgInvite.count({ where: { orgId: org.id, acceptedAt: null, expiresAt: { gt: new Date() } } }),
      ])
    const ticketsByStatus = Object.fromEntries(ticketGroups.map((g) => [g.status, g._count._all]))
    return {
      org: {
        ...org,
        role: membership?.role,
        stats: { projectCount, memberCount, ticketsByStatus, activeSprintCount },
        membersPreview: previewMembers.map((m) => ({
          userId: m.userId,
          name: m.user.name,
          avatarUrl: m.user.avatarUrl,
          initials: initialsOf(m.user.name, m.user.email),
        })),
        pendingInviteCount,
      },
    }
  })

  // Recent activity across all of the org's tickets (for the overview feed)
  app.get('/:slug/activity', { preHandler: requireOrgRole('MEMBER') }, async (request) => {
    const { slug } = request.params as { slug: string }
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug } })
    return { activity: await recentActivity({ ticket: { project: { orgId: org.id } } }) }
  })

  app.patch('/:slug', { preHandler: requireOrgRole('ADMIN') }, async (request) => {
    const { slug } = request.params as { slug: string }
    const body = updateOrgSchema.parse(request.body)
    const org = await prisma.organization.update({ where: { slug }, data: body })
    return { org }
  })

  app.delete('/:slug', { preHandler: requireOrgRole('OWNER') }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    await prisma.organization.delete({ where: { slug } })
    return reply.code(204).send()
  })

  // ── Members ──
  app.get('/:slug/members', { preHandler: requireOrgRole('MEMBER') }, async (request) => {
    const { slug } = request.params as { slug: string }
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug } })
    const members = await prisma.orgMember.findMany({
      where: { orgId: org.id },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    })
    return {
      members: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        email: m.user.email,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        initials: initialsOf(m.user.name, m.user.email),
        joinedAt: m.joinedAt,
      })),
    }
  })

  // Add an EXISTING user by email. (Emailed invite links land in Phase 5.)
  app.post('/:slug/members', { preHandler: requireOrgRole('ADMIN') }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = addMemberSchema.parse(request.body)
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug } })
    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) throw new ApiError(404, 'No user with that email has signed up yet.', 'USER_NOT_FOUND')

    const existing = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    })
    if (existing) throw new ApiError(409, 'User is already a member.', 'ALREADY_MEMBER')

    const member = await prisma.orgMember.create({
      data: { orgId: org.id, userId: user.id, role: body.role },
    })
    return reply.code(201).send({
      member: { userId: user.id, role: member.role, email: user.email, name: user.name },
    })
  })

  app.patch('/:slug/members/:userId', { preHandler: requireOrgRole('ADMIN') }, async (request) => {
    const { slug, userId } = request.params as { slug: string; userId: string }
    const body = updateMemberSchema.parse(request.body)
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug } })
    await guardLastOwner(org.id, userId, body.role)
    const member = await prisma.orgMember.update({
      where: { orgId_userId: { orgId: org.id, userId } },
      data: { role: body.role },
    })
    return { member: { userId, role: member.role } }
  })

  app.delete('/:slug/members/:userId', { preHandler: requireOrgRole('ADMIN') }, async (request, reply) => {
    const { slug, userId } = request.params as { slug: string; userId: string }
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug } })
    await guardLastOwner(org.id, userId, null)
    await prisma.orgMember.delete({ where: { orgId_userId: { orgId: org.id, userId } } })
    return reply.code(204).send()
  })

  // ── Invite links ── (accept lives at /api/invites/:token/accept)
  app.post('/:slug/invites', { preHandler: requireOrgRole('ADMIN') }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = createInviteSchema.parse(request.body)
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug } })
    // Role cap: never mint an invite above the inviter's own role.
    const me = await prisma.orgMember.findUniqueOrThrow({
      where: { orgId_userId: { orgId: org.id, userId: request.userId! } },
    })
    if (ROLE_ORDER[body.role] > ROLE_ORDER[me.role])
      throw new ApiError(403, 'Cannot invite above your own role', 'ROLE_CAP')

    const token = randomBytes(32).toString('base64url') // CSPRNG, ~256 bits
    const invite = await prisma.orgInvite.create({
      data: {
        orgId: org.id,
        email: body.email,
        role: body.role,
        token,
        invitedById: request.userId!,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    })
    return reply.code(201).send({
      invite: { id: invite.id, token, role: invite.role, email: invite.email, expiresAt: invite.expiresAt, url: `/invite/${token}` },
    })
  })

  app.get('/:slug/invites', { preHandler: requireOrgRole('ADMIN') }, async (request) => {
    const { slug } = request.params as { slug: string }
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug } })
    const invites = await prisma.orgInvite.findMany({
      where: { orgId: org.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    return { invites }
  })

  app.delete('/:slug/invites/:id', { preHandler: requireOrgRole('ADMIN') }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string }
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug } })
    await prisma.orgInvite.deleteMany({ where: { id, orgId: org.id } })
    return reply.code(204).send()
  })
}

export default routes
