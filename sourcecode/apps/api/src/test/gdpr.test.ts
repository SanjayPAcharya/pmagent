import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index'
import { signToken } from './auth-test-kit'

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
