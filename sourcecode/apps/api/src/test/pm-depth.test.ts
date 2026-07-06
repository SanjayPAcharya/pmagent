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

async function makeOrgProject(owner: string, orgName: string) {
  const org = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: orgName } })
  const orgId = org.json().org.id as string
  const proj = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(owner), payload: { orgId, name: 'Proj' } })
  return { orgId, slug: org.json().org.slug as string, projectId: proj.json().project.id as string }
}
const createTicket = async (t: string, payload: Record<string, unknown>) => {
  const res = await app.inject({ method: 'POST', url: '/api/tickets', headers: bearer(t), payload })
  return res.json().ticket as { id: string; number: number; key: string }
}
const setStatus = (t: string, id: string, status: string) =>
  app.inject({ method: 'PATCH', url: `/api/tickets/${id}/status`, headers: bearer(t), payload: { status } })

describe('dependencies + blocked counts', () => {
  it('add/remove dependency, blockedBy on list, clears when blocker is DONE', async () => {
    const owner = await tokenFor('dep-owner')
    const { projectId } = await makeOrgProject(owner, 'Dep Org')
    const a = await createTicket(owner, { projectId, title: 'A' })
    const b = await createTicket(owner, { projectId, title: 'B' })

    const add = await app.inject({
      method: 'POST',
      url: `/api/tickets/${a.id}/dependencies`,
      headers: bearer(owner),
      payload: { dependsOnId: b.id },
    })
    expect(add.statusCode).toBe(201)

    // list: A blocked by 1, B by 0
    let list = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}`, headers: bearer(owner) })
    let items = list.json().items as { id: string; blockedBy: number }[]
    expect(items.find((t) => t.id === a.id)!.blockedBy).toBe(1)
    expect(items.find((t) => t.id === b.id)!.blockedBy).toBe(0)

    // relations endpoint sees both directions
    const rel = await app.inject({ method: 'GET', url: `/api/tickets/${a.id}/relations`, headers: bearer(owner) })
    expect(rel.json().relations.blockedBy.map((r: { id: string }) => r.id)).toEqual([b.id])
    const relB = await app.inject({ method: 'GET', url: `/api/tickets/${b.id}/relations`, headers: bearer(owner) })
    expect(relB.json().relations.blocks.map((r: { id: string }) => r.id)).toEqual([a.id])

    // blocker DONE → A no longer blocked
    await setStatus(owner, b.id, 'DONE')
    list = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}`, headers: bearer(owner) })
    items = list.json().items
    expect(items.find((t) => t.id === a.id)!.blockedBy).toBe(0)

    // remove works
    const del = await app.inject({ method: 'DELETE', url: `/api/tickets/${a.id}/dependencies/${b.id}`, headers: bearer(owner) })
    expect(del.statusCode).toBe(204)
  })

  it('rejects self-dependency and a direct cycle with 400', async () => {
    const owner = await tokenFor('dep-owner2')
    const { projectId } = await makeOrgProject(owner, 'Cycle Org')
    const a = await createTicket(owner, { projectId, title: 'A' })
    const b = await createTicket(owner, { projectId, title: 'B' })

    const self = await app.inject({
      method: 'POST', url: `/api/tickets/${a.id}/dependencies`, headers: bearer(owner), payload: { dependsOnId: a.id },
    })
    expect(self.statusCode).toBe(400)

    await app.inject({ method: 'POST', url: `/api/tickets/${a.id}/dependencies`, headers: bearer(owner), payload: { dependsOnId: b.id } })
    const cycle = await app.inject({
      method: 'POST', url: `/api/tickets/${b.id}/dependencies`, headers: bearer(owner), payload: { dependsOnId: a.id },
    })
    expect(cycle.statusCode).toBe(400)
  })
})

