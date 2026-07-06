import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index'
import { signToken } from './auth-test-kit'

let app: FastifyInstance
beforeAll(async () => {
  app = await buildServer()
})
afterAll(async () => {
  await app.close()
})

const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const tokenFor = (sub: string) => signToken({ sub, email: `${sub}@x.com`, name: sub })
async function provision(token: string) {
  return (await app.inject({ method: 'GET', url: '/api/me', headers: bearer(token) })).json().user.id as string
}
async function setup(owner: string) {
  const org = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: 'Detail Org' } })
  const orgId = org.json().org.id
  const slug = org.json().org.slug
  const proj = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(owner), payload: { orgId, name: 'P' } })
  return { slug, projectId: proj.json().project.id as string }
}
const createTicket = (t: string, projectId: string, title: string) =>
  app.inject({ method: 'POST', url: '/api/tickets', headers: bearer(t), payload: { projectId, title } })

describe('ticket comments / watchers / update', () => {
  it('adds and lists comments', async () => {
    const owner = await tokenFor('d-owner')
    const { projectId } = await setup(owner)
    const ticketId = (await createTicket(owner, projectId, 'Has comments')).json().ticket.id

    const added = await app.inject({ method: 'POST', url: `/api/tickets/${ticketId}/comments`, headers: bearer(owner), payload: { body: 'Looks good **to me**' } })
    expect(added.statusCode).toBe(201)

    const list = await app.inject({ method: 'GET', url: `/api/tickets/${ticketId}/comments`, headers: bearer(owner) })
    expect(list.json().comments).toHaveLength(1)
    expect(list.json().comments[0].body).toContain('Looks good')
  })

  it('adds/removes a watcher and records activity', async () => {
    const owner = await tokenFor('d-owner2')
    const { slug, projectId } = await setup(owner)
    const dev = await tokenFor('d-dev')
    const devId = await provision(dev)
    await app.inject({ method: 'POST', url: `/api/orgs/${slug}/members`, headers: bearer(owner), payload: { email: 'd-dev@x.com' } })
    const ticketId = (await createTicket(owner, projectId, 'Watch me')).json().ticket.id

    const add = await app.inject({ method: 'POST', url: `/api/tickets/${ticketId}/watchers`, headers: bearer(owner), payload: { userId: devId } })
    expect(add.statusCode).toBe(201)

    const rm = await app.inject({ method: 'DELETE', url: `/api/tickets/${ticketId}/watchers/${devId}`, headers: bearer(owner) })
    expect(rm.statusCode).toBe(204)

    const activity = await app.inject({ method: 'GET', url: `/api/tickets/${ticketId}/activity`, headers: bearer(owner) })
    const types = activity.json().activity.map((a: { type: string }) => a.type)
    expect(types).toContain('WATCHER_ADDED')
    expect(types).toContain('WATCHER_REMOVED')
  })

  it('handles a body-less DELETE sent with Content-Type: application/json (no 400)', async () => {
    const owner = await tokenFor('d-owner-ct')
    const { slug, projectId } = await setup(owner)
    const dev = await tokenFor('d-dev-ct')
    const devId = await provision(dev)
    await app.inject({ method: 'POST', url: `/api/orgs/${slug}/members`, headers: bearer(owner), payload: { email: 'd-dev-ct@x.com' } })
    const ticketId = (await createTicket(owner, projectId, 'CT')).json().ticket.id
    await app.inject({ method: 'POST', url: `/api/tickets/${ticketId}/watchers`, headers: bearer(owner), payload: { userId: devId } })

    // Browsers send this header even with no body; must not be a 400.
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/tickets/${ticketId}/watchers/${devId}`,
      headers: { ...bearer(owner), 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(204)
  })

  it('rejects a watcher who is not an org member (cross-scope 400)', async () => {
    const owner = await tokenFor('d-owner3')
    const { projectId } = await setup(owner)
    const stranger = await tokenFor('d-stranger')
    const strangerId = await provision(stranger)
    const ticketId = (await createTicket(owner, projectId, 'Guarded')).json().ticket.id

    const res = await app.inject({ method: 'POST', url: `/api/tickets/${ticketId}/watchers`, headers: bearer(owner), payload: { userId: strangerId } })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('CROSS_SCOPE')
  })

  it('creates labels, assigns them to a ticket, and rejects a foreign label', async () => {
    const owner = await tokenFor('d-owner-lbl')
    const { projectId } = await setup(owner)
    const orgId = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}`, headers: bearer(owner) })).json().project.orgId
    const ticketId = (await createTicket(owner, projectId, 'Labelled')).json().ticket.id

    const label = await app.inject({ method: 'POST', url: '/api/labels', headers: bearer(owner), payload: { orgId, name: 'urgent', color: '#ff0000' } })
    expect(label.statusCode).toBe(201)
    const labelId = label.json().label.id

    const list = await app.inject({ method: 'GET', url: `/api/labels?orgId=${orgId}`, headers: bearer(owner) })
    expect(list.json().labels.map((l: { name: string }) => l.name)).toContain('urgent')

    const assigned = await app.inject({ method: 'PATCH', url: `/api/tickets/${ticketId}`, headers: bearer(owner), payload: { labelIds: [labelId] } })
    expect(assigned.statusCode).toBe(200)
    expect(assigned.json().ticket.labels.map((l: { id: string }) => l.id)).toEqual([labelId])

    // a label from another org → 400 cross-scope
    const other = await prisma.organization.create({ data: { name: 'Other Lbl', slug: 'other-lbl' } })
    const foreign = await prisma.label.create({ data: { orgId: other.id, name: 'x', color: '#00ff00' } })
    const bad = await app.inject({ method: 'PATCH', url: `/api/tickets/${ticketId}`, headers: bearer(owner), payload: { labelIds: [foreign.id] } })
    expect(bad.statusCode).toBe(400)
  })

  it('renames/recolors a label (ADMIN), reports usage counts, rejects name clashes', async () => {
    const owner = await tokenFor('d-owner-lbl2')
    const { slug, projectId } = await setup(owner)
    const orgId = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}`, headers: bearer(owner) })).json().project.orgId
    const ticketId = (await createTicket(owner, projectId, 'Counted')).json().ticket.id

    const mk = (name: string) =>
      app.inject({ method: 'POST', url: '/api/labels', headers: bearer(owner), payload: { orgId, name, color: '#112233' } })
    const a = (await mk('alpha')).json().label.id as string
    await mk('beta')
    await app.inject({ method: 'PATCH', url: `/api/tickets/${ticketId}`, headers: bearer(owner), payload: { labelIds: [a] } })

    // usage counts on the list endpoint
    const list = await app.inject({ method: 'GET', url: `/api/labels?orgId=${orgId}`, headers: bearer(owner) })
    const byName = Object.fromEntries(list.json().labels.map((l: { name: string; usageCount: number }) => [l.name, l.usageCount]))
    expect(byName.alpha).toBe(1)
    expect(byName.beta).toBe(0)

    // rename + recolor
    const patched = await app.inject({
      method: 'PATCH', url: `/api/labels/${a}`, headers: bearer(owner),
      payload: { name: 'alpha-2', color: '#445566' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().label).toMatchObject({ name: 'alpha-2', color: '#445566' })
    // …reflected on the ticket
    const tk = await app.inject({ method: 'GET', url: `/api/tickets/${ticketId}`, headers: bearer(owner) })
    expect(tk.json().ticket.labels[0]).toMatchObject({ name: 'alpha-2', color: '#445566' })

    // renaming onto an existing name → 409
    const clash = await app.inject({ method: 'PATCH', url: `/api/labels/${a}`, headers: bearer(owner), payload: { name: 'beta' } })
    expect(clash.statusCode).toBe(409)

    // plain MEMBER cannot patch
    const member = await tokenFor('d-member-lbl2')
    await app.inject({ method: 'GET', url: '/api/me', headers: bearer(member) })
    await app.inject({ method: 'POST', url: `/api/orgs/${slug}/members`, headers: bearer(owner), payload: { email: 'd-member-lbl2@x.com', role: 'MEMBER' } })
    const denied = await app.inject({ method: 'PATCH', url: `/api/labels/${a}`, headers: bearer(member), payload: { name: 'nope' } })
    expect(denied.statusCode).toBe(403)
  })

  it('updates a ticket and records a PRIORITY_CHANGED activity', async () => {
    const owner = await tokenFor('d-owner4')
    const { projectId } = await setup(owner)
    const ticketId = (await createTicket(owner, projectId, 'Reprioritize')).json().ticket.id

    const patched = await app.inject({ method: 'PATCH', url: `/api/tickets/${ticketId}`, headers: bearer(owner), payload: { priority: 'URGENT', title: 'Reprioritized' } })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().ticket.priority).toBe('URGENT')
    expect(patched.json().ticket.title).toBe('Reprioritized')

    const activity = await app.inject({ method: 'GET', url: `/api/tickets/${ticketId}/activity`, headers: bearer(owner) })
    expect(activity.json().activity.map((a: { type: string }) => a.type)).toContain('PRIORITY_CHANGED')
  })
})
