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

async function provision(token: string): Promise<string> {
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(token) })
  return me.json().user.id as string
}
async function makeOrg(token: string, name: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(token), payload: { name } })
  return res.json().org.id as string
}
async function makeProject(token: string, orgId: string, name: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(token), payload: { orgId, name } })
  return res.json().project.id as string
}
async function mkTicket(token: string, projectId: string, payload: Record<string, unknown>): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/tickets', headers: bearer(token), payload: { projectId, ...payload } })
  return res.json().ticket.id as string
}
const overview = (token: string, projectId: string) =>
  app.inject({ method: 'GET', url: `/api/projects/${projectId}/overview`, headers: bearer(token) })

describe('project overview (3.7 R4)', () => {
  it('aggregates status, blockers, milestones, and capacity', async () => {
    const owner = await tokenFor('ov-owner')
    const orgId = await makeOrg(owner, 'Overview Co')
    const projectId = await makeProject(owner, orgId, 'Dash')

    // Mixed statuses + workstreams; two tickets (one DONE) will be linked to the milestone.
    const t1 = await mkTicket(owner, projectId, { title: 'Done+due', status: 'DONE', dueDate: '2026-08-01T00:00:00.000Z' })
    const t2 = await mkTicket(owner, projectId, { title: 'Todo+due+adhoc', status: 'TODO', workstream: 'ADHOC', dueDate: '2026-08-15T00:00:00.000Z' })
    await mkTicket(owner, projectId, { title: 'Blocked', status: 'BLOCKED' })
    const t4 = await mkTicket(owner, projectId, { title: 'In progress', status: 'IN_PROGRESS' })
    const t5 = await mkTicket(owner, projectId, { title: 'Dependency', status: 'TODO' })

    // t4 depends on t5 (open) → t4 has one open blocker.
    const dep = await app.inject({ method: 'POST', url: `/api/tickets/${t4}/dependencies`, headers: bearer(owner), payload: { dependsOnId: t5 } })
    expect(dep.statusCode).toBe(201)

    // 3.8.5 MS-2 — readiness derives from linked tickets: link t1 (DONE) + t2 (open).
    const gaRes = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/milestones`, headers: bearer(owner), payload: { name: 'GA', date: '2026-09-01T00:00:00.000Z' } })
    const gaId = gaRes.json().milestone.id
    for (const id of [t1, t2]) await app.inject({ method: 'PATCH', url: `/api/tickets/${id}`, headers: bearer(owner), payload: { milestoneId: gaId } })

    const res = await overview(owner, projectId)
    expect(res.statusCode).toBe(200)
    const o = res.json().overview

    // ── Status ──
    expect(o.status.done).toBe(1)
    expect(o.status.open).toBe(4) // TODO×2, BLOCKED, IN_PROGRESS
    expect(o.status.byStatus.TODO).toBe(2)
    expect(o.status.byStatus.BLOCKED).toBe(1)
    expect(o.status.byStatus.DONE).toBe(1)
    expect(o.status.byStatus.IN_PROGRESS).toBe(1)
    expect(o.status.byWorkstream).toEqual({ SPRINT: 4, ADHOC: 1 })

    // ── Active sprint (none) ──
    expect(o.activeSprint).toBeNull()

    // ── Blockers: t4 (1 open dep) ranked above the plain BLOCKED ticket ──
    expect(o.blockers).toHaveLength(2)
    expect(o.blockers[0].id).toBe(t4)
    expect(o.blockers[0].openBlockerCount).toBe(1)
    const blocked = o.blockers.find((b: { title: string }) => b.title === 'Blocked')
    expect(blocked).toBeTruthy()
    expect(blocked.openBlockerCount).toBe(0)

    // ── Milestones + readiness (two linked tickets; one DONE) ──
    expect(o.milestones).toHaveLength(1)
    expect(o.milestones[0].name).toBe('GA')
    expect(o.milestones[0].readiness).toEqual({ done: 1, total: 2 })

    // ── Capacity: one unassigned bucket, no completed sprints ──
    expect(o.capacity.recentVelocityAvg).toBeNull()
    expect(o.capacity.rows).toHaveLength(1)
    expect(o.capacity.rows[0].userId).toBeNull()
    expect(o.capacity.rows[0].openCount).toBe(4)
    expect(o.capacity.rows[0].inProgressCount).toBe(1)
  })

  it('rejects an outsider with 403', async () => {
    const owner = await tokenFor('ov-owner2')
    const orgId = await makeOrg(owner, 'Overview Private')
    const projectId = await makeProject(owner, orgId, 'Dash')

    const outsider = await tokenFor('ov-outsider')
    await provision(outsider)
    const res = await overview(outsider, projectId)
    expect(res.statusCode).toBe(403)
  })
})
