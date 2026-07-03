import type { NotificationType } from '@prisma/client'
import { prisma } from '../db/client.js'
import { subscribeToEvents, publishEvent } from '../events/event-bus.js'

// In-app notification fan-out. Subscribes to ticket.* events, resolves the
// recipient set (assignee + creator + watchers + @mentioned, minus the actor),
// writes a Notification row per recipient, and republishes `notification.new`
// keyed by `userId` so the WS server delivers it to that user's room/bell.

const TYPE_BY_EVENT: Record<string, NotificationType> = {
  'ticket.created': 'TICKET_ASSIGNED',
  'ticket.updated': 'TICKET_STATUS_CHANGED',
  'ticket.commented': 'TICKET_COMMENTED',
  'ticket.unblocked': 'TICKET_UNBLOCKED',
  'ticket.subtasks_done': 'SUBTASKS_DONE',
}

// 3.4 W2/W3 — nudge events carry their own message instead of the generic body.
const BODY_BY_EVENT: Record<string, (ref: string, title: string) => string> = {
  'ticket.unblocked': (ref, title) => `${ref} — ${title} is unblocked: all blockers are done`,
  'ticket.subtasks_done': (ref, title) => `${ref} — ${title}: all subtasks are complete`,
}

// Mentions are stored in a fixed token format `@[<uuid>]`. We resolve them
// server-side and keep only ids that are members of the ticket's org.
const MENTION_RE = /@\[([0-9a-f-]{36})\]/gi

export function parseMentions(body: string): string[] {
  const ids = new Set<string>()
  for (const m of body.matchAll(MENTION_RE)) ids.add(m[1])
  return [...ids]
}

/** Keep only the ids that are members of `orgId` (org-bounded mention resolution). */
export async function filterOrgMembers(orgId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return []
  const members = await prisma.orgMember.findMany({
    where: { orgId, userId: { in: userIds } },
    select: { userId: true },
  })
  return members.map((m) => m.userId)
}

interface TicketEventPayload {
  ticketId?: string
  actorId?: string
  projectId?: string
  mentionedUserIds?: string[]
}

async function handleTicketEvent(type: string, payload: TicketEventPayload) {
  if (!payload.ticketId) return
  const ticket = await prisma.ticket.findUnique({
    where: { id: payload.ticketId },
    select: {
      id: true,
      number: true,
      title: true,
      createdById: true,
      assignedToId: true,
      project: { select: { key: true } },
      watchers: { select: { userId: true } },
    },
  })
  if (!ticket) return

  const recipients = new Set<string>([ticket.createdById])
  if (ticket.assignedToId) recipients.add(ticket.assignedToId)
  for (const w of ticket.watchers) recipients.add(w.userId)
  const mentioned = new Set(payload.mentionedUserIds ?? [])
  for (const id of mentioned) recipients.add(id)
  if (payload.actorId) recipients.delete(payload.actorId) // never notify the actor

  if (recipients.size === 0) return

  const ref = `${ticket.project.key}-${ticket.number}`
  for (const userId of recipients) {
    const notifType: NotificationType = mentioned.has(userId) ? 'MENTION' : (TYPE_BY_EVENT[type] ?? 'TICKET_STATUS_CHANGED')
    const created = await prisma.notification.create({
      data: {
        userId,
        ticketId: ticket.id,
        type: notifType,
        channel: 'IN_APP',
        subject: ref,
        body: (BODY_BY_EVENT[type] ?? ((r: string, t: string) => `${r} — ${t}`))(ref, ticket.title),
      },
    })
    await publishEvent('notification.new', {
      userId,
      notificationId: created.id,
      ticketId: ticket.id,
      type: notifType,
    })
  }
}

export async function initNotificationService() {
  await subscribeToEvents((type, payload) => {
    if (!type.startsWith('ticket.')) return // ignore our own notification.new etc.
    void handleTicketEvent(type, payload as TicketEventPayload)
  })
}
