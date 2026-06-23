import { createServer, type Server } from 'node:http'
import { generateKeyPair, exportJWK, SignJWT, type KeyLike, type JWK } from 'jose'

// Hermetic Keycloak stand-in: serves an OIDC discovery doc + JWKS for a
// throwaway RSA keypair, and mints tokens signed by it. Lets the API's real
// verification path run in tests with NO Keycloak.

const KID = 'test-key'
let server: Server | undefined
let issuer = ''
let privateKey: KeyLike
let publicJwk: JWK

export async function startTestAuth(): Promise<{ issuer: string }> {
  const { publicKey, privateKey: pk } = await generateKeyPair('RS256')
  privateKey = pk
  publicJwk = { ...(await exportJWK(publicKey)), kid: KID, alg: 'RS256', use: 'sig' }

  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url?.endsWith('/.well-known/openid-configuration')) {
      res.end(
        JSON.stringify({
          issuer,
          jwks_uri: `${issuer}/protocol/openid-connect/certs`,
        }),
      )
    } else if (req.url?.endsWith('/protocol/openid-connect/certs')) {
      res.end(JSON.stringify({ keys: [publicJwk] }))
    } else {
      res.statusCode = 404
      res.end('{}')
    }
  })

  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  issuer = `http://127.0.0.1:${port}/realms/agentpm`

  // Point the API at our stand-in (issuer validation + JWKS discovery).
  process.env.KEYCLOAK_ISSUER_URL = issuer
  process.env.KEYCLOAK_INTERNAL_URL = issuer
  process.env.KEYCLOAK_API_AUDIENCE = 'agentpm-api'
  return { issuer }
}

export async function stopTestAuth(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (!server) return resolve()
    server.close(() => resolve())
  })
}

export interface TokenClaims {
  sub: string
  email?: string
  name?: string
  aud?: string | string[]
  iss?: string
  expSec?: number
}

export async function signToken(claims: TokenClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ email: claims.email, name: claims.name })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setSubject(claims.sub)
    .setIssuer(claims.iss ?? issuer)
    .setAudience(claims.aud ?? 'agentpm-api')
    .setIssuedAt(now)
    .setExpirationTime(now + (claims.expSec ?? 300))
    .sign(privateKey)
}
