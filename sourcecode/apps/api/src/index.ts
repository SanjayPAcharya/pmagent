import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { Redis } from 'ioredis'
import websocket from '@fastify/websocket'
import jwt, { type TokenOrHeader } from '@fastify/jwt'
import buildGetJwks from 'get-jwks'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'
import { ZodError } from 'zod'
import { loadConfig } from './config.js'
import { ApiError } from './lib/errors.js'
import { prisma } from './db/client.js'
import { isReady, markNotReady } from './lib/readiness.js'
import { initEventBus, disposeEventBus, pingEventBus } from './events/event-bus.js'
import { wsServer } from './websocket/ws-server.js'
import { initNotificationService } from './services/notifications.service.js'
import { purgeExpired } from './services/retention.service.js'

export async function buildServer() {
  const config = loadConfig()

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  })

  // Tolerate an empty body on `Content-Type: application/json` requests. Browsers
  // (and our fetch client) often send this header on body-less DELETE/POST calls;
  // Fastify's default JSON parser would 400 ("Body cannot be empty"). Treat empty
  // as no body so body-less endpoints (remove watcher, start/complete sprint,
  // mark-read) work regardless of the header.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = body as string
    if (!raw || raw.trim().length === 0) return done(null, undefined)
    try {
      done(null, JSON.parse(raw))
    } catch {
      const err = new ApiError(400, 'Invalid JSON body')
      done(err, undefined)
    }
  })

  await app.register(cors, { origin: config.ALLOWED_ORIGINS, credentials: true })
  // 3.7.4 A1 — OWASP baseline headers (nosniff, X-Frame-Options, Referrer-Policy, …).
  // CSP/HSTS stay off here: TLS terminates at Caddy (A2 sets HSTS there), and a
  // default CSP would break Swagger UI at /documentation; the API returns no
  // user-facing HTML anyway.
  await app.register(helmet, { contentSecurityPolicy: false, hsts: false })
  // 3.7.4 D2 — Redis-backed rate limiting so limits hold across API replicas and
  // survive restarts. Without REDIS_URL (tests, dev-without-redis) the plugin
  // falls back to its in-process store, keeping those paths hermetic. Uses an
  // ioredis client (the plugin's required shape); the app's node-redis event-bus
  // client is a separate connection. Short timeouts so a Redis blip degrades to
  // the local store rather than stalling requests.
  const rlRedis = config.REDIS_URL
    ? new Redis(config.REDIS_URL, { connectTimeout: 500, maxRetriesPerRequest: 1 })
    : undefined
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute', redis: rlRedis })
  await app.register(websocket)

  // Real-time: connect the Redis bus (no-op without REDIS_URL → tests stay
  // hermetic unless the harness opts in), then wire the consumers that subscribe
  // to it — the WS fan-out and the in-app notification service.
  await initEventBus(config.REDIS_URL)
  await app.register(wsServer)
  await initNotificationService()
  app.addHook('onClose', async () => {
    await disposeEventBus()
    if (rlRedis) await rlRedis.quit()
  })

  // OpenAPI docs at /documentation, generated from the Phase-2 routes' Zod
  // schemas via fastify-type-provider-zod's transform (no separate JSON schema).
  await app.register(swagger, {
    openapi: { info: { title: 'PMAgent API', version: '0.2.0' } },
    transform: jsonSchemaTransform,
  })
  await app.register(swaggerUi, { routePrefix: '/documentation' })

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

  // Map domain + validation errors to clean JSON responses.
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send({ error: err.message, code: err.code })
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'ValidationError', details: err.flatten() })
    }
    const status = (err as { statusCode?: number }).statusCode
    if (status && status < 500) {
      return reply.code(status).send({ error: (err as Error).message })
    }
    request.log.error({ err }, 'unhandled error')
    return reply.code(500).send({ error: 'Internal Server Error' })
  })

  app.get('/health', async () => ({
    status: 'ok',
    service: 'api',
    ts: new Date().toISOString(),
  }))

  // Readiness: distinct from liveness. 503 during shutdown drain, or if a backing
  // store is unreachable (Postgres SELECT 1 + Redis ping when the bus is wired).
  app.get('/ready', async (_request, reply) => {
    if (!isReady()) return reply.code(503).send({ status: 'shutting_down' })
    try {
      await prisma.$queryRaw`SELECT 1`
      if (!(await pingEventBus())) throw new Error('redis unreachable')
      return { status: 'ready' }
    } catch (err) {
      reply.log.error({ err }, 'readiness check failed')
      return reply.code(503).send({ status: 'not_ready' })
    }
  })

  await app.register(import('./routes/me.js'), { prefix: '/api/me' })
  await app.register(import('./routes/organizations.js'), { prefix: '/api/orgs' })
  await app.register(import('./routes/projects.js'), { prefix: '/api/projects' })
  await app.register(import('./routes/tickets.js'), { prefix: '/api/tickets' })
  await app.register(import('./routes/labels.js'), { prefix: '/api/labels' })
  await app.register(import('./routes/sprints.js'), { prefix: '/api/sprints' })
  await app.register(import('./routes/notifications.js'), { prefix: '/api/notifications' })
  await app.register(import('./routes/invites.js'), { prefix: '/api/invites' })
  await app.register(import('./routes/search.js'), { prefix: '/api/search' })
  await app.register(import('./routes/templates.js'), { prefix: '/api/templates' })
  await app.register(import('./routes/ai.js'), { prefix: '/api/ai' })
  return app
}

async function start() {
  const app = await buildServer()
  const port = Number(process.env.PORT ?? 3001)

  // Graceful shutdown: drain readiness (→503) so the LB stops routing, then close
  // the server (onClose disposes the event bus + WS sockets) and the DB pool.
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    app.log.info({ signal }, 'shutting down')
    markNotReady()
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  // 3.7.4 E2 — data-retention sweep: once on boot, then daily. Lives in start()
  // (not buildServer) so tests never spawn a timer. .unref() so it can't hold
  // the process open during shutdown.
  const sweep = () =>
    purgeExpired()
      .then((r) => app.log.info(r, 'retention sweep complete'))
      .catch((err) => app.log.error({ err }, 'retention sweep failed'))
  void sweep()
  setInterval(sweep, 24 * 60 * 60 * 1000).unref()

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
