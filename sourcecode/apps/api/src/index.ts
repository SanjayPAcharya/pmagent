import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
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
  // In-memory for now; Redis-backed rate limiting is wired with auth (Stage B).
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(websocket) // WS room handling lands in Phase 3

  app.get('/health', async () => ({
    status: 'ok',
    service: 'api',
    ts: new Date().toISOString(),
  }))

  // Phase 1 (Stage B+): /api/me, /api/orgs, /api/projects
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
