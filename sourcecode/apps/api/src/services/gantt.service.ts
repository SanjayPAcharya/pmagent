import type { Milestone, Priority, TicketStatus, Workstream } from '@prisma/client'
import { prisma } from '../db/client.js'
import { milestoneReadiness } from './reports.service.js'

// 3.7 R6 — flat payload the Gantt view needs in one round trip: dated tickets,
// their dependency edges, and milestones. All the date math lives in the web
// `lib/gantt.ts` pure module; the server just ships raw dates.

const MAX_ITEMS = 1000

export interface GanttItem {
  id: string
  number: number
  key: string
  title: string
  status: TicketStatus
  priority: Priority
  assignedToId: string | null
  sprintId: string | null
  milestoneId: string | null
  workstream: Workstream
  startDate: Date | null
  dueDate: Date | null
  storyPoints: number | null
  labelIds: string[]
}
export interface GanttEdge {
  ticketId: string
  dependsOnId: string
}
// 3.8.5 MS-3 — milestone carries its linked-ticket progress for the diamond hover.
export type GanttMilestone = Milestone & { progress: { done: number; total: number } }
export interface GanttPayload {
  items: GanttItem[]
  edges: GanttEdge[]
  milestones: GanttMilestone[]
  truncated: boolean
}

export async function projectGantt(projectId: string): Promise<GanttPayload> {
  // Fetch one over the cap so we can flag truncation without a separate count.
  const rows = await prisma.ticket.findMany({
    where: { projectId, archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: MAX_ITEMS + 1,
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      assignedToId: true,
      sprintId: true,
      milestoneId: true,
      workstream: true,
      startDate: true,
      dueDate: true,
      storyPoints: true,
      project: { select: { key: true } },
      labels: { select: { labelId: true } },
    },
  })
  const truncated = rows.length > MAX_ITEMS
  const sliced = truncated ? rows.slice(0, MAX_ITEMS) : rows
  const ids = new Set(sliced.map((r) => r.id))

  const [deps, milestoneRows, progress] = await Promise.all([
    prisma.ticketDependency.findMany({
      where: { ticketId: { in: [...ids] } },
      select: { ticketId: true, dependsOnId: true },
    }),
    prisma.milestone.findMany({ where: { projectId }, orderBy: { date: 'asc' } }),
    milestoneReadiness(projectId),
  ])
  const milestones: GanttMilestone[] = milestoneRows.map((m) => ({ ...m, progress: progress.get(m.id) ?? { done: 0, total: 0 } }))

  const items: GanttItem[] = sliced.map(({ project, labels, ...r }) => ({
    ...r,
    key: `${project.key}-${r.number}`,
    labelIds: labels.map((l) => l.labelId),
  }))
  // Only keep edges whose other end is also on-screen, so the UI can draw them.
  const edges = deps.filter((d) => ids.has(d.dependsOnId))

  return { items, edges, milestones, truncated }
}
