import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { assertOrgRole } from '../services/authz.js'
import { ApiError } from '../lib/errors.js'

// 3.4 W1 — org-scoped ticket templates. Members read, admins write.
const templateFields = {
  name: z.string().min(1).max(80),
  type: z.enum(['FEATURE', 'BUG', 'CHORE', 'SPIKE']).default('FEATURE'),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  title: z.string().max(200).optional(),
  description: z.string().max(10_000).optional(),
  acceptanceCriteria: z.string().max(10_000).optional(),
  goal: z.string().max(2000).optional(),
  constraints: z.string().max(2000).optional(),
  labelIds: z.array(z.string().uuid()).max(20).optional(),
}
const createSchema = z.object({ orgId: z.string().uuid(), ...templateFields })
const updateSchema = z.object(templateFields).partial()

/** The two starter templates every new org gets. */
export const DEFAULT_TEMPLATES = [
  {
    name: 'Bug report',
    type: 'BUG' as const,
    priority: 'HIGH' as const,
    description: '## Steps to reproduce\n1. \n2. \n\n## Expected\n\n## Actual\n',
    acceptanceCriteria: '- [ ] Root cause identified\n- [ ] Fix verified in the affected flow\n- [ ] Regression test added',
  },
  {
    name: 'Feature',
    type: 'FEATURE' as const,
    priority: 'MEDIUM' as const,
    description: '## Problem\n\n## Proposed solution\n',
    goal: 'What outcome should this deliver?',
    acceptanceCriteria: '- [ ] \n- [ ] ',
    constraints: '',
  },
]

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get('/', async (request) => {
    const { orgId } = request.query as { orgId?: string }
    if (!orgId) throw new ApiError(400, 'orgId query parameter is required')
    await assertOrgRole(request.userId!, orgId, 'MEMBER')
    const templates = await prisma.ticketTemplate.findMany({ where: { orgId }, orderBy: { name: 'asc' } })
    return { templates }
  })

  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body)
    await assertOrgRole(request.userId!, body.orgId, 'ADMIN')
    const template = await prisma.ticketTemplate.create({ data: body })
    return reply.code(201).send({ template })
  })

  app.patch('/:id', async (request) => {
    const { id } = request.params as { id: string }
    const body = updateSchema.parse(request.body)
    const existing = await prisma.ticketTemplate.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Template not found')
    await assertOrgRole(request.userId!, existing.orgId, 'ADMIN')
    const template = await prisma.ticketTemplate.update({ where: { id }, data: body })
    return { template }
  })

  // Re-seed the starter templates for orgs created before W1 (idempotent by name).
  app.post('/seed-defaults', async (request, reply) => {
    const { orgId } = z.object({ orgId: z.string().uuid() }).parse(request.body)
    await assertOrgRole(request.userId!, orgId, 'ADMIN')
    await prisma.ticketTemplate.createMany({
      data: DEFAULT_TEMPLATES.map((tpl) => ({ ...tpl, orgId })),
      skipDuplicates: true,
    })
    const templates = await prisma.ticketTemplate.findMany({ where: { orgId }, orderBy: { name: 'asc' } })
    return reply.code(201).send({ templates })
  })

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const existing = await prisma.ticketTemplate.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Template not found')
    await assertOrgRole(request.userId!, existing.orgId, 'ADMIN')
    await prisma.ticketTemplate.delete({ where: { id } })
    return reply.code(204).send()
  })
}

export default routes
