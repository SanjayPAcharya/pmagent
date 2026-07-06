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
function patchTicket(token: string, id: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url: `/api/tickets/${id}`, headers: bearer(token), payload })
}
async function makeSprint(token: string, projectId: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/sprints', headers: bearer(token), payload: { projectId, name: 'S1' } })
  return res.json().sprint.id as string
}
function activityTypes(token: string, ticketId: string) {
  return app
    .inject({ method: 'GET', url: `/api/tickets/${ticketId}/activity`, headers: bearer(token) })
    .then((r) => (r.json().activity as { type: string }[]).map((a) => a.type))
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

  it('filters accept comma-separated (multi-select) values', async () => {
    const owner = await tokenFor('t-multi')
    const { id: orgId } = await makeOrg(owner, 'Multi Co')
    const { id: projectId } = await makeProject(owner, orgId, 'Board')
    await createTicket(owner, { projectId, title: 'Urgent one', priority: 'URGENT' })
    await createTicket(owner, { projectId, title: 'High one', priority: 'HIGH' })
    await createTicket(owner, { projectId, title: 'Low one', priority: 'LOW' })

    const both = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}&priority=URGENT,HIGH`, headers: bearer(owner) })
    const titles = (both.json().items as { title: string }[]).map((t) => t.title).sort()
    expect(titles).toEqual(['High one', 'Urgent one'])

    // A single value still works (1-element list).
    const one = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}&priority=LOW`, headers: bearer(owner) })
    expect(one.json().items).toHaveLength(1)
    expect(one.json().items[0].title).toBe('Low one')
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

