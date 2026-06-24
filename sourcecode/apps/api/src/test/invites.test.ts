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

async function makeOrg(token: string, name: string) {
  const res = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(token), payload: { name } })
  return res.json().org.slug as string
}
async function provision(token: string) {
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(token) })
  return me.json().user.id as string
}

describe('org invites', () => {
  it('accept adds the caller as a member with the invite role (single-use)', async () => {
    const owner = await tokenFor('i-owner')
    const slug = await makeOrg(owner, 'Invite Co')

    const inv = await app.inject({ method: 'POST', url: `/api/orgs/${slug}/invites`, headers: bearer(owner), payload: { role: 'ADMIN' } })
    expect(inv.statusCode).toBe(201)
    const token = inv.json().invite.token

    const joiner = await tokenFor('i-joiner')
    await provision(joiner)
    const accept = await app.inject({ method: 'POST', url: `/api/invites/${token}/accept`, headers: bearer(joiner) })
    expect(accept.statusCode).toBe(200)
    expect(accept.json().role).toBe('ADMIN')

    // membership now visible
    const members = await app.inject({ method: 'GET', url: `/api/orgs/${slug}/members`, headers: bearer(owner) })
    expect(members.json().members.map((m: { email: string }) => m.email)).toContain('i-joiner@x.com')

    // single-use: second accept fails
    const again = await app.inject({ method: 'POST', url: `/api/invites/${token}/accept`, headers: bearer(joiner) })
    expect(again.statusCode).toBe(400)
    expect(again.json().code).toBe('INVITE_USED')
  })

  it('rejects an expired invite with 400', async () => {
    const owner = await tokenFor('i-owner2')
    const slug = await makeOrg(owner, 'Expiry Co')
    const inv = await app.inject({ method: 'POST', url: `/api/orgs/${slug}/invites`, headers: bearer(owner), payload: {} })
    const token = inv.json().invite.token
    // force-expire
    await prisma.orgInvite.update({ where: { token }, data: { expiresAt: new Date(Date.now() - 1000) } })

    const joiner = await tokenFor('i-joiner2')
    await provision(joiner)
    const accept = await app.inject({ method: 'POST', url: `/api/invites/${token}/accept`, headers: bearer(joiner) })
    expect(accept.statusCode).toBe(400)
    expect(accept.json().code).toBe('INVITE_EXPIRED')
  })

  it('caps the invite role at the schema (no OWNER via invite)', async () => {
    const owner = await tokenFor('i-owner3')
    const slug = await makeOrg(owner, 'Cap Co')
    const res = await app.inject({ method: 'POST', url: `/api/orgs/${slug}/invites`, headers: bearer(owner), payload: { role: 'OWNER' } })
    expect(res.statusCode).toBe(400) // zod enum rejects OWNER
  })
})
