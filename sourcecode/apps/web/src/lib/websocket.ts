import { useCallback, useEffect, useRef } from 'react'
import type { WSMessage, WSEventType } from '@agentpm/shared-types'
import { keycloak } from './auth'

const WS_URL = import.meta.env.VITE_WS_URL as string | undefined

export type WSHandlers = Partial<Record<WSEventType, (payload: any) => void>>

interface Options {
  /** Skip events this client itself triggered (optimistic UI already applied them). */
  currentUserId?: string
  /** Called after a *reconnect* (not the first connect) so callers can refetch the gap. */
  onReconnect?: () => void
}

/**
 * Subscribe a component to a project's realtime room.
 *
 * - The token is sent in the first `auth` message, never in the URL (it would
 *   leak into proxy/access logs).
 * - Refreshes the access token right before connecting/authenticating.
 * - Reconnects with exponential backoff on unexpected drops (not on 1000/4001).
 * - On reconnect, fires `onReconnect` so the caller can refetch missed changes.
 * - Drops self-echo events (`payload.actorId === currentUserId`).
 */
export function useProjectWebSocket(projectId: string | undefined, handlers: WSHandlers, options: Options = {}) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const optionsRef = useRef(options)
  optionsRef.current = options

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const attempts = useRef(0)
  const hadConnection = useRef(false)
  const closedByUs = useRef(false)

  const connect = useCallback(() => {
    if (!projectId) return
    const base = WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
    const ws = new WebSocket(`${base}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      void keycloak
        .updateToken(30)
        .catch(() => undefined)
        .then(() => ws.send(JSON.stringify({ type: 'auth', token: keycloak.token, projectId })))
    }

    ws.onmessage = (event) => {
      let msg: WSMessage
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (msg.type === 'auth.ok') {
        attempts.current = 0
        if (hadConnection.current) optionsRef.current.onReconnect?.()
        hadConnection.current = true
        return
      }
      if (msg.type === 'auth.error') {
        closedByUs.current = true
        ws.close(4001, 'auth failed')
        return
      }
      const actorId = (msg.payload as { actorId?: string } | undefined)?.actorId
      const me = optionsRef.current.currentUserId
      if (actorId && me && actorId === me) return // self-echo
      handlersRef.current[msg.type]?.(msg.payload)
    }

    ws.onclose = (event) => {
      if (closedByUs.current || event.code === 1000 || event.code === 4001) return
      const delay = Math.min(30_000, 1000 * 2 ** attempts.current)
      attempts.current += 1
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.onerror = () => ws.close()
  }, [projectId])

  useEffect(() => {
    closedByUs.current = false
    hadConnection.current = false
    attempts.current = 0
    connect()
    return () => {
      closedByUs.current = true
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close(1000, 'unmounted')
    }
  }, [connect])

  // Send an ephemeral client→server message (ticket.viewing / ticket.drag).
  // Best-effort: silently no-ops if the socket isn't open.
  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  return { send }
}
