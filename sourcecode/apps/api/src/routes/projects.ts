import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { OrgRole } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { assertOrgRole } from '../services/authz.js'
import { ApiError } from '../lib/errors.js'
import { slugify, deriveKey } from '../lib/slug.js'

const createProjectSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(50).optional(),
  key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/).optional(),
  description: z.string().max(2000).optional(),
})
const updateProjectSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  defaultBranch: z.string().min(1).max(100).optional(),
})

async function uniqueProjectSlug(orgId: string, base: string): Promise<string> {
  let slug = base
  let n = 1
  while (await prisma.project.findUnique({ where: { orgId_slug: { orgId, slug } } })) {
    n += 1
    slug = `${base}-${n}`
  }
  return slug
}

async function uniqueProjectKey(orgId: string, base: string): Promise<string> {
  let key = base
  let n = 1
  while (await prisma.project.findUnique({ where: { orgId_key: { orgId, key } } })) {
    n += 1
    key = `${base}${n}`
  }
  return key
}

/** Load a project by :projectId and assert the caller has >= min role in its org. */
async function loadProjectAuthorized(request: FastifyRequest, min: OrgRole) {
  const { projectId } = request.params as { projectId: string }
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) throw new ApiError(404, 'Project not found')
  await assertOrgRole(request.userId!, project.orgId, min)
  return project
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  // Create project — ADMIN+ in the target org
  app.post('/', async (request, reply) => {
    const body = createProjectSchema.parse(request.body)
    await assertOrgRole(request.userId!, body.orgId, 'ADMIN')
    const slug = await uniqueProjectSlug(body.orgId, body.slug ?? slugify(body.name))
    const key = await uniqueProjectKey(body.orgId, body.key ?? deriveKey(body.name))
    const project = await prisma.project.create({
      data: { orgId: body.orgId, name: body.name, slug, key, description: body.description },
    })
    return reply.code(201).send({ project })
  })

  // List projects in an org — MEMBER+
  app.get('/', async (request) => {
    const { orgId } = request.query as { orgId?: string }
    if (!orgId) throw new ApiError(400, 'orgId query parameter is required')
    await assertOrgRole(request.userId!, orgId, 'MEMBER')
    const projects = await prisma.project.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
    })
    return { projects }
  })

  app.get('/:projectId', async (request) => {
    const project = await loadProjectAuthorized(request, 'MEMBER')
    return { project }
  })

  app.patch('/:projectId', async (request) => {
    await loadProjectAuthorized(request, 'ADMIN')
    const body = updateProjectSchema.parse(request.body)
    const { projectId } = request.params as { projectId: string }
    const project = await prisma.project.update({ where: { id: projectId }, data: body })
    return { project }
  })

  app.delete('/:projectId', async (request, reply) => {
    await loadProjectAuthorized(request, 'ADMIN')
    const { projectId } = request.params as { projectId: string }
    await prisma.project.delete({ where: { id: projectId } })
    return reply.code(204).send()
  })
}

export default routes
