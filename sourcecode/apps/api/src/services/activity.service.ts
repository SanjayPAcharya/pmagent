import type { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'

// Shared shape + serializer for the org / project activity feeds. Reads recent
// TicketActivity rows (one per change) and flattens the ticket + actor for the UI.
export const activityInclude = {
  ticket: {
    select: {
      id: true,
      number: true,
      title: true,
      projectId: true,
      project: { select: { key: true, slug: true } },
    },
  },
  actor: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.TicketActivityInclude

type ActivityRow = Prisma.TicketActivityGetPayload<{ include: typeof activityInclude }>

function serializeActivity(a: ActivityRow) {
  return {
    id: a.id,
    type: a.type,
    fromValue: a.fromValue,
    toValue: a.toValue,
    createdAt: a.createdAt,
    actor: a.actor ? { id: a.actor.id, name: a.actor.name, avatarUrl: a.actor.avatarUrl } : null,
    ticket: {
      id: a.ticket.id,
      number: a.ticket.number,
      title: a.ticket.title,
      projectId: a.ticket.projectId,
      projectKey: a.ticket.project.key,
      projectSlug: a.ticket.project.slug,
    },
  }
}

/** Recent activity across a whole set of tickets (org- or project-scoped). */
export async function recentActivity(where: Prisma.TicketActivityWhereInput, take = 50) {
  const rows = await prisma.ticketActivity.findMany({
    where,
    include: activityInclude,
    orderBy: { createdAt: 'desc' },
    take,
  })
  return rows.map(serializeActivity)
}
