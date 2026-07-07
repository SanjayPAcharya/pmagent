import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index'
import { signToken } from './auth-test-kit'

// Archive & restore (Phase 3.7.3). Kept in its own file so the shared-DB
// beforeEach truncation stays cleanly scoped.
let app: FastifyInstance
beforeAll(async () => {
  app = await buildServer()
})
afterAll(async () => {
  await app.close()
})

const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const tokenFor = (sub: string) => signToken({ sub, email: `${sub}@x.com`, name: sub })

async function makeOrg(token: string, name: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(token), payload: { name } })
  return res.json().org.id as string
}
async function makeProject(token: string, orgId: string, name: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(token), payload: { orgId, name } })
  return res.json().project.id as string
}
function createTicket(token: string, projectId: string, title: string) {
  return app.inject({ method: 'POST', url: '/api/tickets', headers: bearer(token), payload: { projectId, title } })
}
const listTickets = (token: string, qs: string) =>
  app.inject({ method: 'GET', url: `/api/tickets?${qs}`, headers: bearer(token) }).then((r) => r.json().items as { id: string }[])

describe('archived tickets', () => {
  it('archivedOnly=true returns only archived tickets; default hides them; restore brings them back', async () => {
    const owner = await tokenFor('arch-owner')
    const orgId = await makeOrg(owner, 'Attic Co')
    const projectId = await makeProject(owner, orgId, 'Boxes')
    const liveId = (await createTicket(owner, projectId, 'Still here')).json().ticket.id
    const goneId = (await createTicket(owner, projectId, 'Archived one')).json().ticket.id

    // DELETE soft-deletes (sets archivedAt).
    await app.inject({ method: 'DELETE', url: `/api/tickets/${goneId}`, headers: bearer(owner) })

    expect((await listTickets(owner, `projectId=${projectId}`)).map((t) => t.id)).toEqual([liveId])
    const archived = await listTickets(owner, `projectId=${projectId}&archivedOnly=true`)
    expect(archived.map((t) => t.id)).toEqual([goneId])

    // Restore via the batch endpoint clears archivedAt.
    await app.inject({ method: 'POST', url: '/api/tickets/batch', headers: bearer(owner), payload: { ids: [goneId], patch: { archived: false } } })
    expect(await listTickets(owner, `projectId=${projectId}&archivedOnly=true`)).toHaveLength(0)
    expect((await listTickets(owner, `projectId=${projectId}`)).map((t) => t.id).sort()).toEqual([liveId, goneId].sort())
  })
})
