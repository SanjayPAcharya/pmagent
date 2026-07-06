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
async function makeProject(token: string, orgId: string, name: string): Promise<{ id: string; key: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(token), payload: { orgId, name } })
  return { id: res.json().project.id, key: res.json().project.key }
}
async function mkTicket(token: string, projectId: string, payload: Record<string, unknown>): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/tickets', headers: bearer(token), payload: { projectId, ...payload } })
  return res.json().ticket.id as string
}

describe('project gantt (3.7 R6)', () => {
  it('returns dated tickets, dependency edges, milestones, and truncated=false', async () => {
    const owner = await tokenFor('gantt-owner')
    const orgId = await makeOrg(owner, 'Gantt Co')
    const { id: projectId, key } = await makeProject(owner, orgId, 'Timeline')

    const a = await mkTicket(owner, projectId, {
      title: 'Spanned',
      startDate: '2026-07-04T00:00:00.000Z',
      dueDate: '2026-07-10T00:00:00.000Z',
    })
    const b = await mkTicket(owner, projectId, { title: 'Depends', dueDate: '2026-07-12T00:00:00.000Z' })
    // b depends on a
    await app.inject({ method: 'POST', url: `/api/tickets/${b}/dependencies`, headers: bearer(owner), payload: { dependsOnId: a } })
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/milestones`, headers: bearer(owner), payload: { name: 'GA', date: '2026-08-01T00:00:00.000Z' } })

    const res = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/gantt`, headers: bearer(owner) })
    expect(res.statusCode).toBe(200)
    const g = res.json().gantt

    expect(g.truncated).toBe(false)
    expect(g.items).toHaveLength(2)
    const spanned = g.items.find((i: { title: string }) => i.title === 'Spanned')
    expect(spanned.key).toBe(`${key}-1`)
    expect(spanned.startDate).toBe('2026-07-04T00:00:00.000Z')
    expect(spanned.dueDate).toBe('2026-07-10T00:00:00.000Z')
    expect(spanned.workstream).toBe('SPRINT')

    expect(g.edges).toEqual([{ ticketId: b, dependsOnId: a }])
    expect(g.milestones).toHaveLength(1)
    expect(g.milestones[0].name).toBe('GA')
  })

  it('rejects an outsider with 403', async () => {
    const owner = await tokenFor('gantt-owner2')
    const orgId = await makeOrg(owner, 'Gantt Private')
    const { id: projectId } = await makeProject(owner, orgId, 'Timeline')

    const outsider = await tokenFor('gantt-outsider')
    await provision(outsider)
    const res = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/gantt`, headers: bearer(outsider) })
    expect(res.statusCode).toBe(403)
  })
})
