import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from './index'

describe('GET /health', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await buildServer()
  })
  afterAll(async () => {
    await app.close()
  })

  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok', service: 'api' })
  })

  // 3.7.4 A1 — helmet's OWASP baseline headers.
  it('sets security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBeDefined()
  })
})
