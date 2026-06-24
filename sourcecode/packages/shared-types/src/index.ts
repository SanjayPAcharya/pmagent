// Types shared across api + web. Filled out as Phase 1+ progresses.

export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export interface ApiError {
  error: string
  code?: string
}

// ─── Real-time (Phase 2C) ────────────────────────────────────
// The WS server fans events out by room; the client matches on `type`. Kept here
// so api (publisher) and web (consumer) can never drift on the envelope shape.

export type WSEventType =
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.deleted'
  | 'sprint.updated'
  | 'notification.new'
  | 'presence.state'
  | 'member.joined'
  | 'auth.ok'
  | 'auth.error'

export interface WSMessage {
  type: WSEventType
  room?: string // "project:{projectId}" | "user:{userId}"
  payload?: unknown
  timestamp?: string // ISO 8601
}