describe('tickets — workstream & dates (3.7 R1)', () => {
  it('defaults new tickets to the SPRINT workstream', async () => {
    const owner = await tokenFor('ws-owner1')
    const { id: orgId } = await makeOrg(owner, 'WS Defaults')
    const { id: projectId } = await makeProject(owner, orgId, 'App')
    const res = await createTicket(owner, { projectId, title: 'Default' })
    expect(res.statusCode).toBe(201)
    expect(res.json().ticket.workstream).toBe('SPRINT')
  })

  it('rejects creating an ADHOC ticket with a sprint (ADHOC_SPRINT_CONFLICT)', async () => {
    const owner = await tokenFor('ws-owner2')
    const { id: orgId } = await makeOrg(owner, 'WS Conflict')
    const { id: projectId } = await makeProject(owner, orgId, 'App')
    const sprintId = await makeSprint(owner, projectId)
    const res = await createTicket(owner, { projectId, title: 'Bad', workstream: 'ADHOC', sprintId })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ADHOC_SPRINT_CONFLICT')
  })

  it('switching a sprinted ticket to ADHOC clears the sprint and logs WORKSTREAM_CHANGED', async () => {
    const owner = await tokenFor('ws-owner3')
    const { id: orgId } = await makeOrg(owner, 'WS ToAdhoc')
    const { id: projectId } = await makeProject(owner, orgId, 'App')
    const sprintId = await makeSprint(owner, projectId)
    const created = await createTicket(owner, { projectId, title: 'Sprinted', sprintId })
    const id = created.json().ticket.id
    expect(created.json().ticket.sprintId).toBe(sprintId)

    const patched = await patchTicket(owner, id, { workstream: 'ADHOC' })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().ticket.sprintId).toBeNull()
    expect(patched.json().ticket.workstream).toBe('ADHOC')
    const types = await activityTypes(owner, id)
    expect(types).toContain('WORKSTREAM_CHANGED')
    expect(types).toContain('SPRINT_CHANGED')
  })

  it('assigning a sprint to an ADHOC ticket forces the workstream back to SPRINT', async () => {
    const owner = await tokenFor('ws-owner4')
    const { id: orgId } = await makeOrg(owner, 'WS ToSprint')
    const { id: projectId } = await makeProject(owner, orgId, 'App')
    const sprintId = await makeSprint(owner, projectId)
    const created = await createTicket(owner, { projectId, title: 'Adhoc', workstream: 'ADHOC' })
    const id = created.json().ticket.id

    const patched = await patchTicket(owner, id, { sprintId })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().ticket.sprintId).toBe(sprintId)
    expect(patched.json().ticket.workstream).toBe('SPRINT')
    expect(await activityTypes(owner, id)).toContain('WORKSTREAM_CHANGED')
  })

  it('rejects a patch with startDate after dueDate (DATE_RANGE)', async () => {
    const owner = await tokenFor('ws-owner5')
    const { id: orgId } = await makeOrg(owner, 'WS Dates')
    const { id: projectId } = await makeProject(owner, orgId, 'App')
    const created = await createTicket(owner, { projectId, title: 'Dated' })
    const id = created.json().ticket.id
    const res = await patchTicket(owner, id, { startDate: '2026-08-10T00:00:00.000Z', dueDate: '2026-08-01T00:00:00.000Z' })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('DATE_RANGE')
  })

  it('filters the list by workstream', async () => {
    const owner = await tokenFor('ws-owner6')
    const { id: orgId } = await makeOrg(owner, 'WS Filter')
    const { id: projectId } = await makeProject(owner, orgId, 'App')
    await createTicket(owner, { projectId, title: 'Sprint work' })
    await createTicket(owner, { projectId, title: 'Ops work', workstream: 'ADHOC' })

    const res = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}&workstream=ADHOC`, headers: bearer(owner) })
    const items = res.json().items as { title: string; workstream: string }[]
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Ops work')
    expect(items[0].workstream).toBe('ADHOC')
  })
})

describe('workstream — CSV import + automation invariant (3.7 R11)', () => {
  it('CSV import honors an ADHOC row — lands sprint-less with its start date', async () => {
    const owner = await tokenFor('ws-imp')
    const { id: orgId } = await makeOrg(owner, 'WS Import')
    const { id: projectId } = await makeProject(owner, orgId, 'App')

    const res = await app.inject({
      method: 'POST',
      url: '/api/tickets/import',
      headers: bearer(owner),
      payload: { projectId, tickets: [{ title: 'Ops work', workstream: 'ADHOC', startDate: '2026-09-01T00:00:00.000Z' }] },
    })
    expect(res.statusCode).toBe(201)

    const list = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}&workstream=ADHOC`, headers: bearer(owner) })
    const items = list.json().items as { title: string; workstream: string; sprintId: string | null; startDate: string | null }[]
    expect(items).toHaveLength(1)
    expect(items[0].workstream).toBe('ADHOC')
    expect(items[0].sprintId).toBeNull()
    expect(items[0].startDate).toBe('2026-09-01T00:00:00.000Z')
  })

  it('autoTodoOnAssign: assigning an ADHOC backlog ticket moves it to TODO but keeps it ad-hoc + sprint-less', async () => {
    const owner = await tokenFor('ws-auto')
    const { id: orgId, slug } = await makeOrg(owner, 'WS Auto')
    const { id: projectId } = await makeProject(owner, orgId, 'App')
    await app.inject({ method: 'PATCH', url: `/api/projects/${projectId}`, headers: bearer(owner), payload: { automation: { autoTodoOnAssign: true } } })

    const dev = await tokenFor('ws-auto-dev')
    const devId = await provision(dev)
    await addMember(owner, slug, 'ws-auto-dev@x.com')

    const created = await createTicket(owner, { projectId, title: 'Ops', status: 'BACKLOG', workstream: 'ADHOC' })
    const id = created.json().ticket.id
    const patched = await patchTicket(owner, id, { assignedToId: devId })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().ticket.status).toBe('TODO')
    expect(patched.json().ticket.sprintId).toBeNull()
    expect(patched.json().ticket.workstream).toBe('ADHOC')
  })

  it('list response carries subtask counts on parents (done/total; CANCELLED excluded; absent when childless)', async () => {
    const owner = await tokenFor('sub-owner')
    const { id: orgId } = await makeOrg(owner, 'Subtasks Co')
    const { id: projectId } = await makeProject(owner, orgId, 'App')

    const parent = (await createTicket(owner, { projectId, title: 'Parent' })).json().ticket
    const childless = (await createTicket(owner, { projectId, title: 'Childless' })).json().ticket
    const c1 = (await createTicket(owner, { projectId, title: 'Sub A', parentId: parent.id })).json().ticket
    await createTicket(owner, { projectId, title: 'Sub B', parentId: parent.id })
    const c3 = (await createTicket(owner, { projectId, title: 'Sub C', parentId: parent.id })).json().ticket
    // one subtask done, one cancelled → total counts 2 (A + B), done 1
    await app.inject({ method: 'PATCH', url: `/api/tickets/${c1.id}/status`, headers: bearer(owner), payload: { status: 'DONE' } })
    await app.inject({ method: 'PATCH', url: `/api/tickets/${c3.id}/status`, headers: bearer(owner), payload: { status: 'CANCELLED' } })

    const list = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}`, headers: bearer(owner) })
    const items = list.json().items as Array<{ id: string; subtasks?: { done: number; total: number } }>
    const parentItem = items.find((t) => t.id === parent.id)!
    const childlessItem = items.find((t) => t.id === childless.id)!
    expect(parentItem.subtasks).toEqual({ done: 1, total: 2 })
    expect(childlessItem.subtasks).toBeUndefined()
  })
})
