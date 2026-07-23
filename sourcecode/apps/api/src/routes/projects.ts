import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { OrgRole } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { assertOrgRole } from '../services/authz.js'
import { projectListStats } from '../services/stats.service.js'
import { projectReports, milestoneReadiness } from '../services/reports.service.js'
import { projectOverview } from '../services/overview.service.js'
import { projectGantt } from '../services/gantt.service.js'
import { recentActivity } from '../services/activity.service.js'
import { audit } from '../services/audit.service.js'
import { publishEvent } from '../events/event-bus.js'
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

// 3.7 R2 — milestones (project-level target dates on the timeline).
const createMilestoneSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  date: z.string().datetime(),
})
const updateMilestoneSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    date: z.string().datetime(),
    done: z.boolean(),
  })
  .partial()

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

  // List projects in an org — MEMBER+. Archived projects are hidden by default;
  // ?archivedOnly=true returns just them (for the Archived projects page).
  app.get('/', async (request) => {
    const { orgId, archivedOnly } = request.query as { orgId?: string; archivedOnly?: string }
    if (!orgId) throw new ApiError(400, 'orgId query parameter is required')
    await assertOrgRole(request.userId!, orgId, 'MEMBER')
    const projects = await prisma.project.findMany({
      where: { orgId, archivedAt: archivedOnly === 'true' ? { not: null } : null },
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

  // 3.7 R4 — project Overview dashboard aggregate (single round trip)
  app.get('/:projectId/overview', async (request) => {
    const project = await loadProjectAuthorized(request, 'MEMBER')
    return { overview: await projectOverview(project.id) }
  })

  // 3.7 R6 — Gantt data (dated tickets + dependency edges + milestones)
  app.get('/:projectId/gantt', async (request) => {
    const project = await loadProjectAuthorized(request, 'MEMBER')
    return { gantt: await projectGantt(project.id) }
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

  // 3.7.3 — soft-archive (hide from listings; restorable). The web Danger Zone
  // now archives instead of hard-deleting; permanent delete lives on the
  // Archived projects page (the DELETE below).
  app.post('/:projectId/archive', async (request) => {
    const project = await loadProjectAuthorized(request, 'ADMIN')
    const updated = await prisma.project.update({ where: { id: project.id }, data: { archivedAt: new Date() } })
    await audit({ orgId: project.orgId, actorId: request.userId, action: 'project.archived', targetType: 'project', targetId: project.id })
    return { project: updated }
  })
  app.post('/:projectId/restore', async (request) => {
    const project = await loadProjectAuthorized(request, 'ADMIN')
    const updated = await prisma.project.update({ where: { id: project.id }, data: { archivedAt: null } })
    await audit({ orgId: project.orgId, actorId: request.userId, action: 'project.restored', targetType: 'project', targetId: project.id })
    return { project: updated }
  })

  // Permanent delete (hard) — ADMIN; cascades to tickets/sprints/milestones.
  app.delete('/:projectId', async (request, reply) => {
    const project = await loadProjectAuthorized(request, 'ADMIN')
    const { projectId } = request.params as { projectId: string }
    await prisma.project.delete({ where: { id: projectId } })
    await audit({ orgId: project.orgId, actorId: request.userId, action: 'project.deleted', targetType: 'project', targetId: projectId })
    return reply.code(204).send()
  })

  // ── Milestones (3.7 R2) ─────────────────────────────────
  // Load a milestone and assert it belongs to the authorized project.
  async function loadMilestone(projectId: string, milestoneId: string) {
    const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } })
    if (!milestone || milestone.projectId !== projectId) throw new ApiError(404, 'Milestone not found')
    return milestone
  }

  app.get('/:projectId/milestones', async (request) => {
    const project = await loadProjectAuthorized(request, 'MEMBER')
    // 3.8.5 MS-2 — attach linked-ticket progress to each milestone.
    const [milestones, progress] = await Promise.all([
      prisma.milestone.findMany({ where: { projectId: project.id }, orderBy: { date: 'asc' } }),
      milestoneReadiness(project.id),
    ])
    return { milestones: milestones.map((m) => ({ ...m, progress: progress.get(m.id) ?? { done: 0, total: 0 } })) }
  })

  // 3.8.5 MS-4 — milestone detail: its linked tickets (status + assignee) and a
  // progress figure that always matches the visible list.
  app.get('/:projectId/milestones/:milestoneId', async (request) => {
    const project = await loadProjectAuthorized(request, 'MEMBER')
    const { milestoneId } = request.params as { milestoneId: string }
    const milestone = await loadMilestone(project.id, milestoneId)
    const tickets = await prisma.ticket.findMany({
      where: { projectId: project.id, milestoneId, archivedAt: null },
      orderBy: [{ status: 'asc' }, { number: 'asc' }],
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        assignedTo: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    })
    let done = 0
    let total = 0
    for (const t of tickets) {
      if (t.status === 'CANCELLED') continue
      total += 1
      if (t.status === 'DONE') done += 1
    }
    return {
      milestone,
      progress: { done, total },
      tickets: tickets.map((t) => ({ ...t, key: `${project.key}-${t.number}` })),
    }
  })

  app.post('/:projectId/milestones', async (request, reply) => {
    const project = await loadProjectAuthorized(request, 'MEMBER')
    const body = createMilestoneSchema.parse(request.body)
    const milestone = await prisma.milestone.create({
      data: { projectId: project.id, name: body.name, description: body.description, date: new Date(body.date) },
    })
    await publishEvent('milestone.updated', { projectId: project.id, actorId: request.userId! })
    return reply.code(201).send({ milestone })
  })

  app.patch('/:projectId/milestones/:milestoneId', async (request) => {
    const project = await loadProjectAuthorized(request, 'MEMBER')
    const { milestoneId } = request.params as { milestoneId: string }
    await loadMilestone(project.id, milestoneId)
    const body = updateMilestoneSchema.parse(request.body)
    const milestone = await prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        name: body.name,
        description: body.description,
        date: body.date ? new Date(body.date) : undefined,
        done: body.done,
      },
    })
    await publishEvent('milestone.updated', { projectId: project.id, actorId: request.userId! })
    return { milestone }
  })

  app.delete('/:projectId/milestones/:milestoneId', async (request, reply) => {
    const project = await loadProjectAuthorized(request, 'ADMIN')
    const { milestoneId } = request.params as { milestoneId: string }
    await loadMilestone(project.id, milestoneId)
    await prisma.milestone.delete({ where: { id: milestoneId } })
    await publishEvent('milestone.updated', { projectId: project.id, actorId: request.userId! })
    return reply.code(204).send()
  })
}

export default routes
