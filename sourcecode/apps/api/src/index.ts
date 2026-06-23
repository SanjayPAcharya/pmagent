import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import jwt, { type TokenOrHeader } from '@fastify/jwt'
import buildGetJwks from 'get-jwks'
import { loadConfig } from './config.js'

export async function buildServer() {
  const config = loadConfig()

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  })

  await app.register(cors, { origin: config.ALLOWED_ORIGINS, credentials: true })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(websocket) // WS room handling lands in Phase 3

  // ── Keycloak token verification (the API is an OIDC resource server) ──
  // Verify signature against the realm's JWKS + check iss/aud. Keys are fetched
  // from KEYCLOAK_INTERNAL_URL (reachable from the container); the issuer the
  // token carries (browser-facing) is validated separately via allowedIss — so
  // there's no need to align the two hostnames (no /etc/hosts hack).
  const getJwks = buildGetJwks({ providerDiscovery: true })
  await app.register(jwt, {
    decode: { complete: true },
    // @fastify/jwt calls the function secret as (request, tokenOrHeader, cb).
    // With complete decode, tokenOrHeader carries `.header` (kid/alg). Resolve
    // the realm signing key from Keycloak's JWKS for that kid.
    secret: (
      _request,
      tokenOrHeader: TokenOrHeader,
      cb: (err: Error | null, secret: string | Buffer | undefined) => void,
    ) => {
      const header = (tokenOrHeader as { header?: { kid?: string; alg?: string } }).header ??
        (tokenOrHeader as { kid?: string; alg?: string })
      getJwks
        .getPublicKey({ kid: header.kid!, alg: header.alg!, domain: config.KEYCLOAK_INTERNAL_URL })
        .then((key) => cb(null, key))
        .catch((err: unknown) => cb(err as Error, undefined))
    },
    verify: {
      allowedIss: config.KEYCLOAK_ISSUER_URL,
      allowedAud: config.KEYCLOAK_API_AUDIENCE,
    },
  })

  app.get('/health', async () => ({
    status: 'ok',
    service: 'api',
    ts: new Date().toISOString(),
  }))

  await app.register(import('./routes/me.js'), { prefix: '/api/me' })
  // Stage C: /api/orgs, /api/projects
  return app
}

async function start() {
  const app = await buildServer()
  const port = Number(process.env.PORT ?? 3001)
  try {
    await app.listen({ port, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

// Start only when run directly (not when imported by tests).
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) void start()
