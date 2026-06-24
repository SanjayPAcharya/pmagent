import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { assertOrgRole } from '../services/authz.js'
import { ApiError } from '../lib/errors.js'

// Org-scoped labels. Tickets reference them via the TicketLabel join; assignment
// happens through PATCH /api/tickets/:id (labelIds). Cross-scope is enforced
// there (a label must belong to the ticket's org).

const createSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a #rrggbb hex'),
})
const listQuery = z.object({ orgId: z.string().uuid() })
const idParams = z.object({ id: z.string().uuid() })

const routes: FastifyPluginAsync = async (app) => {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', requireAuth)

  r.get('/', { schema: { querystring: listQuery, tags: ['labels'] } }, async (request) => {
    await assertOrgRole(request.userId!, request.query.orgId, 'MEMBER')
    const labels = await prisma.label.findMany({ where: { orgId: request.query.orgId }, orderBy: { name: 'asc' } })
    return { labels }
  })

  r.post('/', { schema: { body: createSchema, tags: ['labels'] } }, async (request, reply) => {
    const { orgId, name, color } = request.body
    await assertOrgRole(request.userId!, orgId, 'MEMBER')
    const existing = await prisma.label.findUnique({ where: { orgId_name: { orgId, name } } })
    if (existing) throw new ApiError(409, 'A label with that name already exists', 'LABEL_EXISTS')
    const label = await prisma.label.create({ data: { orgId, name, color } })
    return reply.code(201).send({ label })
  })

  r.delete('/:id', { schema: { params: idParams, tags: ['labels'] } }, async (request, reply) => {
    const label = await prisma.label.findUnique({ where: { id: request.params.id } })
    if (!label) throw new ApiError(404, 'Label not found')
    await assertOrgRole(request.userId!, label.orgId, 'ADMIN') // delete cascades to all tickets
    await prisma.label.delete({ where: { id: label.id } })
    return reply.code(204).send()
  })
}

export default routes
