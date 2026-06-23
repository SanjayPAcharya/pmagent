import type { OrgRole } from '@prisma/client'
import { prisma } from '../db/client.js'
import { ApiError } from '../lib/errors.js'

export const ROLE_ORDER: Record<OrgRole, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 }

export const roleAtLeast = (role: OrgRole, min: OrgRole): boolean =>
  ROLE_ORDER[role] >= ROLE_ORDER[min]

/** Throw 403 unless `userId` is a member of `orgId` with at least `min` role. */
export async function assertOrgRole(userId: string, orgId: string, min: OrgRole) {
  const membership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  })
  if (!membership || !roleAtLeast(membership.role, min)) {
    throw new ApiError(403, 'Insufficient permissions', 'FORBIDDEN')
  }
  return membership
}

/** Block changes that would leave an org with zero owners. */
export async function guardLastOwner(orgId: string, userId: string, newRole: OrgRole | null) {
  const target = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  })
  if (!target) throw new ApiError(404, 'Member not found')
  if (target.role === 'OWNER' && newRole !== 'OWNER') {
    const owners = await prisma.orgMember.count({ where: { orgId, role: 'OWNER' } })
    if (owners <= 1) throw new ApiError(400, 'Cannot remove the last owner of an organization.', 'LAST_OWNER')
  }
}
