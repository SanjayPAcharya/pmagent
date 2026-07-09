import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index'
import { signToken } from './auth-test-kit'

// Phase 3.8 A1 — hermetic AI tests. `fetch` is always stubbed; no test ever talks
// to a live model. AI is toggled by OLLAMA_BASE_URL, so we flip that env per case.

let app: FastifyInstance
beforeAll(async () => {
  app = await buildServer()
})
afterAll(async () => {
  await app.close()
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.OLLAMA_BASE_URL
})

const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const tokenFor = (sub: string) => signToken({ sub, email: `${sub}@x.com`, name: sub })

/** Stub fetch: /api/tags returns the tag list; /api/chat returns queued content strings. */
function stubOllama(opts: { tags?: unknown; chat?: string[]; tagsStatus?: number }) {
  const chatQueue = [...(opts.chat ?? [])]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify(opts.tags ?? { models: [{ name: 'qwen2.5:7b' }] }), {
          status: opts.tagsStatus ?? 200,
        })
      }
      if (url.endsWith('/api/chat')) {
        const content = chatQueue.shift() ?? ''
        return new Response(JSON.stringify({ message: { content } }), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }),
  )
}

describe('AI health (3.8 A1)', () => {
  it('reports disabled when OLLAMA_BASE_URL is unset', async () => {
    const token = await tokenFor('ai-health-off')
    const res = await app.inject({ method: 'GET', url: '/api/ai/health', headers: bearer(token) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: false, reachable: false, modelReady: false, provider: null })
  })

  it('reports enabled + reachable + modelReady when the model is present', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama:11434'
    stubOllama({ tags: { models: [{ name: 'qwen2.5:7b' }] } })
    const token = await tokenFor('ai-health-on')
    const res = await app.inject({ method: 'GET', url: '/api/ai/health', headers: bearer(token) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ enabled: true, reachable: true, modelReady: true, provider: 'ollama' })
  })

  it('reports reachable but model-not-ready when the model is absent', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama:11434'
    stubOllama({ tags: { models: [{ name: 'llama3:8b' }] } })
    const token = await tokenFor('ai-health-nomodel')
    const res = await app.inject({ method: 'GET', url: '/api/ai/health', headers: bearer(token) })
    expect(res.json()).toMatchObject({ enabled: true, reachable: true, modelReady: false })
  })

  it('reports unreachable when the provider fetch throws', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama:11434'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const token = await tokenFor('ai-health-down')
    const res = await app.inject({ method: 'GET', url: '/api/ai/health', headers: bearer(token) })
    expect(res.json()).toMatchObject({ enabled: true, reachable: false, modelReady: false })
  })

  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ai/health' })
    expect(res.statusCode).toBe(401)
  })
})
