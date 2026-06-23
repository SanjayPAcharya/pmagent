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

async function makeOrg(token: string, name: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(token), payload: { name } })
  return res.json().org.id as string
}

describe('projects', () => {
  it('creates a project (admin+), lists it; non-member gets 403', async () => {
    const owner = await tokenFor('powner')
    const orgId = await makeOrg(owner, 'Builders')

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: bearer(owner),
      payload: { orgId, name: 'Web App' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().project.slug).toBe('web-app')

    const list = await app.inject({
      method: 'GET',
      url: `/api/projects?orgId=${orgId}`,
      headers: bearer(owner),
    })
    expect(list.json().projects.map((p: { slug: string }) => p.slug)).toEqual(['web-app'])

    const outsider = await tokenFor('poutsider')
    const denied = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: bearer(outsider),
      payload: { orgId, name: 'Sneaky' },
    })
    expect(denied.statusCode).toBe(403)
  })

  it('rejects a missing orgId with 400', async () => {
    const t = await tokenFor('pvalid')
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: bearer(t),
      payload: { name: 'No Org' },
    })
    expect(res.statusCode).toBe(400)
  })
})
