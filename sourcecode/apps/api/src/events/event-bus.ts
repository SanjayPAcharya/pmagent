import { createClient, type RedisClientType } from 'redis'

// Lazy Redis pub/sub for the cross-instance event fan-out.
//
// NOT connected at import — initEventBus() runs in buildServer() (Phase 2C wires
// the subscriber side into the WS server) and disposeEventBus() on shutdown.
// publishEvent() is a safe no-op until init, so Phase-2B routes can publish the
// events the updateTicket service returns without forcing a Redis connection
// (tests/worker stay hermetic).
let publisher: RedisClientType | undefined
let subscriber: RedisClientType | undefined

// Multiple in-process consumers (WS fan-out + notification service) share ONE
// Redis subscription; we dispatch each message to every registered handler.
type Handler = (type: string, payload: DomainEvent['payload']) => void
const handlers: Handler[] = []
let subscribed = false

export const EVENTS_CHANNEL = 'agentpm:events'

export interface DomainEvent {
  type: string
  payload: { projectId?: string; userId?: string; actorId?: string; [k: string]: unknown }
}

export async function initEventBus(url: string | undefined) {
  if (!url) return
  publisher = createClient({ url })
  subscriber = publisher.duplicate()
  await Promise.all([publisher.connect(), subscriber.connect()])
}

/**
 * Publish a domain event. Every payload must carry a `projectId` (board events)
 * and/or a `userId` (personal events) — the WS server fans out by `project:{id}`
 * and `user:{id}`; an event with neither reaches no one. No-op until init.
 */
export async function publishEvent(type: string, payload: DomainEvent['payload']) {
  if (!publisher) return
  await publisher.publish(
    EVENTS_CHANNEL,
    JSON.stringify({ type, payload, timestamp: new Date().toISOString() }),
  )
}

export async function subscribeToEvents(handler: Handler) {
  handlers.push(handler)
  if (!subscriber || subscribed) return // no Redis (tests w/o bus) or already wired
  subscribed = true
  await subscriber.subscribe(EVENTS_CHANNEL, (message) => {
    const { type, payload } = JSON.parse(message) as DomainEvent
    for (const h of handlers) h(type, payload)
  })
}

/** True once a publisher is connected (used by /ready). */
export async function pingEventBus(): Promise<boolean> {
  if (!publisher) return true // not configured → not a readiness blocker
  try {
    await publisher.ping()
    return true
  } catch {
    return false
  }
}

export async function disposeEventBus() {
  await Promise.allSettled([publisher?.quit(), subscriber?.quit()])
  publisher = subscriber = undefined
  handlers.length = 0
  subscribed = false
}
