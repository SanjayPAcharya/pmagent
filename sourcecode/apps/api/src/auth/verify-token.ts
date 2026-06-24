import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { loadConfig } from '../config.js'

// Shared async JWKS verifier for paths that can't use @fastify/jwt's request
// lifecycle — notably the WebSocket handshake, which verifies the token carried
// in the first `auth` message rather than an HTTP Authorization header. Same
// realm keys (iss + aud) as the HTTP verifier; works against real Keycloak and
// the hermetic test stand-in (both serve /protocol/openid-connect/certs).

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

function getJwks() {
  if (!jwks) {
    const cfg = loadConfig()
    jwks = createRemoteJWKSet(new URL(`${cfg.KEYCLOAK_INTERNAL_URL}/protocol/openid-connect/certs`))
  }
  return jwks
}

export interface AccessClaims extends JWTPayload {
  sub: string
  email?: string
  name?: string
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const cfg = loadConfig()
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: cfg.KEYCLOAK_ISSUER_URL,
    audience: cfg.KEYCLOAK_API_AUDIENCE,
  })
  if (!payload.sub) throw new Error('token has no subject')
  return payload as AccessClaims
}
