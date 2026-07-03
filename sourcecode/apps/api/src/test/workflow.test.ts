import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index'
import { signToken } from './auth-test-kit'
import { prisma } from '../db/client'

// The nudge pipeline is event-driven (Redis pub/sub) — same requirement as realtime.test.ts.
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

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

describe('W1 — ticket templates', () => {
  it('seeds defaults on org create; member reads, admin CRUDs, member cannot write', async () => {
    const owner = await tokenFor('tpl-owner')
    const { orgId, slug } = await makeOrgProject(owner, 'Template Org')

    // Seeded defaults
    const list = await app.inject({ method: 'GET', url: `/api/templates?orgId=${orgId}`, headers: bearer(owner) })
    expect(list.statusCode).toBe(200)
    const names = list.json().templates.map((t: { name: string }) => t.name)
    expect(names).toContain('Bug report')
    expect(names).toContain('Feature')

    // Create + update + delete
    const created = await app.inject({
      method: 'POST', url: '/api/templates', headers: bearer(owner),
      payload: { orgId, name: 'Chore', type: 'CHORE', priority: 'LOW', description: 'Routine task' },
    })
    expect(created.statusCode).toBe(201)
    const id = created.json().template.id
    const patched = await app.inject({ method: 'PATCH', url: `/api/templates/${id}`, headers: bearer(owner), payload: { priority: 'MEDIUM' } })
    expect(patched.json().template.priority).toBe('MEDIUM')

    // A plain member cannot write
    const member = await tokenFor('tpl-member')
    await app.inject({ method: 'GET', url: '/api/me', headers: bearer(member) })
    await app.inject({ method: 'POST', url: `/api/orgs/${slug}/members`, headers: bearer(owner), payload: { email: 'tpl-member@x.com', role: 'MEMBER' } })
    const denied = await app.inject({ method: 'POST', url: '/api/templates', headers: bearer(member), payload: { orgId, name: 'Nope' } })
    expect(denied.statusCode).toBe(403)

    const del = await app.inject({ method: 'DELETE', url: `/api/templates/${id}`, headers: bearer(owner) })
    expect(del.statusCode).toBe(204)
  })
})

describe('W2 — unblock nudge', () => {
  it('notifies the blocked ticket audience when its last blocker completes', async () => {
    const owner = await tokenFor('nudge-owner')
    const mate = await tokenFor('nudge-mate')
    const { slug, projectId } = await makeOrgProject(owner, 'Nudge Org')
    const mateMe = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(mate) })
    await app.inject({ method: 'POST', url: `/api/orgs/${slug}/members`, headers: bearer(owner), payload: { email: 'nudge-mate@x.com', role: 'MEMBER' } })
    const mateId = mateMe.json().user.id as string

    // blocked ticket assigned to mate; blocker owned by owner
    const blocked = await createTicket(owner, { projectId, title: 'Blocked one', assignedToId: mateId })
    const blocker = await createTicket(owner, { projectId, title: 'The blocker' })
    await app.inject({ method: 'POST', url: `/api/tickets/${blocked.id}/dependencies`, headers: bearer(owner), payload: { dependsOnId: blocker.id } })

    // owner closes the blocker → mate should get a TICKET_UNBLOCKED notification
    await app.inject({ method: 'PATCH', url: `/api/tickets/${blocker.id}/status`, headers: bearer(owner), payload: { status: 'DONE' } })
    // notification fan-out is event-driven but runs in-process synchronously in tests
    await new Promise((r) => setTimeout(r, 300))
    const rows = await prisma.notification.findMany({ where: { userId: mateId, type: 'TICKET_UNBLOCKED' } })
    expect(rows.length).toBe(1)
    expect(rows[0].ticketId).toBe(blocked.id)
    expect(rows[0].body).toContain('unblocked')
  })

  it('does not fire while other blockers remain open', async () => {
    const owner = await tokenFor('nudge-owner2')
    const { projectId } = await makeOrgProject(owner, 'Nudge Org 2')
    const blocked = await createTicket(owner, { projectId, title: 'Really stuck' })
    const b1 = await createTicket(owner, { projectId, title: 'Blocker 1' })
    const b2 = await createTicket(owner, { projectId, title: 'Blocker 2' })
    await app.inject({ method: 'POST', url: `/api/tickets/${blocked.id}/dependencies`, headers: bearer(owner), payload: { dependsOnId: b1.id } })
    await app.inject({ method: 'POST', url: `/api/tickets/${blocked.id}/dependencies`, headers: bearer(owner), payload: { dependsOnId: b2.id } })

    await app.inject({ method: 'PATCH', url: `/api/tickets/${b1.id}/status`, headers: bearer(owner), payload: { status: 'DONE' } })
    await new Promise((r) => setTimeout(r, 300))
    const rows = await prisma.notification.findMany({ where: { type: 'TICKET_UNBLOCKED', ticketId: blocked.id } })
    expect(rows.length).toBe(0)
  })
})

