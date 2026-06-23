import type { FastifyRequest, FastifyReply } from 'fastify'
import type { OrgRole } from '@prisma/client'
import { prisma } from '../db/client.js'
import { ApiError } from '../lib/errors.js'
import { assertOrgRole } from '../services/authz.js'

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string
  }
}

interface KeycloakClaims {
  sub: string
  email?: string
  name?: string
  preferred_username?: string
}

/**
 * Verify the Keycloak access token (signature via JWKS + iss + aud, configured in
 * the jwt plugin) and just-in-time provision a local User row keyed by the token
 * subject. Provision once (read-then-create) — never a write per request.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch (err) {
    request.log.warn({ err: (err as Error).message }, 'jwtVerify failed')
    return reply.code(401).send({ error: 'Unauthorized', code: 'INVALID_TOKEN' })
  }

  const claims = request.user as KeycloakClaims
  const email = claims.email ?? `${claims.sub}@users.noreply.agentpm.local`
  const name = claims.name ?? claims.preferred_username ?? email

  let user = await prisma.user.findUnique({ where: { idpSub: claims.sub } })
  if (!user) {
    user = await prisma.user.create({ data: { idpSub: claims.sub, email, name } })
  }
  request.userId = user.id
}

/**
 * Guard for org-scoped routes. Resolves the org from `:orgId` or `:slug` params,
 * checks the caller's membership role meets `min`. Use after requireAuth.
 */
export function requireOrgRole(min: OrgRole) {
  return async (request: FastifyRequest) => {
    const params = request.params as { orgId?: string; slug?: string }
    const org = params.orgId
      ? await prisma.organization.findUnique({ where: { id: params.orgId } })
      : params.slug
        ? await prisma.organization.findUnique({ where: { slug: params.slug } })
        : null

    if (!org) throw new ApiError(404, 'Organization not found')
    await assertOrgRole(request.userId!, org.id, min)
  }
}
