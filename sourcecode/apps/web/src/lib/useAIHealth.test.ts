import { describe, it, expect } from 'vitest'
import { aiButtonState, aiErrorKey } from './useAIHealth'
import { ApiError, type AIHealth } from './api'

// aiButtonState is the pure gating logic shared by every AI button (board draft,
// drawer auto-fill, overview summary) — so one focused test covers all three.
const health = (over: Partial<AIHealth>): AIHealth => ({
  enabled: true,
  reachable: true,
  modelReady: true,
  provider: 'bedrock',
  ...over,
})

describe('aiButtonState', () => {
  it('is not ready and unavailable when health is undefined (not yet loaded)', () => {
    expect(aiButtonState(undefined)).toEqual({ ready: false, reasonKey: 'ai.unavailable' })
  })

  it('is unavailable when the server has AI disabled', () => {
    expect(aiButtonState(health({ enabled: false, reachable: false, modelReady: false, provider: null }))).toEqual({
      ready: false,
      reasonKey: 'ai.unavailable',
    })
  })

  it('is unavailable when the provider is unreachable', () => {
    expect(aiButtonState(health({ reachable: false, modelReady: false }))).toEqual({
      ready: false,
      reasonKey: 'ai.unavailable',
    })
  })

  it('reports model-loading when reachable but the model is not ready', () => {
    expect(aiButtonState(health({ modelReady: false }))).toEqual({
      ready: false,
      reasonKey: 'ai.modelLoading',
    })
  })

  it('is ready when enabled, reachable, and the model is ready', () => {
    expect(aiButtonState(health({}))).toEqual({ ready: true, reasonKey: null })
  })
})

// aiErrorKey turns a caught generation failure into truthful copy. 429 has no
// `code` (it comes from @fastify/rate-limit) so it must be keyed on status
// before the code switch; unknown shapes fall back to the generic key.
describe('aiErrorKey', () => {
  it('keys 429 as rate-limit even without a code', () => {
    expect(aiErrorKey(new ApiError(429, 'Too many requests'))).toBe('ai.error.rateLimit')
  })

  it('keys AI_UNAVAILABLE (503) as unavailable', () => {
    expect(aiErrorKey(new ApiError(503, 'down', 'AI_UNAVAILABLE'))).toBe('ai.error.unavailable')
  })

  it('keys AI_TIMEOUT (504) as timeout', () => {
    expect(aiErrorKey(new ApiError(504, 'slow', 'AI_TIMEOUT'))).toBe('ai.error.timeout')
  })

  it('keys AI_BAD_OUTPUT (502) as badOutput', () => {
    expect(aiErrorKey(new ApiError(502, 'garbage', 'AI_BAD_OUTPUT'))).toBe('ai.error.badOutput')
  })

  it('falls back to the generic key for an unrecognised ApiError code', () => {
    expect(aiErrorKey(new ApiError(500, 'boom', 'SOMETHING_ELSE'))).toBe('ai.failed')
  })

  it('falls back to the generic key for a non-ApiError value', () => {
    expect(aiErrorKey(new Error('network'))).toBe('ai.failed')
    expect(aiErrorKey(undefined)).toBe('ai.failed')
  })

  // B2 — a user-initiated cancel surfaces as an AbortError; callers must get a
  // null sentinel (drop silently), never error copy. fetch throws a DOMException
  // in browsers but some environments throw a plain Error — key on the name.
  it('returns null (silent) for an aborted request', () => {
    expect(aiErrorKey(new DOMException('The user aborted a request.', 'AbortError'))).toBeNull()
    const plain = new Error('aborted')
    plain.name = 'AbortError'
    expect(aiErrorKey(plain)).toBeNull()
  })
})
