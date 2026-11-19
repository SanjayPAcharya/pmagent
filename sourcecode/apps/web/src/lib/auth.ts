import Keycloak from 'keycloak-js'

// Single Keycloak instance for the SPA. Initialized once in main.tsx.
export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL as string,
  realm: import.meta.env.VITE_KEYCLOAK_REALM as string,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT as string,
})

export function getToken(): string | undefined {
  return keycloak.token
}

export function login() {
  return keycloak.login()
}

// Phase 2.8.5: social sign-in straight from our page. `idpHint` tells Keycloak to
// skip its own login screen and broker directly to the provider, so the user never
// sees a Keycloak page. First-time logins auto-create the account (seamless signup).
export type SocialIdp = 'google' | 'microsoft' | 'github'
export function loginWith(idp: SocialIdp) {
  return keycloak.login({ idpHint: idp })
}

export function register() {
  return keycloak.register()
}

export function logout() {
  return keycloak.logout({ redirectUri: window.location.origin })
}

// ── 3.8.8 Session expiry ────────────────────────────────────────────────────
// One page-wide "you've been signed out" signal, raised by a failed token
// refresh, an API 401 that can't refresh, or a websocket whose token is refused.
// <SessionExpiredModal /> shows it. It fires only for a page that started signed
// in (never on the landing page), and only once: further failures while the
// prompt is up are no-ops, so prompts never stack.
type ExpiryListener = () => void
const expiryListeners = new Set<ExpiryListener>()
let hadSession = false
let expired = false

/** Called once from main.tsx when keycloak.init() comes back signed in. */
export function watchSession() {
  hadSession = true
  // The access token is about to lapse: refresh it. If Keycloak refuses, the session is over.
  keycloak.onTokenExpired = () => {
    void keycloak.updateToken(30).catch(() => notifySessionExpired())
  }
  // keycloak-js clears its own tokens when the SSO session ends (a refused
  // refresh, or its login-iframe check). A normal logout() just navigates away.
  keycloak.onAuthLogout = () => notifySessionExpired()
}

export function onSessionExpired(listener: ExpiryListener): () => void {
  expiryListeners.add(listener)
  if (expired) listener() // mounted after the session had already ended
  return () => {
    expiryListeners.delete(listener)
  }
}

export function notifySessionExpired() {
  // Gate on hadSession, not keycloak.authenticated: by the time a refresh has
  // failed, keycloak-js has usually cleared the token and `authenticated` already.
  if (!hadSession || expired) return
  expired = true
  expiryListeners.forEach((fn) => fn())
}
