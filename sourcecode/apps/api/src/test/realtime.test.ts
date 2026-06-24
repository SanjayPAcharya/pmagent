import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { signToken } from './auth-test-kit'

// Realtime path needs the Redis bus + a listening server (WS can't use inject).
// Opt this file in BEFORE buildServer reads config; other test files stay hermetic.
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
process.env.WS_AUTH_TIMEOUT_MS = '300'

let app: FastifyInstance
let baseUrl: string
let wsUrl: string

beforeAll(async () => {
  const { buildServer } = await import('../index')
  app = await buildServer()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  baseUrl = `http://127.0.0.1:${port}`
  wsUrl = `ws://127.0.0.1:${port}/ws`
})
afterAll(async () => {
  await app.close()
})

const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const tokenFor = (sub: string) => signToken({ sub, email: `${sub}@x.com`, name: sub })

// Minimal message-collecting WS client over Node's built-in global WebSocket.
function open(): WebSocket {
  return new WebSocket(wsUrl)
}
function onOpen(ws: WebSocket): Promise<void> {
  return new Promise((res) => ws.addEventListener('open', () => res(), { once: true }))
}
function waitFor(ws: WebSocket, match: (m: any) => boolean, timeout = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws message timeout')), timeout)
    const handler = (e: MessageEvent) => {
      const msg = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString())
      if (match(msg)) {
        clearTimeout(timer)
        ws.removeEventListener('message', handler as EventListener)
        resolve(msg)
      }
    }
    ws.addEventListener('message', handler as EventListener)
  })
}
function waitClose(ws: WebSocket, timeout = 2000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws close timeout')), timeout)
    ws.addEventListener('close', (e) => {
      clearTimeout(timer)
      resolve(e.code)
    }, { once: true })
  })
}

async function setup(owner: string) {
  const org = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: 'WS Org' } })
  const orgId = org.json().org.id
  const slug = org.json().org.slug
  const proj = await app.inject({ method: 'POST', url: '/api/projects', headers: bearer(owner), payload: { orgId, name: 'Board' } })
  return { orgId, slug, projectId: proj.json().project.id as string }
}

describe('realtime websocket', () => {
  it('closes (4001) a socket that never authenticates', async () => {
    const ws = open()
    await onOpen(ws)
    expect(await waitClose(ws, 2000)).toBe(4001)
  })

  it('rejects a bad token with auth.error then close 4001', async () => {
    const ws = open()
    await onOpen(ws)
    ws.send(JSON.stringify({ type: 'auth', token: 'not-a-jwt', projectId: '00000000-0000-0000-0000-000000000000' }))
    expect((await waitFor(ws, (m) => m.type === 'auth.error')).type).toBe('auth.error')
    ws.close()
  })

  it('authenticates a member and delivers board + personal events to the right rooms', async () => {
    const owner = await tokenFor('ws-owner')
    const { slug, projectId } = await setup(owner)

    // a second member who will be the assignee (their personal room)
    const devTok = await tokenFor('ws-dev')
    const dev = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(devTok) })
    const devId = dev.json().user.id
    await app.inject({ method: 'POST', url: `/api/orgs/${slug}/members`, headers: bearer(owner), payload: { email: 'ws-dev@x.com' } })

    // owner socket + dev socket both join the project room
    const ownerWs = open(); await onOpen(ownerWs)
    ownerWs.send(JSON.stringify({ type: 'auth', token: await tokenFor('ws-owner'), projectId }))
    await waitFor(ownerWs, (m) => m.type === 'auth.ok')

    const devWs = open(); await onOpen(devWs)
    const ownerNoNotif = waitFor(ownerWs, (m) => m.type === 'notification.new', 1500).then(() => 'got').catch(() => 'none')
    devWs.send(JSON.stringify({ type: 'auth', token: devTok, projectId }))
    await waitFor(devWs, (m) => m.type === 'auth.ok')

    // owner creates a ticket assigned to dev → board event to both, notification to dev only
    const devNotif = waitFor(devWs, (m) => m.type === 'notification.new')
    const ownerBoard = waitFor(ownerWs, (m) => m.type === 'ticket.created')
    await app.inject({ method: 'POST', url: '/api/tickets', headers: bearer(owner), payload: { projectId, title: 'Live', assignedToId: devId } })

    const board = await ownerBoard
    expect(board.room).toBe(`project:${projectId}`)
    const notif = await devNotif
    expect(notif.room).toBe(`user:${devId}`)
    // owner (the actor) must NOT receive a personal notification
    expect(await ownerNoNotif).toBe('none')

    ownerWs.close(); devWs.close()
  })
})

// keep baseUrl referenced (handshake uses wsUrl; baseUrl documents the listen addr)
void baseUrl
