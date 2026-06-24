import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { ApiError } from '../lib/errors.js'
import { decodeCursor, paginate, DEFAULT_LIMIT, MAX_LIMIT } from '../lib/pagination.js'

// Caller-scoped: every handler filters by request.userId. Notifications are
// per-user, so this route deliberately does NOT use requireOrgRole — guarding by
// org would leak another user's notifications within the same org (IDOR).

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: z.string().optional(),
})
const idParams = z.object({ id: z.string().uuid() })

const routes: FastifyPluginAsync = async (app) => {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', requireAuth)

  r.get('/', { schema: { querystring: listQuery, tags: ['notifications'] } }, async (request) => {
    const { limit, cursor } = request.query
    const rows = await prisma.notification.findMany({
      where: { userId: request.userId! },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: decodeCursor(cursor) }, skip: 1 } : {}),
    })
    return paginate(rows, limit)
  })

  r.get('/unread-count', { schema: { tags: ['notifications'] } }, async (request) => {
    const count = await prisma.notification.count({ where: { userId: request.userId!, readAt: null } })
    return { count }
  })

  r.post('/:id/read', { schema: { params: idParams, tags: ['notifications'] } }, async (request) => {
    // Match on (id, userId) so one user can never mark another's notification.
    const res = await prisma.notification.updateMany({
      where: { id: request.params.id, userId: request.userId! },
      data: { readAt: new Date() },
    })
    if (res.count === 0) throw new ApiError(404, 'Notification not found')
    return { ok: true }
  })

  r.post('/read-all', { schema: { tags: ['notifications'] } }, async (request) => {
    const res = await prisma.notification.updateMany({
      where: { userId: request.userId!, readAt: null },
      data: { readAt: new Date() },
    })
    return { updated: res.count }
  })
}

export default routes
