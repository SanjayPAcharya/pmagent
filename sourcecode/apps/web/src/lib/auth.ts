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

export function register() {
  return keycloak.register()
}

export function logout() {
  return keycloak.logout({ redirectUri: window.location.origin })
}
