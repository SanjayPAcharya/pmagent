import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index'

// Rate-limit bugfix (2026-07-13) — hermetic proof of the three behaviors:
//  1. the limiter keys on the REAL client (trustProxy honors X-Forwarded-For),
//     so two clients get separate buckets instead of the pre-fix shared one;
//  2. the cap comes from RATE_LIMIT_MAX (env-tunable);
//  3. /health and /ready are exempt (uptime monitors / container healthchecks).
// Uses its own server with a tiny cap so the test doesn't hammer 400 requests;
// NODE_ENV=test keeps the limiter in-memory (per-app), so this file is isolated.

let app: FastifyInstance
beforeAll(async () => {
  process.env.RATE_LIMIT_MAX = '2'
  app = await buildServer()
})
afterAll(async () => {
  delete process.env.RATE_LIMIT_MAX
  await app.close()
})

const hit = (url: string, ip: string) =>
  app.inject({ method: 'GET', url, headers: { 'x-forwarded-for': ip } })

describe('global rate limit (per real client, env-tunable, health-exempt)', () => {
  it('separate forwarded IPs get separate buckets (trustProxy fix)', async () => {
    // Client A exhausts its RATE_LIMIT_MAX=2 budget → third request 429s.
    expect((await hit('/api/me', '203.0.113.10')).statusCode).not.toBe(429)
    expect((await hit('/api/me', '203.0.113.10')).statusCode).not.toBe(429)
    expect((await hit('/api/me', '203.0.113.10')).statusCode).toBe(429)
    // Client B (different X-Forwarded-For) is NOT collateral damage — before the
    // trustProxy fix every client shared one bucket and this would 429 too.
    expect((await hit('/api/me', '203.0.113.99')).statusCode).not.toBe(429)
  })

  it('/health and /ready are exempt even after the budget is exhausted', async () => {
    const ip = '203.0.113.50'
    await hit('/api/me', ip)
    await hit('/api/me', ip)
    expect((await hit('/api/me', ip)).statusCode).toBe(429)
    // Same client, same minute — health endpoints still answer.
    expect((await hit('/health', ip)).statusCode).toBe(200)
    expect((await hit('/ready', ip)).statusCode).toBe(200)
    expect((await hit('/health', ip)).statusCode).toBe(200)
  })
})
