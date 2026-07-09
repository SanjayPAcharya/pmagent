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

async function provision(token: string): Promise<string> {
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(token) })
  return me.json().user.id as string
}
async function makeOrg(token: string, name: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(token), payload: { name } })
  return res.json().org.id as string
}
async function makeProject(token: string, orgId: string, name: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(token), payload: { orgId, name } })
  return res.json().project.id as string
}
async function makeTicket(token: string, projectId: string, title: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/tickets', headers: bearer(token), payload: { projectId, title } })
  return res.json().ticket.id as string
}

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

describe('AI draft-ticket (3.8 A2)', () => {
  it('returns a schema-valid draft on the happy path (never creates a ticket)', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama:11434'
    const owner = await tokenFor('ai-draft-owner')
    await provision(owner)
    const orgId = await makeOrg(owner, 'AI Draft Co')
    const projectId = await makeProject(owner, orgId, 'Draft Proj')

    stubOllama({
      chat: [
        JSON.stringify({
          title: 'Add password reset',
          description: 'Users need a way to reset a forgotten password via email.',
          acceptanceCriteria: ['Reset email is sent', 'Link expires in 1h'],
          priority: 'HIGH',
        }),
      ],
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(owner),
      payload: { projectId, notes: 'users keep forgetting passwords, need reset flow' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().draft).toMatchObject({ title: 'Add password reset', priority: 'HIGH' })
    // no ticket persisted
    const list = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}`, headers: bearer(owner) })
    expect(list.json().items).toHaveLength(0)
  })

  it('re-prompts once on malformed output then succeeds', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama:11434'
    const owner = await tokenFor('ai-draft-retry')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Retry Co')
    const projectId = await makeProject(owner, orgId, 'Retry Proj')

    stubOllama({
      chat: [
        'not json at all',
        JSON.stringify({ title: 'T', description: 'D', acceptanceCriteria: ['a'], priority: 'LOW' }),
      ],
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(owner),
      payload: { projectId, notes: 'something' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().draft.title).toBe('T')
  })

  it('returns 502 AI_BAD_OUTPUT when malformed twice', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama:11434'
    const owner = await tokenFor('ai-draft-bad')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Bad Co')
    const projectId = await makeProject(owner, orgId, 'Bad Proj')

    stubOllama({ chat: ['nope', 'still nope'] })
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(owner),
      payload: { projectId, notes: 'something' },
    })
    expect(res.statusCode).toBe(502)
    expect(res.json().code).toBe('AI_BAD_OUTPUT')
  })

  it('returns 503 AI_UNAVAILABLE when AI is disabled', async () => {
    const owner = await tokenFor('ai-draft-off')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Off Co')
    const projectId = await makeProject(owner, orgId, 'Off Proj')
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(owner),
      payload: { projectId, notes: 'something' },
    })
    expect(res.statusCode).toBe(503)
    expect(res.json().code).toBe('AI_UNAVAILABLE')
  })

  it('rejects notes over 4000 chars with 400', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama:11434'
    const owner = await tokenFor('ai-draft-long')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Long Co')
    const projectId = await makeProject(owner, orgId, 'Long Proj')
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(owner),
      payload: { projectId, notes: 'x'.repeat(4001) },
    })
    expect(res.statusCode).toBe(400)
  })

  it('forbids a non-member with 403', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama:11434'
    const owner = await tokenFor('ai-draft-owner2')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Member Co')
    const projectId = await makeProject(owner, orgId, 'Member Proj')

    const outsider = await tokenFor('ai-draft-outsider')
    await provision(outsider)
    stubOllama({ chat: ['{}'] })
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(outsider),
      payload: { projectId, notes: 'something' },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('AI expand-ticket (3.8 A3)', () => {
  it('returns an expanded draft for an existing ticket', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama:11434'
    const owner = await tokenFor('ai-expand-owner')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Expand Co')
    const projectId = await makeProject(owner, orgId, 'Expand Proj')
    const ticketId = await makeTicket(owner, projectId, 'Rate limit the API')

    stubOllama({
      chat: [
        JSON.stringify({
          description: 'Add per-route rate limiting to protect abuse-prone endpoints.',
          acceptanceCriteria: ['Limits are enforced', 'Exceeding returns 429'],
          goal: 'Prevent endpoint abuse.',
          constraints: 'Must use the existing Redis store.',
        }),
      ],
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/expand-ticket',
      headers: bearer(owner),
      payload: { ticketId, prompt: 'focus on Redis-backed limits' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().draft).toMatchObject({ goal: 'Prevent endpoint abuse.' })
  })

  it('returns 404 for an unknown ticket', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama:11434'
    const owner = await tokenFor('ai-expand-404')
    await provision(owner)
    stubOllama({ chat: ['{}'] })
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/expand-ticket',
      headers: bearer(owner),
      payload: { ticketId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(404)
  })
})
