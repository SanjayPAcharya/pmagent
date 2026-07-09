import { describe, it, expect } from 'vitest'
import { aiButtonState } from './useAIHealth'
import type { AIHealth } from './api'

// aiButtonState is the pure gating logic shared by every AI button (board draft,
// drawer auto-fill, overview summary) — so one focused test covers all three.
const health = (over: Partial<AIHealth>): AIHealth => ({
  enabled: true,
  reachable: true,
  modelReady: true,
  provider: 'ollama',
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
