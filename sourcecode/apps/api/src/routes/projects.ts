import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { OrgRole } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { assertOrgRole } from '../services/authz.js'
import { projectListStats } from '../services/stats.service.js'
import { projectReports } from '../services/reports.service.js'
import { recentActivity } from '../services/activity.service.js'
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
  // 3.4 W3 — partial automation toggles; merged into the stored JSON.
  automation: z
    .object({
      unblockNudge: z.boolean().optional(),
      autoTodoOnAssign: z.boolean().optional(),
      subtasksDoneNudge: z.boolean().optional(),
    })
    .optional(),
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
    const stats = await projectListStats(projects.map((p) => p.id))
    return {
      projects: projects.map((p) => ({
        ...p,
        ...(stats.get(p.id) ?? { openTicketCount: 0, byStatus: {}, activeSprint: null }),
      })),
    }
  })

  app.get('/:projectId', async (request) => {
    const project = await loadProjectAuthorized(request, 'MEMBER')
    return { project }
  })

  // Recent activity for a single project's tickets
  app.get('/:projectId/activity', async (request) => {
    const project = await loadProjectAuthorized(request, 'MEMBER')
    return { activity: await recentActivity({ ticket: { projectId: project.id } }) }
  })

  // 3.3 — read-only reporting aggregates (velocity, cycle/lead time, workload)
  app.get('/:projectId/reports', async (request) => {
    const project = await loadProjectAuthorized(request, 'MEMBER')
    return { reports: await projectReports(project.id) }
  })

  app.patch('/:projectId', async (request) => {
    const existing = await loadProjectAuthorized(request, 'ADMIN')
    const body = updateProjectSchema.parse(request.body)
    const { projectId } = request.params as { projectId: string }
    const { automation, ...rest } = body
    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...rest,
        // Merge toggles so a single-switch PATCH doesn't wipe the others.
        ...(automation
          ? { automation: { ...((existing.automation as Record<string, unknown>) ?? {}), ...automation } }
          : {}),
      },
    })
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
