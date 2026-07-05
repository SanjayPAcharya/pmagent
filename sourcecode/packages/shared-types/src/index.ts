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
  | 'milestone.updated' // 3.7 R2: create/update/delete of a project milestone (clients invalidate)
  | 'notification.new'
  | 'presence.state'
  | 'ticket.presence' // E1: which viewers are on which ticket (ephemeral relay)
  | 'ticket.drag' // B1: another viewer's in-flight drag (ephemeral relay)
  | 'member.joined'
  | 'auth.ok'
  | 'auth.error'

export interface WSMessage {
  type: WSEventType
  room?: string // "project:{projectId}" | "user:{userId}"
  payload?: unknown
  timestamp?: string // ISO 8601
}
