import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index'
import { signToken } from './auth-test-kit'
import { prisma } from '../db/client'

// GDPR data-subject rights (Phase 3.7.4 B1/B2). Own file per the archive/audit
// precedent — keeps the shared-DB truncation cleanly scoped.
let app: FastifyInstance
beforeAll(async () => {
  app = await buildServer()
})
afterAll(async () => {
  await app.close()
})

const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const tokenFor = (sub: string) => signToken({ sub, email: `${sub}@x.com`, name: sub })

describe('GET /api/me/export', () => {
  it('bundles profile, org membership, and an owned ticket — and no one else’s data', async () => {
    const owner = await tokenFor('gdpr-owner')
    const org = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: 'Export Co' } })
    const orgId = org.json().org.id as string
    const proj = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(owner), payload: { orgId, name: 'P' } })
    const projectId = proj.json().project.id as string
    const ticket = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: bearer(owner),
      payload: { projectId, title: 'My exportable ticket' },
    })
    const ticketId = ticket.json().ticket.id as string
    await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: bearer(owner),
      payload: { body: 'a comment of mine' },
    })

    // A second user in the same org must not leak into the export.
    const other = await tokenFor('gdpr-other')
    await app.inject({ method: 'GET', url: '/api/me', headers: bearer(other) })
    await app.inject({
      method: 'POST',
      url: '/api/orgs/export-co/members',
      headers: bearer(owner),
      payload: { email: 'gdpr-other@x.com', role: 'MEMBER' },
    })

    const res = await app.inject({ method: 'GET', url: '/api/me/export', headers: bearer(owner) })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="agentpm-export-\d{4}-\d{2}-\d{2}\.json"$/)
    const body = res.json()
    expect(body.format).toBe('agentpm/v1')
    expect(body.data.profile.email).toBe('gdpr-owner@x.com')
    expect(body.data.memberships.some((m: { org: { slug: string } }) => m.org.slug === 'export-co')).toBe(true)
    expect(body.data.createdTickets.some((t: { title: string }) => t.title === 'My exportable ticket')).toBe(true)
    expect(body.data.comments.some((c: { body: string }) => c.body === 'a comment of mine')).toBe(true)
    expect(JSON.stringify(body)).not.toContain('gdpr-other@x.com')
  })
})

describe('DELETE /api/me', () => {
  it('blocks erasure when it would leave an org without an owner', async () => {
    const solo = await tokenFor('gdpr-solo-owner')
    await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(solo), payload: { name: 'Solo Owner Co' } })

    const res = await app.inject({ method: 'DELETE', url: '/api/me', headers: bearer(solo) })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('SOLE_OWNER')
  })

  it('anonymizes the account: memberships/watchers/notifications gone, created ticket kept under "Deleted user"', async () => {
    const owner = await tokenFor('gdpr-erase-owner')
    const orgRes = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: 'Erase Co' } })
    const orgId = orgRes.json().org.id as string

    // A second owner so erasure isn't blocked by SOLE_OWNER.
    const co = await tokenFor('gdpr-erase-co-owner')
    await app.inject({ method: 'GET', url: '/api/me', headers: bearer(co) })
    await app.inject({
      method: 'POST',
      url: '/api/orgs/erase-co/members',
      headers: bearer(owner),
      payload: { email: 'gdpr-erase-co-owner@x.com', role: 'ADMIN' },
    })
    const coMeRes = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(co) })
    const coUserId = coMeRes.json().user.id as string
    await app.inject({
      method: 'PATCH',
      url: `/api/orgs/erase-co/members/${coUserId}`,
      headers: bearer(owner),
      payload: { role: 'OWNER' },
    })

    const proj = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(owner), payload: { orgId, name: 'P' } })
    const projectId = proj.json().project.id as string
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: bearer(owner),
      payload: { projectId, title: 'Owned by the deleted user' },
    })
    const ticketId = ticketRes.json().ticket.id as string
    const ownerId = ticketRes.json().ticket.createdById as string

    const del = await app.inject({ method: 'DELETE', url: '/api/me', headers: bearer(owner) })
    expect(del.statusCode).toBe(204)

    const anonymized = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })
    expect(anonymized.name).toBe('Deleted user')
    expect(anonymized.email).toBe(`deleted-${ownerId}@anonymized.invalid`)
    expect(anonymized.idpSub).toBeNull()
    expect(await prisma.orgMember.count({ where: { userId: ownerId } })).toBe(0)

    // The ticket they created still exists, still attributed to (now-anonymous) them.
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })
    expect(ticket.createdById).toBe(ownerId)

    const rows = await prisma.auditLog.findMany({ where: { action: 'account.erased', targetId: ownerId } })
    expect(rows).toHaveLength(1)
  })
})
