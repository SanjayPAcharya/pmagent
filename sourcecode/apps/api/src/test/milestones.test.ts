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
