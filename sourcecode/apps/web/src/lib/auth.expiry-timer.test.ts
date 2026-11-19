import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 3.8.8 (Tester finding, §8 AC1) — an idle tab must notice its session ended.
// This file uses the REAL keycloak-js, not a stand-in: the bug lived inside the
// library. keycloak-js arms its expiry timer only when a token is stored *and*
// `onTokenExpired` is already attached, so the first token of a page load (the
// one `init()` stores) must find the handler in place.

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0)
const ACCESS_TTL = 300 // the realm's accessTokenLifespan (5 min)

function jwt(claims: Record<string, unknown>) {
  const part = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${part({ alg: 'none', typ: 'JWT' })}.${part(claims)}.sig`
}

/** A token-endpoint response minted at the fake clock's current time. */
function tokens() {
  const iat = Math.floor(Date.now() / 1000)
  const base = { iat, sub: 'user-1', sid: 'session-1', typ: 'Bearer' }
  return {
    access_token: jwt({ ...base, exp: iat + ACCESS_TTL }),
    refresh_token: jwt({ ...base, typ: 'Refresh', exp: iat + 1800 }),
    id_token: jwt({ ...base, typ: 'ID', exp: iat + ACCESS_TTL }),
  }
}

const ok = () => new Response(JSON.stringify(tokens()), { status: 200 })
// What Keycloak answers once the SSO session has been ended (admin sign-out, idle timeout).
const sessionGone = () =>
  new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Session not active' }), { status: 400 })

let auth: typeof import('./auth')
let tokenEndpoint: ReturnType<typeof vi.fn>
// keycloak-js keeps its expiry timer on the instance but leaves it out of its types.
const expiryTimer = () => (auth.keycloak as unknown as { tokenTimeoutHandle?: number }).tokenTimeoutHandle

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW })
  vi.stubEnv('VITE_KEYCLOAK_URL', 'http://keycloak.test')
  vi.stubEnv('VITE_KEYCLOAK_REALM', 'agentpm')
  vi.stubEnv('VITE_KEYCLOAK_CLIENT', 'agentpm-web')
  tokenEndpoint = vi.fn(async () => ok())
  vi.stubGlobal('fetch', tokenEndpoint)
  vi.spyOn(console, 'warn').mockImplementation(() => {}) // keycloak-js: "not a secure context" in jsdom

  vi.resetModules()
  auth = await import('./auth')
  // A page load that comes back signed in, the way main.tsx does it. (Init with
  // a stored token: keycloak-js stores the first token during init(), then main.tsx
  // calls watchSession(). No refresh happens before the first expiry.)
  const t = tokens()
  const signedIn = await auth.keycloak.init({ token: t.access_token, refreshToken: t.refresh_token, checkLoginIframe: false })
  expect(signedIn).toBe(true)
  auth.watchSession()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('idle tab: the first token after a page load (3.8.8, §8 AC1)', () => {
  it('has an expiry timer armed straight away', () => {
    expect(expiryTimer()).toBeDefined()
  })

  it('shows the prompt by itself when the session has ended and the token runs out', async () => {
    const listener = vi.fn()
    auth.onSessionExpired(listener)
    tokenEndpoint.mockImplementation(async () => sessionGone()) // admin signed the session out

    await vi.advanceTimersByTimeAsync((ACCESS_TTL - 10) * 1000)
    expect(listener).not.toHaveBeenCalled() // still inside the token's lifetime

    await vi.advanceTimersByTimeAsync(20 * 1000) // past expiry, no user action at all
    expect(listener).toHaveBeenCalledTimes(1)
    expect(auth.keycloak.authenticated).toBe(false)
  })

  it('refreshes quietly and re-arms while the session is still alive (AC9)', async () => {
    const listener = vi.fn()
    auth.onSessionExpired(listener)
    const callsAfterInit = tokenEndpoint.mock.calls.length

    await vi.advanceTimersByTimeAsync((ACCESS_TTL + 5) * 1000) // first expiry → refresh
    await vi.advanceTimersByTimeAsync((ACCESS_TTL + 5) * 1000) // the re-armed timer fires too
    expect(tokenEndpoint.mock.calls.length - callsAfterInit).toBe(2)
    expect(expiryTimer()).toBeDefined()
    expect(listener).not.toHaveBeenCalled()
  })
})
