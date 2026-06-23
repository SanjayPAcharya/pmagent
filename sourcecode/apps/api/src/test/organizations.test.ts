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

async function tokenFor(sub: string) {
  return signToken({ sub, email: `${sub}@x.com`, name: sub })
}

describe('organizations', () => {
  it('creates an org with the creator as OWNER and lists it', async () => {
    const t = await tokenFor('owner1')
    const created = await app.inject({
      method: 'POST',
      url: '/api/orgs',
      headers: bearer(t),
      payload: { name: 'Acme Inc' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().org.slug).toBe('acme-inc')

    const list = await app.inject({ method: 'GET', url: '/api/orgs', headers: bearer(t) })
    const orgs = list.json().organizations
    expect(orgs).toHaveLength(1)
    expect(orgs[0].role).toBe('OWNER')
  })

  it('rejects an empty body with 400', async () => {
    const t = await tokenFor('owner2')
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs',
      headers: bearer(t),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 403 for a non-member', async () => {
    const owner = await tokenFor('owner3')
    await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: 'Private Co' } })

    const outsider = await tokenFor('outsider')
    const res = await app.inject({ method: 'GET', url: '/api/orgs/private-co', headers: bearer(outsider) })
    expect(res.statusCode).toBe(403)
  })

  it('blocks removing the last owner', async () => {
    const t = await tokenFor('owner4')
    await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(t), payload: { name: 'Solo Org' } })
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(t) })
    const userId = me.json().user.id

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/orgs/solo-org/members/${userId}`,
      headers: bearer(t),
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('LAST_OWNER')
  })
})
