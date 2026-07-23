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
async function makeOrg(token: string, name: string): Promise<{ id: string; slug: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(token), payload: { name } })
  return { id: res.json().org.id, slug: res.json().org.slug }
}
async function makeProject(token: string, orgId: string, name: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(token), payload: { orgId, name } })
  return res.json().project.id as string
}
function addMember(ownerToken: string, slug: string, email: string, role = 'MEMBER') {
  return app.inject({ method: 'POST', url: `/api/orgs/${slug}/members`, headers: bearer(ownerToken), payload: { email, role } })
}
const listMilestones = (t: string, p: string) =>
  app.inject({ method: 'GET', url: `/api/projects/${p}/milestones`, headers: bearer(t) })
const createMilestone = (t: string, p: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `/api/projects/${p}/milestones`, headers: bearer(t), payload })
const getMilestone = (t: string, p: string, id: string) =>
  app.inject({ method: 'GET', url: `/api/projects/${p}/milestones/${id}`, headers: bearer(t) })
const createTicket = (t: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/tickets', headers: bearer(t), payload })
const patchTicket = (t: string, id: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url: `/api/tickets/${id}`, headers: bearer(t), payload })

const DATE = '2026-09-01T00:00:00.000Z'

describe('milestones (3.7 R2)', () => {
  it('CRUD happy path, ordered by date asc', async () => {
    const owner = await tokenFor('m-owner1')
    const { id: orgId } = await makeOrg(owner, 'MS Co')
    const projectId = await makeProject(owner, orgId, 'App')

    const later = await createMilestone(owner, projectId, { name: 'GA', date: '2026-10-01T00:00:00.000Z' })
    const earlier = await createMilestone(owner, projectId, { name: 'Beta', description: 'first cut', date: DATE })
    expect(later.statusCode).toBe(201)
    expect(earlier.statusCode).toBe(201)

    const list = await listMilestones(owner, projectId)
    const names = (list.json().milestones as { name: string }[]).map((m) => m.name)
    expect(names).toEqual(['Beta', 'GA']) // date asc

    const id = earlier.json().milestone.id
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/milestones/${id}`,
      headers: bearer(owner),
      payload: { done: true, name: 'Beta 1' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().milestone.done).toBe(true)
    expect(patched.json().milestone.name).toBe('Beta 1')

    const del = await app.inject({ method: 'DELETE', url: `/api/projects/${projectId}/milestones/${id}`, headers: bearer(owner) })
    expect(del.statusCode).toBe(204)
    const after = await listMilestones(owner, projectId)
    expect(after.json().milestones).toHaveLength(1)
  })

  it('MEMBER can create/edit but not delete; ADMIN/OWNER can delete', async () => {
    const owner = await tokenFor('m-owner2')
    const { id: orgId, slug } = await makeOrg(owner, 'MS Roles')
    const projectId = await makeProject(owner, orgId, 'App')

    const member = await tokenFor('m-member')
    await provision(member)
    await addMember(owner, slug, 'm-member@x.com', 'MEMBER')

    const created = await createMilestone(member, projectId, { name: 'By member', date: DATE })
    expect(created.statusCode).toBe(201)
    const id = created.json().milestone.id

    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/milestones/${id}`,
      headers: bearer(member),
      payload: { done: true },
    })
    expect(edited.statusCode).toBe(200)

    // MEMBER cannot delete
    const memberDel = await app.inject({ method: 'DELETE', url: `/api/projects/${projectId}/milestones/${id}`, headers: bearer(member) })
    expect(memberDel.statusCode).toBe(403)

    // OWNER can
    const ownerDel = await app.inject({ method: 'DELETE', url: `/api/projects/${projectId}/milestones/${id}`, headers: bearer(owner) })
    expect(ownerDel.statusCode).toBe(204)
  })

  it('rejects an outsider with 403', async () => {
    const owner = await tokenFor('m-owner3')
    const { id: orgId } = await makeOrg(owner, 'MS Private')
    const projectId = await makeProject(owner, orgId, 'App')

    const outsider = await tokenFor('m-outsider')
    await provision(outsider)
    const res = await listMilestones(outsider, projectId)
    expect(res.statusCode).toBe(403)
  })

  it("returns 404 when the milestone belongs to another project", async () => {
    const owner = await tokenFor('m-owner4')
    const { id: orgId } = await makeOrg(owner, 'MS Cross')
    const projectA = await makeProject(owner, orgId, 'A')
    const projectB = await makeProject(owner, orgId, 'B')

    const created = await createMilestone(owner, projectA, { name: 'On A', date: DATE })
    const id = created.json().milestone.id

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectB}/milestones/${id}`,
      headers: bearer(owner),
      payload: { done: true },
    })
    expect(patch.statusCode).toBe(404)
  })
})

describe('milestones v2 — linked-ticket progress (3.8.5 MS-1/MS-2/MS-4)', () => {
  it('progress derives from linked tickets and stays stable when another milestone is added', async () => {
    const owner = await tokenFor('msv2-owner1')
    const { id: orgId } = await makeOrg(owner, 'MSv2 Co')
    const projectId = await makeProject(owner, orgId, 'App')

    // Milestone A, plus 4 linked tickets — 3 DONE, 1 open.
    const a = (await createMilestone(owner, projectId, { name: 'A', date: '2026-10-01T00:00:00.000Z' })).json().milestone.id
    for (const s of ['DONE', 'DONE', 'DONE', 'TODO']) {
      const res = await createTicket(owner, { projectId, title: `t-${s}`, status: s, milestoneId: a })
      expect(res.statusCode).toBe(201)
      expect(res.json().ticket.milestoneId).toBe(a)
    }

    const listed = (await listMilestones(owner, projectId)).json().milestones as { id: string; progress: { done: number; total: number } }[]
    expect(listed.find((m) => m.id === a)!.progress).toEqual({ done: 3, total: 4 })

    // Detail lists exactly those tickets and matches the figure.
    const detail = await getMilestone(owner, projectId, a)
    expect(detail.statusCode).toBe(200)
    expect(detail.json().progress).toEqual({ done: 3, total: 4 })
    expect(detail.json().tickets).toHaveLength(4)

    // The tester's scenario: add milestone B dated EARLIER than A. Under the old
    // date-window logic this re-bucketed A's tickets; now A is unchanged and B is empty.
    const b = (await createMilestone(owner, projectId, { name: 'B', date: '2026-08-01T00:00:00.000Z' })).json().milestone.id
    const after = (await listMilestones(owner, projectId)).json().milestones as { id: string; progress: { done: number; total: number } }[]
    expect(after.find((m) => m.id === a)!.progress).toEqual({ done: 3, total: 4 })
    expect(after.find((m) => m.id === b)!.progress).toEqual({ done: 0, total: 0 })
  })

  it('deleting a milestone unlinks its tickets (SET NULL) — tickets survive', async () => {
    const owner = await tokenFor('msv2-owner2')
    const { id: orgId } = await makeOrg(owner, 'MSv2 Del')
    const projectId = await makeProject(owner, orgId, 'App')

    const m = (await createMilestone(owner, projectId, { name: 'Doomed', date: DATE })).json().milestone.id
    const ticketId = (await createTicket(owner, { projectId, title: 'linked', milestoneId: m })).json().ticket.id

    const del = await app.inject({ method: 'DELETE', url: `/api/projects/${projectId}/milestones/${m}`, headers: bearer(owner) })
    expect(del.statusCode).toBe(204)

    // The ticket is still there, just unlinked.
    const tk = await app.inject({ method: 'GET', url: `/api/tickets/${ticketId}`, headers: bearer(owner) })
    expect(tk.statusCode).toBe(200)
    expect(tk.json().ticket.milestoneId).toBeNull()
  })

  it('rejects linking a ticket to a milestone from another project (400)', async () => {
    const owner = await tokenFor('msv2-owner3')
    const { id: orgId } = await makeOrg(owner, 'MSv2 Cross')
    const projectA = await makeProject(owner, orgId, 'A')
    const projectB = await makeProject(owner, orgId, 'B')
    const mOnB = (await createMilestone(owner, projectB, { name: 'On B', date: DATE })).json().milestone.id

    // Create-time: ticket in A referencing B's milestone.
    const created = await createTicket(owner, { projectId: projectA, title: 'x', milestoneId: mOnB })
    expect(created.statusCode).toBe(400)

    // Update-time: a valid A ticket, then try to link B's milestone.
    const okTicket = (await createTicket(owner, { projectId: projectA, title: 'y' })).json().ticket.id
    const patched = await patchTicket(owner, okTicket, { milestoneId: mOnB })
    expect(patched.statusCode).toBe(400)
  })
})