describe('parent / subtasks', () => {
  it('sets a parent via PATCH, lists subtasks, rejects circular parents', async () => {
    const owner = await tokenFor('par-owner')
    const { projectId } = await makeOrgProject(owner, 'Parent Org')
    const epic = await createTicket(owner, { projectId, title: 'Epic' })
    const sub = await createTicket(owner, { projectId, title: 'Sub' })

    const patch = await app.inject({
      method: 'PATCH', url: `/api/tickets/${sub.id}`, headers: bearer(owner), payload: { parentId: epic.id },
    })
    expect(patch.statusCode).toBe(200)

    const rel = await app.inject({ method: 'GET', url: `/api/tickets/${epic.id}/relations`, headers: bearer(owner) })
    expect(rel.json().relations.subtasks.map((r: { id: string }) => r.id)).toEqual([sub.id])
    const relSub = await app.inject({ method: 'GET', url: `/api/tickets/${sub.id}/relations`, headers: bearer(owner) })
    expect(relSub.json().relations.parent.id).toBe(epic.id)

    // epic → sub would loop
    const cycle = await app.inject({
      method: 'PATCH', url: `/api/tickets/${epic.id}`, headers: bearer(owner), payload: { parentId: sub.id },
    })
    expect(cycle.statusCode).toBe(400)
  })
})

describe('global search', () => {
  it('finds tickets across the caller orgs only; supports KEY-N', async () => {
    const owner = await tokenFor('srch-owner')
    const other = await tokenFor('srch-other')
    const mine = await makeOrgProject(owner, 'Search Mine')
    const theirs = await makeOrgProject(other, 'Search Theirs')
    await createTicket(owner, { projectId: mine.projectId, title: 'Findable rocket' })
    await createTicket(other, { projectId: theirs.projectId, title: 'Findable rocket too' })

    const res = await app.inject({ method: 'GET', url: '/api/search?q=rocket', headers: bearer(owner) })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as { title: string; key: string }[]
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Findable rocket')

    const byKey = await app.inject({
      method: 'GET', url: `/api/search?q=${encodeURIComponent(items[0].key)}`, headers: bearer(owner),
    })
    expect(byKey.json().items.map((t: { key: string }) => t.key)).toContain(items[0].key)
  })

  it('matches ticket descriptions (title hits ranked first) and project names', async () => {
    const owner = await tokenFor('srch-deep')
    const outsider = await tokenFor('srch-deep-outsider')
    const { projectId } = await makeOrgProject(owner, 'Deep Search Org')
    await createTicket(owner, { projectId, title: 'Plain title', description: 'mentions kraken deep in the body' })
    await createTicket(owner, { projectId, title: 'The kraken ticket' })

    const res = await app.inject({ method: 'GET', url: '/api/search?q=kraken', headers: bearer(owner) })
    const items = res.json().items as { title: string }[]
    expect(items.map((t) => t.title)).toEqual(['The kraken ticket', 'Plain title'])

    // Project-name hits ride along, membership-scoped (helper names projects 'Proj').
    const byName = await app.inject({ method: 'GET', url: '/api/search?q=proj', headers: bearer(owner) })
    expect(byName.json().projects.map((p: { name: string }) => p.name)).toContain('Proj')
    const denied = await app.inject({ method: 'GET', url: '/api/search?q=proj', headers: bearer(outsider) })
    expect(denied.json().projects).toEqual([])
  })
})

describe('my work', () => {
  it('splits assigned vs watching', async () => {
    const owner = await tokenFor('mw-owner')
    const mate = await tokenFor('mw-mate')
    const { slug, projectId } = await makeOrgProject(owner, 'MyWork Org')
    // mate joins the org
    const mateMe = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(mate) }) // JIT-provision
    await app.inject({
      method: 'POST', url: `/api/orgs/${slug}/members`, headers: bearer(owner),
      payload: { email: 'mw-mate@x.com', role: 'MEMBER' },
    })
    const mateId = mateMe.json().user.id

    await createTicket(owner, { projectId, title: 'Mine', assignedToId: undefined })
    await createTicket(owner, { projectId, title: 'For mate', assignedToId: mateId })

    const work = await app.inject({ method: 'GET', url: '/api/me/work', headers: bearer(owner) })
    expect(work.statusCode).toBe(200)
    const { assigned, watching } = work.json() as { assigned: { title: string }[]; watching: { title: string }[] }
    expect(assigned).toHaveLength(0)
    // owner created both → watches both; "For mate" is assigned to mate, both stay in watching
    expect(watching.map((t) => t.title).sort()).toEqual(['For mate', 'Mine'])

    const mateWork = await app.inject({ method: 'GET', url: '/api/me/work', headers: bearer(mate) })
    expect(mateWork.json().assigned.map((t: { title: string }) => t.title)).toEqual(['For mate'])
  })
})

