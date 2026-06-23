import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index'
import { prisma } from '../db/client'
import { signToken } from './auth-test-kit'

let app: FastifyInstance
beforeAll(async () => {
  app = await buildServer()
})
afterAll(async () => {
  await app.close()
})

const bearer = (t: string) => ({ authorization: `Bearer ${t}` })

describe('auth middleware (/api/me)', () => {
  it('rejects with no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects a tampered token', async () => {
    const t = await signToken({ sub: 's1', email: 'a@x.com', name: 'A' })
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(t + 'x') })
    expect(res.statusCode).toBe(401)
  })

  it('rejects the wrong audience', async () => {
    const t = await signToken({ sub: 's1', aud: 'someone-else' })
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(t) })
    expect(res.statusCode).toBe(401)
  })

  it('rejects the wrong issuer', async () => {
    const t = await signToken({ sub: 's1', iss: 'http://evil.example/realms/x' })
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(t) })
    expect(res.statusCode).toBe(401)
  })

  it('rejects an expired token', async () => {
    const t = await signToken({ sub: 's1', expSec: -10 })
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(t) })
    expect(res.statusCode).toBe(401)
  })

  it('accepts a valid token, JIT-provisions a user, and is idempotent', async () => {
    const t = await signToken({ sub: 'sub-123', email: 'jit@x.com', name: 'JIT User' })

    const r1 = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(t) })
    expect(r1.statusCode).toBe(200)
    expect(r1.json().user.email).toBe('jit@x.com')

    const r2 = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(t) })
    expect(r2.json().user.id).toBe(r1.json().user.id)
    expect(await prisma.user.count()).toBe(1)
  })
})