describe('W3 — automation toggles', () => {
  it('autoTodoOnAssign moves a BACKLOG ticket to TODO when enabled (and only then)', async () => {
    const owner = await tokenFor('auto-owner')
    const { slug, projectId } = await makeOrgProject(owner, 'Auto Org')
    const mate = await tokenFor('auto-mate')
    const mateMe = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(mate) })
    await app.inject({ method: 'POST', url: `/api/orgs/${slug}/members`, headers: bearer(owner), payload: { email: 'auto-mate@x.com', role: 'MEMBER' } })
    const mateId = mateMe.json().user.id as string

    // Off by default: assigning leaves BACKLOG alone
    const t1 = await createTicket(owner, { projectId, title: 'Stays backlog' })
    await app.inject({ method: 'PATCH', url: `/api/tickets/${t1.id}`, headers: bearer(owner), payload: { assignedToId: mateId } })
    let got = await app.inject({ method: 'GET', url: `/api/tickets/${t1.id}`, headers: bearer(owner) })
    expect(got.json().ticket.status).toBe('BACKLOG')

    // Enable the toggle (merged PATCH) and assign another ticket
    const up = await app.inject({
      method: 'PATCH', url: `/api/projects/${projectId}`, headers: bearer(owner),
      payload: { automation: { autoTodoOnAssign: true } },
    })
    expect(up.statusCode).toBe(200)
    expect(up.json().project.automation.autoTodoOnAssign).toBe(true)

    const t2 = await createTicket(owner, { projectId, title: 'Moves to todo' })
    await app.inject({ method: 'PATCH', url: `/api/tickets/${t2.id}`, headers: bearer(owner), payload: { assignedToId: mateId } })
    got = await app.inject({ method: 'GET', url: `/api/tickets/${t2.id}`, headers: bearer(owner) })
    expect(got.json().ticket.status).toBe('TODO')
  })

  it('unblockNudge can be switched off per project', async () => {
    const owner = await tokenFor('auto-owner2')
    const { projectId } = await makeOrgProject(owner, 'Auto Org 2')
    await app.inject({
      method: 'PATCH', url: `/api/projects/${projectId}`, headers: bearer(owner),
      payload: { automation: { unblockNudge: false } },
    })
    const blocked = await createTicket(owner, { projectId, title: 'Quiet block' })
    const blocker = await createTicket(owner, { projectId, title: 'Quiet blocker' })
    await app.inject({ method: 'POST', url: `/api/tickets/${blocked.id}/dependencies`, headers: bearer(owner), payload: { dependsOnId: blocker.id } })
    await app.inject({ method: 'PATCH', url: `/api/tickets/${blocker.id}/status`, headers: bearer(owner), payload: { status: 'DONE' } })
    await new Promise((r) => setTimeout(r, 300))
    const rows = await prisma.notification.findMany({ where: { type: 'TICKET_UNBLOCKED', ticketId: blocked.id } })
    expect(rows.length).toBe(0)
  })
})

describe('W4 — CSV import endpoint', () => {
  it('creates tickets from rows and rejects non-members', async () => {
    const owner = await tokenFor('csv-owner')
    const { projectId } = await makeOrgProject(owner, 'CSV Org')

    const res = await app.inject({
      method: 'POST', url: '/api/tickets/import', headers: bearer(owner),
      payload: {
        projectId,
        tickets: [
          { title: 'Imported A', type: 'BUG', priority: 'HIGH', status: 'TODO' },
          { title: 'Imported B', description: 'From Jira', storyPoints: 3 },
        ],
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().created).toBe(2)

    const list = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}`, headers: bearer(owner) })
    const titles = list.json().items.map((tk: { title: string }) => tk.title).sort()
    expect(titles).toEqual(['Imported A', 'Imported B'])
    const a = list.json().items.find((tk: { title: string }) => tk.title === 'Imported A')
    expect(a.status).toBe('TODO')
    expect(a.priority).toBe('HIGH')

    const stranger = await tokenFor('csv-stranger')
    const denied = await app.inject({
      method: 'POST', url: '/api/tickets/import', headers: bearer(stranger),
      payload: { projectId, tickets: [{ title: 'Nope' }] },
    })
    expect(denied.statusCode).toBe(403)
  })
})
