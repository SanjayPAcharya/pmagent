import type { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import { ApiError } from '../lib/errors.js'

// Ticket relationships (parent / subtasks / dependencies) + the "blocked" signal.
// Dependency direction: a TicketDependency row {ticketId, dependsOnId} means
// `ticketId` is blocked by `dependsOnId`. So for a ticket T:
//   T.dependencies (relation "DependsOn")  → rows where ticketId=T   → T is blocked by row.dependsOn
//   T.dependents   (relation "BlockedBy")  → rows where dependsOnId=T → T blocks row.ticket
const CLOSED = ['DONE', 'CANCELLED']

const slimSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  project: { select: { key: true } },
} satisfies Prisma.TicketSelect

type SlimRow = Prisma.TicketGetPayload<{ select: typeof slimSelect }>

function slim(t: SlimRow) {
  return { id: t.id, number: t.number, key: `${t.project.key}-${t.number}`, title: t.title, status: t.status }
}

/** Map of ticketId → count of its dependencies that aren't done yet (0 = not blocked). */
export async function blockedByCounts(ticketIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (ticketIds.length === 0) return map
  const deps = await prisma.ticketDependency.findMany({
    where: { ticketId: { in: ticketIds } },
    select: { ticketId: true, dependsOn: { select: { status: true, archivedAt: true } } },
  })
  for (const d of deps) {
    if (d.dependsOn.archivedAt === null && !CLOSED.includes(d.dependsOn.status)) {
      map.set(d.ticketId, (map.get(d.ticketId) ?? 0) + 1)
    }
  }
  return map
}

export async function getRelations(ticketId: string) {
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      parent: { select: slimSelect },
      subtasks: { where: { archivedAt: null }, select: slimSelect, orderBy: { number: 'asc' } },
      dependencies: { select: { dependsOn: { select: slimSelect } } },
      dependents: { select: { ticket: { select: slimSelect } } },
    },
  })
  return {
    parent: t?.parent ? slim(t.parent) : null,
    subtasks: (t?.subtasks ?? []).map(slim),
    blockedBy: (t?.dependencies ?? []).map((d) => slim(d.dependsOn)),
    blocks: (t?.dependents ?? []).map((d) => slim(d.ticket)),
  }
}

/** Add "ticket depends on dependsOn" (idempotent). Guards self + direct cycle. */
export async function addDependency(ticketId: string, dependsOnId: string) {
  if (ticketId === dependsOnId) throw new ApiError(400, 'A ticket cannot depend on itself', 'BAD_DEPENDENCY')
  const reverse = await prisma.ticketDependency.findUnique({
    where: { ticketId_dependsOnId: { ticketId: dependsOnId, dependsOnId: ticketId } },
  })
  if (reverse) throw new ApiError(400, 'That would create a circular dependency', 'CYCLE')
  await prisma.ticketDependency.upsert({
    where: { ticketId_dependsOnId: { ticketId, dependsOnId } },
    create: { ticketId, dependsOnId },
    update: {},
  })
}

export async function removeDependency(ticketId: string, dependsOnId: string) {
  await prisma.ticketDependency.deleteMany({ where: { ticketId, dependsOnId } })
}
