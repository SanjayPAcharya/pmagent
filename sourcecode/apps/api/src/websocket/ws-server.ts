import type { FastifyPluginAsync } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import { subscribeToEvents } from '../events/event-bus.js'
import { verifyAccessToken } from '../auth/verify-token.js'
import { prisma } from '../db/client.js'
import { assertOrgRole } from '../services/authz.js'

// In-memory rooms, one set per API instance. Board events still propagate across
// instances because every instance subscribes to the Redis bus and delivers to
// whichever sockets it holds. Only presence is per-instance (fine for the MVP).
const rooms = new Map<string, Set<WebSocket>>()
const socketUser = new Map<WebSocket, { userId: string; projectId: string }>()

const join = (room: string, s: WebSocket) =>
  (rooms.get(room) ?? rooms.set(room, new Set()).get(room)!).add(s)

const leaveAll = (s: WebSocket) => {
  for (const set of rooms.values()) set.delete(s)
}

const broadcast = (room: string, msg: object) => {
  const data = JSON.stringify(msg)
  rooms.get(room)?.forEach((s) => {
    try {
      s.send(data)
    } catch {
      /* socket already gone; close handler will reap it */
    }
  })
}

function presenceState(projectId: string): string[] {
  const ids = new Set<string>()
  for (const s of rooms.get(`project:${projectId}`) ?? []) {
    const u = socketUser.get(s)
    if (u) ids.add(u.userId)
  }
  return [...ids]
}

const AUTH_TIMEOUT_MS = Number(process.env.WS_AUTH_TIMEOUT_MS ?? 5000)

export const wsServer: FastifyPluginAsync = async (app) => {
  // One subscription routes every event by whichever key its payload carries.
  // projectId → board room; userId → personal room (notification bell).
  await subscribeToEvents((type, payload) => {
    const env = (room: string) => ({ type, room, payload, timestamp: new Date().toISOString() })
    if (payload?.projectId) broadcast(`project:${payload.projectId}`, env(`project:${payload.projectId}`))
    if (payload?.userId) broadcast(`user:${payload.userId}`, env(`user:${payload.userId}`))
  })

  // Drop every socket and clear rooms on shutdown (after readiness has drained).
  app.addHook('onClose', async () => {
    for (const set of rooms.values()) {
      for (const s of set) {
        try {
          s.close(1001, 'server shutting down')
        } catch {
          /* ignore */
        }
      }
    }
    rooms.clear()
    socketUser.clear()
  })

  app.get('/ws', { websocket: true }, (socket) => {
    let authed = false
    const authTimer = setTimeout(() => {
      if (!authed) socket.close(4001, 'auth timeout')
    }, AUTH_TIMEOUT_MS)

    socket.on('message', async (raw: Buffer) => {
      let msg: { type?: string; token?: string; projectId?: string }
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (authed) return // Phase-2 clients only listen after auth
      if (msg.type !== 'auth' || !msg.token || !msg.projectId) return

      try {
        const claims = await verifyAccessToken(msg.token)
        const user = await prisma.user.findUniqueOrThrow({ where: { idpSub: claims.sub } })
        const project = await prisma.project.findUniqueOrThrow({
          where: { id: msg.projectId },
          select: { orgId: true },
        })
        await assertOrgRole(user.id, project.orgId, 'MEMBER') // throws if not a member

        join(`project:${msg.projectId}`, socket)
        join(`user:${user.id}`, socket)
        socketUser.set(socket, { userId: user.id, projectId: msg.projectId })
        authed = true
        clearTimeout(authTimer)
        socket.send(JSON.stringify({ type: 'auth.ok' }))
        broadcast(`project:${msg.projectId}`, {
          type: 'presence.state',
          payload: { projectId: msg.projectId, viewers: presenceState(msg.projectId) },
        })
      } catch {
        socket.send(JSON.stringify({ type: 'auth.error' }))
        socket.close(4001, 'auth failed')
      }
    })

    socket.on('close', () => {
      clearTimeout(authTimer)
      const u = socketUser.get(socket)
      leaveAll(socket)
      socketUser.delete(socket)
      if (u) {
        broadcast(`project:${u.projectId}`, {
          type: 'presence.state',
          payload: { projectId: u.projectId, viewers: presenceState(u.projectId) },
        })
      }
    })
  })
}
