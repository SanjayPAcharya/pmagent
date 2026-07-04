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

async function setup(owner: string) {
  const org = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: 'Sprint Org' } })
  const orgId = org.json().org.id
  const proj = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(owner), payload: { orgId, name: 'Proj' } })
  return { orgId, projectId: proj.json().project.id as string }
}
const createTicket = (t: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/tickets', headers: bearer(t), payload })

describe('sprints', () => {
  it('creates, adds tickets, and tracks completion counts', async () => {
    const owner = await tokenFor('s-owner')
    const { projectId } = await setup(owner)

    const sprintRes = await app.inject({ method: 'POST', url: '/api/sprints', headers: bearer(owner), payload: { projectId, name: 'Sprint 1' } })
    expect(sprintRes.statusCode).toBe(201)
    const sprintId = sprintRes.json().sprint.id

    const t1 = await createTicket(owner, { projectId, title: 'A', storyPoints: 3 })
    const t2 = await createTicket(owner, { projectId, title: 'B', storyPoints: 5 })
    const add = await app.inject({
      method: 'POST',
      url: `/api/sprints/${sprintId}/tickets`,
      headers: bearer(owner),
      payload: { ticketIds: [t1.json().ticket.id, t2.json().ticket.id] },
    })
    expect(add.statusCode).toBe(200)
    expect(add.json().counts.total).toBe(2)
    expect(add.json().counts.done).toBe(0)

    // move one to DONE → counts reflect it
    await app.inject({ method: 'PATCH', url: `/api/tickets/${t1.json().ticket.id}/status`, headers: bearer(owner), payload: { status: 'DONE' } })
    const got = await app.inject({ method: 'GET', url: `/api/sprints/${sprintId}`, headers: bearer(owner) })
    expect(got.json().counts.done).toBe(1)
    expect(got.json().counts.total).toBe(2)
  })

  it('start sets ACTIVE; complete sets velocity from DONE story points', async () => {
    const owner = await tokenFor('s-owner2')
    const { projectId } = await setup(owner)
    const sprintId = (await app.inject({ method: 'POST', url: '/api/sprints', headers: bearer(owner), payload: { projectId, name: 'S' } })).json().sprint.id

    const t = await createTicket(owner, { projectId, title: 'Pts', storyPoints: 8 })
    await app.inject({ method: 'POST', url: `/api/sprints/${sprintId}/tickets`, headers: bearer(owner), payload: { ticketIds: [t.json().ticket.id] } })
    await app.inject({ method: 'PATCH', url: `/api/tickets/${t.json().ticket.id}/status`, headers: bearer(owner), payload: { status: 'DONE' } })

    const started = await app.inject({ method: 'POST', url: `/api/sprints/${sprintId}/start`, headers: bearer(owner) })
    expect(started.json().sprint.status).toBe('ACTIVE')
    expect(started.json().sprint.startDate).toBeTruthy()

    const done = await app.inject({ method: 'POST', url: `/api/sprints/${sprintId}/complete`, headers: bearer(owner) })
    expect(done.json().sprint.status).toBe('COMPLETED')
    expect(done.json().sprint.velocity).toBe(8)
  })

  it('reports: velocity per completed sprint, cycle/lead medians, workload', async () => {
    const owner = await tokenFor('s-rep-owner')
    const { projectId } = await setup(owner)
    const sprintId = (await app.inject({ method: 'POST', url: '/api/sprints', headers: bearer(owner), payload: { projectId, name: 'Rep Sprint' } })).json().sprint.id

    // Two done tickets (one passes through IN_PROGRESS → real cycle time), one open.
    const t1 = (await createTicket(owner, { projectId, title: 'Done via progress', storyPoints: 5 })).json().ticket.id
    const t2 = (await createTicket(owner, { projectId, title: 'Done directly', storyPoints: 3 })).json().ticket.id
    const t3 = (await createTicket(owner, { projectId, title: 'Still open' })).json().ticket.id
    await app.inject({ method: 'POST', url: `/api/sprints/${sprintId}/tickets`, headers: bearer(owner), payload: { ticketIds: [t1, t2] } })
    await app.inject({ method: 'PATCH', url: `/api/tickets/${t1}/status`, headers: bearer(owner), payload: { status: 'IN_PROGRESS' } })
    await app.inject({ method: 'PATCH', url: `/api/tickets/${t1}/status`, headers: bearer(owner), payload: { status: 'DONE' } })
    await app.inject({ method: 'PATCH', url: `/api/tickets/${t2}/status`, headers: bearer(owner), payload: { status: 'DONE' } })
    await app.inject({ method: 'PATCH', url: `/api/tickets/${t3}/status`, headers: bearer(owner), payload: { status: 'IN_PROGRESS' } })
    await app.inject({ method: 'POST', url: `/api/sprints/${sprintId}/start`, headers: bearer(owner) })
    await app.inject({ method: 'POST', url: `/api/sprints/${sprintId}/complete`, headers: bearer(owner) })

    const res = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/reports`, headers: bearer(owner) })
    expect(res.statusCode).toBe(200)
    const { velocity, cycle, workload } = res.json().reports

    expect(velocity).toHaveLength(1)
    expect(velocity[0]).toMatchObject({ name: 'Rep Sprint', velocity: 8 })

    expect(cycle.closedCount).toBe(2)
    expect(cycle.leadMedianDays).not.toBeNull()
    expect(cycle.cycleMedianDays).not.toBeNull()
    expect(cycle.weekly.length).toBeGreaterThan(0)
    expect(cycle.weekly.reduce((n: number, w: { count: number }) => n + w.count, 0)).toBe(2)

    // Workload: only the open ticket remains, unassigned bucket.
    expect(workload).toHaveLength(1)
    expect(workload[0]).toMatchObject({ userId: null, openCount: 1, inProgressCount: 1 })

    // Read access is MEMBER-scoped.
    const outsider = await tokenFor('s-rep-outsider')
    const denied = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/reports`, headers: bearer(outsider) })
    expect(denied.statusCode).toBe(403)
  })

  it('rejects adding a ticket from another project (cross-scope) with 400', async () => {
    const owner = await tokenFor('s-owner3')
    const { projectId } = await setup(owner)
    const other = await setup(owner)
    const sprintId = (await app.inject({ method: 'POST', url: '/api/sprints', headers: bearer(owner), payload: { projectId, name: 'S' } })).json().sprint.id
    const foreign = await createTicket(owner, { projectId: other.projectId, title: 'Foreign' })

    const res = await app.inject({ method: 'POST', url: `/api/sprints/${sprintId}/tickets`, headers: bearer(owner), payload: { ticketIds: [foreign.json().ticket.id] } })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('CROSS_SCOPE')
  })
})
