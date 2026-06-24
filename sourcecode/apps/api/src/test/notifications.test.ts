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
async function provision(token: string) {
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(token) })
  return me.json().user.id as string
}
const seedNotif = (userId: string, body: string) =>
  prisma.notification.create({ data: { userId, type: 'TICKET_STATUS_CHANGED', channel: 'IN_APP', body } })

describe('notifications (caller-scoped, IDOR-safe)', () => {
  it('list, unread-count, and read only ever touch the caller’s own rows', async () => {
    const aTok = await tokenFor('n-alice')
    const bTok = await tokenFor('n-bob')
    const alice = await provision(aTok)
    const bob = await provision(bTok)

    const aNotif = await seedNotif(alice, 'for alice')
    await seedNotif(alice, 'for alice 2')
    const bNotif = await seedNotif(bob, 'for bob')

    // list is scoped
    const aList = await app.inject({ method: 'GET', url: '/api/notifications', headers: bearer(aTok) })
    expect(aList.json().items).toHaveLength(2)
    const bList = await app.inject({ method: 'GET', url: '/api/notifications', headers: bearer(bTok) })
    expect(bList.json().items).toHaveLength(1)

    // unread-count is scoped
    expect((await app.inject({ method: 'GET', url: '/api/notifications/unread-count', headers: bearer(aTok) })).json().count).toBe(2)

    // IDOR: bob cannot mark alice's notification read → 404, and it stays unread
    const idor = await app.inject({ method: 'POST', url: `/api/notifications/${aNotif.id}/read`, headers: bearer(bTok) })
    expect(idor.statusCode).toBe(404)
    expect((await prisma.notification.findUnique({ where: { id: aNotif.id } }))?.readAt).toBeNull()

    // alice marks her own read → ok
    const ok = await app.inject({ method: 'POST', url: `/api/notifications/${aNotif.id}/read`, headers: bearer(aTok) })
    expect(ok.statusCode).toBe(200)

    // read-all only affects the caller
    await app.inject({ method: 'POST', url: '/api/notifications/read-all', headers: bearer(aTok) })
    expect((await app.inject({ method: 'GET', url: '/api/notifications/unread-count', headers: bearer(aTok) })).json().count).toBe(0)
    expect((await prisma.notification.findUnique({ where: { id: bNotif.id } }))?.readAt).toBeNull()
  })
})
