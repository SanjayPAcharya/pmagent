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
const createTicket = (t: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/tickets', headers: bearer(t), payload })

async function makeOrgProject(owner: string, orgName = 'Stats Org') {
  const org = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: orgName } })
  const orgId = org.json().org.id as string
  const slug = org.json().org.slug as string
  const proj = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(owner), payload: { orgId, name: 'Proj' } })
  return { orgId, slug, projectId: proj.json().project.id as string }
}

describe('org + project aggregates', () => {
  it('orgs list carries project, member, and open-ticket counts', async () => {
    const owner = await tokenFor('stat-owner')
    const { projectId } = await makeOrgProject(owner)
    // two open + one DONE → openTicketCount should be 2
    await createTicket(owner, { projectId, title: 'open A' })
    await createTicket(owner, { projectId, title: 'open B' })
    const done = await createTicket(owner, { projectId, title: 'closed' })
    await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${done.json().ticket.id}/status`,
      headers: bearer(owner),
      payload: { status: 'DONE' },
    })

    const list = await app.inject({ method: 'GET', url: '/api/orgs', headers: bearer(owner) })
    const org = list.json().organizations[0]
    expect(org.projectCount).toBe(1)
    expect(org.memberCount).toBe(1)
    expect(org.openTicketCount).toBe(2)
  })

  it('project list carries status breakdown, open count, and active-sprint progress', async () => {
    const owner = await tokenFor('stat-owner2')
    const { orgId, projectId } = await makeOrgProject(owner, 'Sprinty Org')
    const a = await createTicket(owner, { projectId, title: 'A' })
    const b = await createTicket(owner, { projectId, title: 'B' })
    await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${b.json().ticket.id}/status`,
      headers: bearer(owner),
      payload: { status: 'DONE' },
    })

    // active sprint with both tickets in it → total 2, done 1
    const sprintId = (
      await app.inject({ method: 'POST', url: '/api/sprints', headers: bearer(owner), payload: { projectId, name: 'S1' } })
    ).json().sprint.id
    await app.inject({ method: 'POST', url: `/api/sprints/${sprintId}/start`, headers: bearer(owner) })
    await app.inject({
      method: 'POST',
      url: `/api/sprints/${sprintId}/tickets`,
      headers: bearer(owner),
      payload: { ticketIds: [a.json().ticket.id, b.json().ticket.id] },
    })

    const res = await app.inject({ method: 'GET', url: `/api/projects?orgId=${orgId}`, headers: bearer(owner) })
    const project = res.json().projects[0]
    expect(project.openTicketCount).toBe(1) // A open, B done
    expect(project.byStatus.BACKLOG).toBe(1)
    expect(project.byStatus.DONE).toBe(1)
    expect(project.activeSprint).toMatchObject({ name: 'S1', total: 2, done: 1 })
  })
})

describe('activity feed', () => {
  it('returns recent activity for members and 403s non-members', async () => {
    const owner = await tokenFor('act-owner')
    const { slug, projectId } = await makeOrgProject(owner, 'Activity Org')
    const t = await createTicket(owner, { projectId, title: 'Track me' })
    await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${t.json().ticket.id}/status`,
      headers: bearer(owner),
      payload: { status: 'IN_PROGRESS' },
    })

    const feed = await app.inject({ method: 'GET', url: `/api/orgs/${slug}/activity`, headers: bearer(owner) })
    expect(feed.statusCode).toBe(200)
    const items = feed.json().activity
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].ticket.title).toBe('Track me')
    expect(items[0].ticket.projectKey).toBeTruthy()

    const proj = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/activity`, headers: bearer(owner) })
    expect(proj.statusCode).toBe(200)
    expect(proj.json().activity.length).toBeGreaterThan(0)

    const stranger = await tokenFor('act-stranger')
    const denied = await app.inject({ method: 'GET', url: `/api/orgs/${slug}/activity`, headers: bearer(stranger) })
    expect(denied.statusCode).toBe(403)
  })
})
