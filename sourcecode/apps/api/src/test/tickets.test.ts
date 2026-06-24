import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index'
import { signToken } from './auth-test-kit'
import { prisma } from '../db/client'

let app: FastifyInstance
beforeAll(async () => {
  app = await buildServer()
})
afterAll(async () => {
  await app.close()
})

const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const tokenFor = (sub: string) => signToken({ sub, email: `${sub}@x.com`, name: sub })

async function provision(token: string): Promise<string> {
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(token) })
  return me.json().user.id as string
}
async function makeOrg(token: string, name: string): Promise<{ id: string; slug: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(token), payload: { name } })
  const org = res.json().org
  return { id: org.id, slug: org.slug }
}
async function makeProject(token: string, orgId: string, name: string): Promise<{ id: string; key: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(token), payload: { orgId, name } })
  const p = res.json().project
  return { id: p.id, key: p.key }
}
async function addMember(ownerToken: string, slug: string, email: string, role = 'MEMBER') {
  return app.inject({ method: 'POST', url: `/api/orgs/${slug}/members`, headers: bearer(ownerToken), payload: { email, role } })
}
function createTicket(token: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/tickets', headers: bearer(token), payload })
}

describe('tickets', () => {
  it('creates tickets with atomic per-project numbering and project key', async () => {
    const owner = await tokenFor('t-owner')
    const { id: orgId } = await makeOrg(owner, 'Numbering Co')
    const { id: projectId, key } = await makeProject(owner, orgId, 'Web App')

    const a = await createTicket(owner, { projectId, title: 'First' })
    const b = await createTicket(owner, { projectId, title: 'Second' })
    expect(a.statusCode).toBe(201)
    expect(a.json().ticket.number).toBe(1)
    expect(a.json().ticket.key).toBe(`${key}-1`)
    expect(b.json().ticket.number).toBe(2)
    // creator auto-watches; CREATED activity recorded
    const created = a.json().ticket
    expect(created.watcherIds).toContain(await provision(owner))
  })

  it('rejects ticket creation by a non-member with 403', async () => {
    const owner = await tokenFor('t-owner2')
    const { id: orgId } = await makeOrg(owner, 'Private PM')
    const { id: projectId } = await makeProject(owner, orgId, 'Secret')

    const outsider = await tokenFor('t-outsider')
    await provision(outsider)
    const res = await createTicket(outsider, { projectId, title: 'Sneaky' })
    expect(res.statusCode).toBe(403)
  })

  it('assigns to a member, records activity, and lists watchers', async () => {
    const owner = await tokenFor('t-owner3')
    const { id: orgId, slug } = await makeOrg(owner, 'Assign Co')
    const { id: projectId } = await makeProject(owner, orgId, 'App')

    const dev = await tokenFor('t-dev')
    const devId = await provision(dev)
    await addMember(owner, slug, 't-dev@x.com')

    const created = await createTicket(owner, { projectId, title: 'Assignable', assignedToId: devId })
    const ticketId = created.json().ticket.id
    expect(created.json().ticket.assignedToId).toBe(devId)
    expect(created.json().ticket.watcherIds).toContain(devId) // assignee auto-watches

    // activity has CREATED
    const act = await app.inject({ method: 'GET', url: `/api/tickets/${ticketId}/activity`, headers: bearer(owner) })
    expect(act.json().activity.map((a: { type: string }) => a.type)).toContain('CREATED')

    // change status → STATUS_CHANGED activity
    await app.inject({ method: 'PATCH', url: `/api/tickets/${ticketId}/status`, headers: bearer(owner), payload: { status: 'IN_PROGRESS' } })
    const act2 = await app.inject({ method: 'GET', url: `/api/tickets/${ticketId}/activity`, headers: bearer(owner) })
    expect(act2.json().activity.map((a: { type: string }) => a.type)).toContain('STATUS_CHANGED')
  })

  it('rejects cross-scope references with 400', async () => {
    const owner = await tokenFor('t-owner4')
    const { id: orgId } = await makeOrg(owner, 'Scope Co')
    const { id: projectId } = await makeProject(owner, orgId, 'Main')

    // assignee not in org
    const stranger = await tokenFor('t-stranger')
    const strangerId = await provision(stranger)
    const r1 = await createTicket(owner, { projectId, title: 'X', assignedToId: strangerId })
    expect(r1.statusCode).toBe(400)
    expect(r1.json().code).toBe('CROSS_SCOPE')

    // label from another org
    const otherOrg = await prisma.organization.create({ data: { name: 'Other', slug: 'other-scope' } })
    const foreignLabel = await prisma.label.create({ data: { orgId: otherOrg.id, name: 'bug', color: '#f00' } })
    const r2 = await createTicket(owner, { projectId, title: 'Y', labelIds: [foreignLabel.id] })
    expect(r2.statusCode).toBe(400)

    // dependency on a ticket from another project
    const { id: otherProjectId } = await makeProject(owner, orgId, 'Other Proj')
    const foreign = await createTicket(owner, { projectId: otherProjectId, title: 'Foreign' })
    const r3 = await createTicket(owner, { projectId, title: 'Z', dependsOnIds: [foreign.json().ticket.id] })
    expect(r3.statusCode).toBe(400)
  })

  it('paginates with a cursor — no dupes or drops, nextCursor null at the end', async () => {
    const owner = await tokenFor('t-owner5')
    const { id: orgId } = await makeOrg(owner, 'Page Co')
    const { id: projectId } = await makeProject(owner, orgId, 'Board')
    for (let i = 0; i < 5; i++) await createTicket(owner, { projectId, title: `T${i}` })

    const seen: string[] = []
    let cursor: string | null = null
    let guard = 0
    do {
      const url = `/api/tickets?projectId=${projectId}&sort=number&limit=2${cursor ? `&cursor=${cursor}` : ''}`
      const page = await app.inject({ method: 'GET', url, headers: bearer(owner) })
      const body = page.json() as { items: { id: string }[]; nextCursor: string | null }
      seen.push(...body.items.map((t) => t.id))
      cursor = body.nextCursor
    } while (cursor && ++guard < 10)

    expect(seen).toHaveLength(5)
    expect(new Set(seen).size).toBe(5) // no duplicates
    expect(cursor).toBeNull() // terminated cleanly
  })

  it('soft-deletes: archived tickets are excluded unless includeArchived=true', async () => {
    const owner = await tokenFor('t-owner6')
    const { id: orgId } = await makeOrg(owner, 'Trash Co')
    const { id: projectId } = await makeProject(owner, orgId, 'Cans')
    const created = await createTicket(owner, { projectId, title: 'Doomed' })
    const ticketId = created.json().ticket.id

    const del = await app.inject({ method: 'DELETE', url: `/api/tickets/${ticketId}`, headers: bearer(owner) })
    expect(del.statusCode).toBe(204)

    const list = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}`, headers: bearer(owner) })
    expect(list.json().items).toHaveLength(0)

    const withArchived = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}&includeArchived=true`, headers: bearer(owner) })
    expect(withArchived.json().items).toHaveLength(1)
  })
})
