import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { ApiError } from '../lib/errors.js'

// Public-vs-gated: the /invite/:token *page* is public (Phase 2D routing), but
// accepting requires a signed-in Keycloak user — that's who joins the org.

const tokenParams = z.object({ token: z.string().min(10).max(255) })

const routes: FastifyPluginAsync = async (app) => {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', requireAuth)

  r.post('/:token/accept', { schema: { params: tokenParams, tags: ['invites'] } }, async (request) => {
    const { token } = request.params
    const invite = await prisma.orgInvite.findUnique({ where: { token } })
    if (!invite) throw new ApiError(404, 'Invite not found')
    if (invite.expiresAt < new Date()) throw new ApiError(400, 'Invite has expired', 'INVITE_EXPIRED')

    // Optional email binding: if the invite targets an address, only that user can accept.
    if (invite.email) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId! } })
      if (user.email.toLowerCase() !== invite.email.toLowerCase())
        throw new ApiError(403, 'This invite is for a different email address', 'INVITE_EMAIL_MISMATCH')
    }

    // Single-use: atomically claim acceptedAt; a second accept finds 0 rows.
    const claimed = await prisma.orgInvite.updateMany({
      where: { token, acceptedAt: null },
      data: { acceptedAt: new Date() },
    })
    if (claimed.count === 0) throw new ApiError(400, 'Invite has already been used', 'INVITE_USED')

    // Add membership at the invite's (already role-capped) role; no-op if already a member.
    await prisma.orgMember.upsert({
      where: { orgId_userId: { orgId: invite.orgId, userId: request.userId! } },
      create: { orgId: invite.orgId, userId: request.userId!, role: invite.role },
      update: {},
    })
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: invite.orgId } })
    return { org: { id: org.id, slug: org.slug, name: org.name }, role: invite.role }
  })
}

export default routes
