import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Phase 3.8 D2 — hermetic AI tests. The AWS SDK is mocked at module level; no
// test ever talks to AWS (CI has no credentials). AI is toggled by AI_PROVIDER,
// so we flip that env per case.
const { runtimeSend, controlSend } = vi.hoisted(() => ({
  runtimeSend: vi.fn(),
  controlSend: vi.fn(),
}))

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  class BedrockRuntimeClient {
    send = runtimeSend
  }
  class ConverseCommand {
    constructor(readonly input: unknown) {}
  }
  return { BedrockRuntimeClient, ConverseCommand }
})

vi.mock('@aws-sdk/client-bedrock', () => {
  class BedrockClient {
    send = controlSend
  }
  class GetInferenceProfileCommand {
    constructor(readonly input: unknown) {}
  }
  return { BedrockClient, GetInferenceProfileCommand }
})

import { buildServer } from '../index'
import { signToken } from './auth-test-kit'

let app: FastifyInstance
beforeAll(async () => {
  app = await buildServer()
})
afterAll(async () => {
  await app.close()
})
afterEach(() => {
  runtimeSend.mockReset()
  controlSend.mockReset()
  delete process.env.AI_PROVIDER
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

/** Build a Converse response whose forced tool call carries `input` as its arguments. */
const toolResponse = (input: unknown) => ({
  output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't1', name: 'emit_result', input } }] } },
})

const awsError = (name: string) => Object.assign(new Error(name), { name })

describe('AI health (3.8 A1/D2)', () => {
  it('reports disabled when AI_PROVIDER is unset', async () => {
    const token = await tokenFor('ai-health-off')
    const res = await app.inject({ method: 'GET', url: '/api/ai/health', headers: bearer(token) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: false, reachable: false, modelReady: false, provider: null })
  })

  it('reports enabled + reachable + modelReady when the inference profile resolves', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    controlSend.mockResolvedValue({ inferenceProfileArn: 'arn:aws:bedrock:...' })
    const token = await tokenFor('ai-health-on')
    const res = await app.inject({ method: 'GET', url: '/api/ai/health', headers: bearer(token) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ enabled: true, reachable: true, modelReady: true, provider: 'bedrock' })
  })

  it('reports reachable but model-not-ready when the profile is missing or access is denied', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    controlSend.mockRejectedValue(awsError('ResourceNotFoundException'))
    const token = await tokenFor('ai-health-nomodel')
    const res = await app.inject({ method: 'GET', url: '/api/ai/health', headers: bearer(token) })
    expect(res.json()).toMatchObject({ enabled: true, reachable: true, modelReady: false })
  })

  it('reports unreachable when AWS cannot be reached (no credentials / network)', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    controlSend.mockRejectedValue(awsError('CredentialsProviderError'))
    const token = await tokenFor('ai-health-down')
    const res = await app.inject({ method: 'GET', url: '/api/ai/health', headers: bearer(token) })
    expect(res.json()).toMatchObject({ enabled: true, reachable: false, modelReady: false })
  })

  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ai/health' })
    expect(res.statusCode).toBe(401)
  })
})

describe('AI draft-ticket (3.8 A2/D2)', () => {
  it('returns a schema-valid draft on the happy path (never creates a ticket)', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    const owner = await tokenFor('ai-draft-owner')
    await provision(owner)
    const orgId = await makeOrg(owner, 'AI Draft Co')
    const projectId = await makeProject(owner, orgId, 'Draft Proj')

    runtimeSend.mockResolvedValueOnce(
      toolResponse({
        title: 'Add password reset',
        description: 'Users need a way to reset a forgotten password via email.',
        acceptanceCriteria: ['Reset email is sent', 'Link expires in 1h'],
        priority: 'HIGH',
      }),
    )
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(owner),
      payload: { projectId, notes: 'users keep forgetting passwords, need reset flow' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().draft).toMatchObject({ title: 'Add password reset', priority: 'HIGH' })
    expect(runtimeSend).toHaveBeenCalledTimes(1)
    // no ticket persisted
    const list = await app.inject({ method: 'GET', url: `/api/tickets?projectId=${projectId}`, headers: bearer(owner) })
    expect(list.json().items).toHaveLength(0)
  })

  it('re-prompts once on invalid tool arguments then succeeds', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    const owner = await tokenFor('ai-draft-retry')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Retry Co')
    const projectId = await makeProject(owner, orgId, 'Retry Proj')

    runtimeSend
      .mockResolvedValueOnce(toolResponse({ nonsense: true }))
      .mockResolvedValueOnce(toolResponse({ title: 'T', description: 'D', acceptanceCriteria: ['a'], priority: 'LOW' }))
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(owner),
      payload: { projectId, notes: 'something' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().draft.title).toBe('T')
    expect(runtimeSend).toHaveBeenCalledTimes(2)
  })

  it('returns 502 AI_BAD_OUTPUT when the arguments are invalid twice', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    const owner = await tokenFor('ai-draft-bad')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Bad Co')
    const projectId = await makeProject(owner, orgId, 'Bad Proj')

    runtimeSend.mockResolvedValue(toolResponse(null))
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(owner),
      payload: { projectId, notes: 'something' },
    })
    expect(res.statusCode).toBe(502)
    expect(res.json().code).toBe('AI_BAD_OUTPUT')
  })

  it('maps ThrottlingException to 503 AI_UNAVAILABLE', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    const owner = await tokenFor('ai-draft-throttle')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Throttle Co')
    const projectId = await makeProject(owner, orgId, 'Throttle Proj')

    runtimeSend.mockRejectedValue(awsError('ThrottlingException'))
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(owner),
      payload: { projectId, notes: 'something' },
    })
    expect(res.statusCode).toBe(503)
    expect(res.json().code).toBe('AI_UNAVAILABLE')
  })

  it('maps a timeout to 504 AI_TIMEOUT', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    const owner = await tokenFor('ai-draft-timeout')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Timeout Co')
    const projectId = await makeProject(owner, orgId, 'Timeout Proj')

    runtimeSend.mockRejectedValue(awsError('TimeoutError'))
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(owner),
      payload: { projectId, notes: 'something' },
    })
    expect(res.statusCode).toBe(504)
    expect(res.json().code).toBe('AI_TIMEOUT')
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
    expect(runtimeSend).not.toHaveBeenCalled()
  })

  it('rejects notes over 4000 chars with 400', async () => {
    process.env.AI_PROVIDER = 'bedrock'
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
    expect(runtimeSend).not.toHaveBeenCalled()
  })

  it('forbids a non-member with 403', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    const owner = await tokenFor('ai-draft-owner2')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Member Co')
    const projectId = await makeProject(owner, orgId, 'Member Proj')

    const outsider = await tokenFor('ai-draft-outsider')
    await provision(outsider)
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/draft-ticket',
      headers: bearer(outsider),
      payload: { projectId, notes: 'something' },
    })
    expect(res.statusCode).toBe(403)
    expect(runtimeSend).not.toHaveBeenCalled()
  })
})

