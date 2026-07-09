import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index'
import { signToken } from './auth-test-kit'
import { prisma } from '../db/client'

// Audit trail (Phase 3.7.4 C2). Kept in its own file, same pattern as
// archive.test.ts, so the shared-DB truncation stays cleanly scoped.
let app: FastifyInstance
beforeAll(async () => {
  app = await buildServer()
})
afterAll(async () => {
  await app.close()
})

const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const tokenFor = (sub: string) => signToken({ sub, email: `${sub}@x.com`, name: sub })

describe('audit log', () => {
  it('records member.role_changed with from/to meta', async () => {
    const owner = await tokenFor('aud-owner')
    await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: 'Audit Co' } })

    const member = await tokenFor('aud-member')
    await app.inject({ method: 'GET', url: '/api/me', headers: bearer(member) })
    await app.inject({
      method: 'POST',
      url: '/api/orgs/audit-co/members',
      headers: bearer(owner),
      payload: { email: 'aud-member@x.com', role: 'MEMBER' },
    })
    const meRes = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(member) })
    const memberId = meRes.json().user.id as string

    const org = await app.inject({ method: 'GET', url: '/api/orgs/audit-co', headers: bearer(owner) })
    const orgId = org.json().org.id as string

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/orgs/audit-co/members/${memberId}`,
      headers: bearer(owner),
      payload: { role: 'ADMIN' },
    })
    expect(patch.statusCode).toBe(200)

    const rows = await prisma.auditLog.findMany({ where: { orgId, action: 'member.role_changed', targetId: memberId } })
    expect(rows).toHaveLength(1)
    expect(rows[0].meta).toEqual({ from: 'MEMBER', to: 'ADMIN' })
  })

  it('records ticket.permanently_deleted', async () => {
    const owner = await tokenFor('aud-owner2')
    const orgRes = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: 'Purge Co' } })
    const orgId = orgRes.json().org.id as string
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: bearer(owner),
      payload: { orgId, name: 'Bin' },
    })
    const projectId = projRes.json().project.id as string
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: bearer(owner),
      payload: { projectId, title: 'Shred me' },
    })
    const ticketId = ticketRes.json().ticket.id as string
    await app.inject({ method: 'DELETE', url: `/api/tickets/${ticketId}`, headers: bearer(owner) }) // archive first

    const del = await app.inject({ method: 'DELETE', url: `/api/tickets/${ticketId}/permanent`, headers: bearer(owner) })
    expect(del.statusCode).toBe(204)

    const rows = await prisma.auditLog.findMany({
      where: { orgId, action: 'ticket.permanently_deleted', targetId: ticketId },
    })
    expect(rows).toHaveLength(1)
  })

  it('GET /:slug/audit lists rows for ADMIN, 403s for MEMBER', async () => {
    const owner = await tokenFor('aud-owner3')
    await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: 'Ledger Co' } })
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: bearer(owner),
      payload: { orgId: (await app.inject({ method: 'GET', url: '/api/orgs/ledger-co', headers: bearer(owner) })).json().org.id, name: 'P' },
    })

    const member = await tokenFor('aud-member3')
    await app.inject({ method: 'GET', url: '/api/me', headers: bearer(member) })
    await app.inject({
      method: 'POST',
      url: '/api/orgs/ledger-co/members',
      headers: bearer(owner),
      payload: { email: 'aud-member3@x.com', role: 'MEMBER' },
    })

    const asOwner = await app.inject({ method: 'GET', url: '/api/orgs/ledger-co/audit', headers: bearer(owner) })
    expect(asOwner.statusCode).toBe(200)
    expect(asOwner.json().items.length).toBeGreaterThan(0)
    expect(asOwner.json().items.some((r: { action: string }) => r.action === 'org.created')).toBe(true)

    const asMember = await app.inject({ method: 'GET', url: '/api/orgs/ledger-co/audit', headers: bearer(member) })
    expect(asMember.statusCode).toBe(403)
  })
})
