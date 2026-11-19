import { describe, it, expect, vi, beforeEach } from 'vitest'

// 3.8.8 — the session-expired event bus. keycloak-js is swapped for a stand-in
// holding only what the bus touches, so each test can play Keycloak's part.
vi.mock('keycloak-js', () => ({
  default: class {
    authenticated = false
    token: string | undefined = undefined
    onTokenExpired?: () => void
    onAuthLogout?: () => void
    updateToken = vi.fn()
    login = vi.fn()
    logout = vi.fn()
    register = vi.fn()
  },
}))

let auth: typeof import('./auth')
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(async () => {
  vi.resetModules() // fresh bus state (signed-in flag, expired flag) per test
  auth = await import('./auth')
})

describe('session-expired bus (3.8.8)', () => {
  it('never fires on a page that started signed out (the landing page)', () => {
    const listener = vi.fn()
    auth.onSessionExpired(listener)
    auth.notifySessionExpired()
    expect(listener).not.toHaveBeenCalled()
  })

  it('fires once for a signed-in page, however many failures report it', () => {
    const listener = vi.fn()
    auth.onSessionExpired(listener)
    auth.watchSession()
    auth.notifySessionExpired()
    auth.notifySessionExpired()
    auth.notifySessionExpired()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('still fires after keycloak-js has cleared the token (a refused refresh)', () => {
    const listener = vi.fn()
    auth.onSessionExpired(listener)
    auth.keycloak.authenticated = true
    auth.keycloak.token = 'abc'
    auth.watchSession()
    // What keycloak-js does on a 400 from the token endpoint, before rejecting.
    auth.keycloak.authenticated = false
    auth.keycloak.token = undefined
    auth.notifySessionExpired()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('tells a prompt that mounts after the session already ended', () => {
    auth.watchSession()
    auth.notifySessionExpired()
    const late = vi.fn()
    auth.onSessionExpired(late)
    expect(late).toHaveBeenCalledTimes(1)
  })

  it('stops telling a listener once it unsubscribes', () => {
    const listener = vi.fn()
    const off = auth.onSessionExpired(listener)
    off()
    auth.watchSession()
    auth.notifySessionExpired()
    expect(listener).not.toHaveBeenCalled()
  })

  it('fires when the token refresh is refused, not when it succeeds', async () => {
    const listener = vi.fn()
    auth.onSessionExpired(listener)
    auth.watchSession()
    const updateToken = auth.keycloak.updateToken as unknown as ReturnType<typeof vi.fn>

    updateToken.mockResolvedValueOnce(true)
    auth.keycloak.onTokenExpired?.()
    await flush()
    expect(listener).not.toHaveBeenCalled()

    updateToken.mockRejectedValueOnce(new Error('Server responded with an invalid status.'))
    auth.keycloak.onTokenExpired?.()
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('has its Keycloak hooks attached on load, before init(), yet stays silent until watchSession()', async () => {
    // keycloak-js only arms its expiry timer if onTokenExpired is set when the
    // first token arrives (see auth.expiry-timer.test.ts for the real library).
    expect(auth.keycloak.onTokenExpired).toBeTypeOf('function')
    expect(auth.keycloak.onAuthLogout).toBeTypeOf('function')

    const listener = vi.fn()
    auth.onSessionExpired(listener)
    ;(auth.keycloak.updateToken as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('refused'))
    auth.keycloak.onTokenExpired?.()
    auth.keycloak.onAuthLogout?.()
    await flush()
    expect(listener).not.toHaveBeenCalled() // a signed-out page never prompts
  })

  it('fires when Keycloak ends the session and clears the tokens', () => {
    const listener = vi.fn()
    auth.onSessionExpired(listener)
    auth.watchSession()
    auth.keycloak.onAuthLogout?.()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