describe('AI expand-ticket (3.8 A3/D2)', () => {
  it('returns an expanded draft for an existing ticket', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    const owner = await tokenFor('ai-expand-owner')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Expand Co')
    const projectId = await makeProject(owner, orgId, 'Expand Proj')
    const ticketId = await makeTicket(owner, projectId, 'Rate limit the API')

    runtimeSend.mockResolvedValueOnce(
      toolResponse({
        description: 'Add per-route rate limiting to protect abuse-prone endpoints.',
        acceptanceCriteria: ['Limits are enforced', 'Exceeding returns 429'],
        goal: 'Prevent endpoint abuse.',
        constraints: 'Must use the existing Redis store.',
      }),
    )
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/expand-ticket',
      headers: bearer(owner),
      payload: { ticketId, prompt: 'focus on Redis-backed limits' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().draft).toMatchObject({ goal: 'Prevent endpoint abuse.' })
  })

  it('re-prompts once when acceptanceCriteria comes back empty, then succeeds', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    const owner = await tokenFor('ai-expand-empty-ac')
    await provision(owner)
    const orgId = await makeOrg(owner, 'EmptyAC Co')
    const projectId = await makeProject(owner, orgId, 'EmptyAC Proj')
    const ticketId = await makeTicket(owner, projectId, 'Add keyboard shortcuts help modal')

    // Nova Micro's observed thin-ticket failure: valid fields but empty AC. The
    // zod .min(1) rejects it → one corrective re-prompt → the retry supplies AC.
    runtimeSend
      .mockResolvedValueOnce(
        toolResponse({ description: 'D', acceptanceCriteria: [], goal: 'G', constraints: '' }),
      )
      .mockResolvedValueOnce(
        toolResponse({
          description: 'D',
          acceptanceCriteria: ['Shortcuts are discoverable', 'Modal is keyboard-accessible'],
          goal: 'G',
          constraints: '',
        }),
      )
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/expand-ticket',
      headers: bearer(owner),
      payload: { ticketId },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().draft.acceptanceCriteria).toHaveLength(2)
    expect(runtimeSend).toHaveBeenCalledTimes(2)
  })

  it('returns 404 for an unknown ticket', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    const owner = await tokenFor('ai-expand-404')
    await provision(owner)
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/expand-ticket',
      headers: bearer(owner),
      payload: { ticketId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(404)
    expect(runtimeSend).not.toHaveBeenCalled()
  })
})

describe('AI project-summary (3.8 A4/D2)', () => {
  it('returns a headline/bullets/risks digest', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    const owner = await tokenFor('ai-sum-owner')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Summary Co')
    const projectId = await makeProject(owner, orgId, 'Summary Proj')
    await makeTicket(owner, projectId, 'First task')

    runtimeSend.mockResolvedValueOnce(
      toolResponse({
        headline: 'Project is early but on track.',
        bullets: ['1 ticket open', 'No active sprint yet'],
        risks: ['No milestones defined'],
      }),
    )
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/project-summary',
      headers: bearer(owner),
      payload: { projectId },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().summary).toMatchObject({ headline: 'Project is early but on track.' })
    expect(Array.isArray(res.json().summary.bullets)).toBe(true)
  })

  it('forbids a non-member with 403', async () => {
    process.env.AI_PROVIDER = 'bedrock'
    const owner = await tokenFor('ai-sum-owner2')
    await provision(owner)
    const orgId = await makeOrg(owner, 'Summary Co 2')
    const projectId = await makeProject(owner, orgId, 'Summary Proj 2')

    const outsider = await tokenFor('ai-sum-outsider')
    await provision(outsider)
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/project-summary',
      headers: bearer(outsider),
      payload: { projectId },
    })
    expect(res.statusCode).toBe(403)
    expect(runtimeSend).not.toHaveBeenCalled()
  })
})
