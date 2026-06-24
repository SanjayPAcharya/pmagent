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
