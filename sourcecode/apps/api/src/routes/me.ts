import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const updateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().optional(),
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
}

export default meRoutes
