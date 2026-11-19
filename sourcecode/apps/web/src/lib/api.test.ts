import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { retryAfterMs } from './api'

// keycloak-js stand-in for the 401 tests below (3.8.8): only what api.ts and the
// session bus touch.
vi.mock('keycloak-js', () => ({
  default: class {
    authenticated = true
    token: string | undefined = 'access-token'
    updateToken = vi.fn()
    login = vi.fn()
    logout = vi.fn()
    register = vi.fn()
  },
}))

// Rate-limit grace (2026-07-13) — the single silent GET retry waits for the
// server's Retry-After, clamped so a missing/garbled header can't stall (min 1s)
// and a huge one can't hang the UI (max 10s).
describe('retryAfterMs', () => {
  it('uses the server Retry-After seconds', () => {
    expect(retryAfterMs('3')).toBe(3000)
    expect(retryAfterMs('8')).toBe(8000)
  })

  it('clamps to the 1–10s band', () => {
    expect(retryAfterMs('0')).toBe(1000)
    expect(retryAfterMs('60')).toBe(10000)
  })

  it('falls back to 1s on a missing or garbled header', () => {
    expect(retryAfterMs(null)).toBe(1000)
    expect(retryAfterMs('soon')).toBe(1000)
    expect(retryAfterMs('-5')).toBe(1000)
  })
})

// 3.8.8 — an API call that gets a 401 tries one forced refresh. If Keycloak
// refuses it, the session-expired prompt is raised once, however many calls fail.
describe('authedFetch on a 401 (3.8.8)', () => {
  let auth: typeof import('./auth')
  let api: typeof import('./api')['api']
  let updateToken: Mock
  const unauthorized = () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  beforeEach(async () => {
    vi.resetModules() // fresh session bus per test
    auth = await import('./auth')
    ;({ api } = await import('./api'))
    updateToken = auth.keycloak.updateToken as unknown as Mock
    auth.watchSession()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('raises the prompt once when the forced refresh is refused', async () => {
    updateToken.mockImplementation((min: number) => (min === -1 ? Promise.reject(new Error('refused')) : Promise.resolve(false)))
    vi.stubGlobal('fetch', vi.fn(async () => unauthorized()))
    const listener = vi.fn()
    auth.onSessionExpired(listener)

    const results = await Promise.allSettled([api.me(), api.me()])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('retries quietly, with no prompt, when the forced refresh works', async () => {
    updateToken.mockResolvedValue(true)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 'u1' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const listener = vi.fn()
    auth.onSessionExpired(listener)

    await expect(api.me()).resolves.toEqual({ user: { id: 'u1' } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(listener).not.toHaveBeenCalled()
  })
})
