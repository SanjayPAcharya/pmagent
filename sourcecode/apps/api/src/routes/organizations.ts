import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { requireAuth, requireOrgRole } from '../middleware/auth.middleware.js'
import { guardLastOwner } from '../services/authz.js'
import { ApiError } from '../lib/errors.js'
import { slugify } from '../lib/slug.js'

const createOrgSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(50).optional(),
})
const updateOrgSchema = z.object({ name: z.string().min(1).max(120) })
const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
})
const updateMemberSchema = z.object({ role: z.enum(['OWNER', 'ADMIN', 'MEMBER']) })

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

  // Create org — the creator becomes OWNER
  app.post('/', async (request, reply) => {
    const body = createOrgSchema.parse(request.body)
    const slug = await uniqueOrgSlug(body.slug ?? slugify(body.name))
    const org = await prisma.organization.create({
      data: {
        name: body.name,
        slug,
        members: { create: { userId: request.userId!, role: 'OWNER' } },
      },
    })
    return reply.code(201).send({ org })
  })

  // List orgs the caller belongs to (with their role)
  app.get('/', async (request) => {
    const memberships = await prisma.orgMember.findMany({
      where: { userId: request.userId! },
      include: { organization: true },
      orderBy: { joinedAt: 'asc' },
    })
    return { organizations: memberships.map((m) => ({ ...m.organization, role: m.role })) }
  })

  app.get('/:slug', { preHandler: requireOrgRole('MEMBER') }, async (request) => {
    const { slug } = request.params as { slug: string }
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug } })
    return { org }
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
}

export default routes