describe('batch update', () => {
  it('updates many tickets at once; rejects mixed orgs and non-members', async () => {
    const owner = await tokenFor('bat-owner')
    const { projectId } = await makeOrgProject(owner, 'Batch Org')
    const a = await createTicket(owner, { projectId, title: 'A' })
    const b = await createTicket(owner, { projectId, title: 'B' })

    const res = await app.inject({
      method: 'POST', url: '/api/tickets/batch', headers: bearer(owner),
      payload: { ids: [a.id, b.id], patch: { status: 'TODO' } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().updated).toBe(2)
    const list = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}`, headers: bearer(owner) })
    expect(list.json().items.every((t: { status: string }) => t.status === 'TODO')).toBe(true)

    // mixed orgs → 400
    const other = await tokenFor('bat-other')
    const foreign = await makeOrgProject(other, 'Batch Foreign')
    const f = await createTicket(other, { projectId: foreign.projectId, title: 'F' })
    const mixed = await app.inject({
      method: 'POST', url: '/api/tickets/batch', headers: bearer(owner),
      payload: { ids: [a.id, f.id], patch: { status: 'DONE' } },
    })
    expect(mixed.statusCode).toBe(400)

    // non-member → 403
    const denied = await app.inject({
      method: 'POST', url: '/api/tickets/batch', headers: bearer(other),
      payload: { ids: [a.id], patch: { status: 'DONE' } },
    })
    expect(denied.statusCode).toBe(403)
  })
})

describe('comment reactions (3.2 C3)', () => {
  it('adds (idempotent), lists, and removes reactions; rejects unknown emoji', async () => {
    const owner = await tokenFor('rx-owner')
    const { projectId } = await makeOrgProject(owner, 'Reaction Org')
    const tk = await createTicket(owner, { projectId, title: 'React to me' })
    const c = await app.inject({
      method: 'POST', url: `/api/tickets/${tk.id}/comments`, headers: bearer(owner), payload: { body: 'Nice!' },
    })
    const commentId = c.json().comment.id as string

    const add = await app.inject({
      method: 'POST', url: `/api/tickets/${tk.id}/comments/${commentId}/reactions`,
      headers: bearer(owner), payload: { emoji: '👍' },
    })
    expect(add.statusCode).toBe(201)
    // idempotent — same user+emoji twice stays one row
    await app.inject({
      method: 'POST', url: `/api/tickets/${tk.id}/comments/${commentId}/reactions`,
      headers: bearer(owner), payload: { emoji: '👍' },
    })

    let list = await app.inject({ method: 'GET', url: `/api/tickets/${tk.id}/comments`, headers: bearer(owner) })
    expect(list.json().comments[0].reactions).toHaveLength(1)
    expect(list.json().comments[0].reactions[0].emoji).toBe('👍')

    const bad = await app.inject({
      method: 'POST', url: `/api/tickets/${tk.id}/comments/${commentId}/reactions`,
      headers: bearer(owner), payload: { emoji: '💣' },
    })
    expect(bad.statusCode).toBe(400)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/tickets/${tk.id}/comments/${commentId}/reactions/${encodeURIComponent('👍')}`,
      headers: bearer(owner),
    })
    expect(del.statusCode).toBe(204)
    list = await app.inject({ method: 'GET', url: `/api/tickets/${tk.id}/comments`, headers: bearer(owner) })
    expect(list.json().comments[0].reactions).toHaveLength(0)
  })
})
