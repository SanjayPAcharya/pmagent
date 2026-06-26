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
