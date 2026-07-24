import type { TicketStatus } from '@prisma/client'
import { prisma } from '../db/client.js'
import { blockedByCounts } from './relations.service.js'
import { projectListStats } from './stats.service.js'
import { workloadReport, velocityReport, milestoneReadiness, type WorkloadRow } from './reports.service.js'

// 3.7 R4 — one aggregate the project Overview dashboard renders in a single
// round trip. Every piece reuses an existing report/stat helper; the pieces run
// concurrently. Non-archived tickets only, mirroring the reporting services.

export interface OverviewStatus {
  byStatus: Partial<Record<TicketStatus, number>>
  open: number // not DONE, not CANCELLED
  done: number
  byWorkstream: { SPRINT: number; ADHOC: number }
}
export interface OverviewActiveSprint {
  id: string
  name: string
  endDate: string | null
  total: number
  done: number
}
export interface OverviewBlocker {
  id: string
  number: number
  key: string
  title: string
  openBlockerCount: number
}
export interface OverviewMilestone {
  id: string
  name: string
  date: string
  done: boolean
  readiness: { done: number; total: number }
}
export interface OverviewCapacity {
  rows: WorkloadRow[]
  recentVelocityAvg: number | null
}
// 3.8.6 DEC-2 — "Needs attention": the actionable triage the Overview leads with.
export interface AttentionTicket {
  id: string
  number: number
  key: string
  title: string
  dueDate?: string | null
}
export interface AttentionMilestone {
  id: string
  name: string
  date: string
  progress: { done: number; total: number }
}
export interface AttentionGroup<T> {
  items: T[] // capped for display
  total: number // full count (drives "+N more")
}
export interface NeedsAttention {
  blocked: AttentionGroup<AttentionTicket>
  overdue: AttentionGroup<AttentionTicket>
  unassignedInSprint: AttentionGroup<AttentionTicket>
  milestonesAtRisk: AttentionGroup<AttentionMilestone>
  total: number // grand total across categories; 0 ⇒ "all caught up"
}
export interface ProjectOverview {
  status: OverviewStatus
  activeSprint: OverviewActiveSprint | null
  needsAttention: NeedsAttention
  blockers: OverviewBlocker[]
  milestones: OverviewMilestone[]
  capacity: OverviewCapacity
}

const ATTENTION_CAP = 5 // items shown per category before "+N more"

const round1 = (n: number) => Math.round(n * 10) / 10

/** Blockers (full, sorted): BLOCKED status ∪ tickets with ≥1 open dependency. */
async function computeBlockers(projectId: string): Promise<OverviewBlocker[]> {
  const candidates = await prisma.ticket.findMany({
    where: { projectId, archivedAt: null, OR: [{ status: 'BLOCKED' }, { dependencies: { some: {} } }] },
    select: { id: true, number: true, title: true, status: true, project: { select: { key: true } } },
  })
  if (candidates.length === 0) return []
  const counts = await blockedByCounts(candidates.map((c) => c.id))
  return candidates
    .map((c) => ({
      id: c.id,
      number: c.number,
      key: `${c.project.key}-${c.number}`,
      title: c.title,
      openBlockerCount: counts.get(c.id) ?? 0,
      status: c.status,
    }))
    .filter((c) => c.openBlockerCount > 0 || c.status === 'BLOCKED')
    .sort((a, b) => b.openBlockerCount - a.openBlockerCount || a.number - b.number)
    .map(({ status: _status, ...rest }) => rest)
}

const asTicket = (t: { id: string; number: number; title: string; dueDate?: Date | null; project: { key: string } }): AttentionTicket => ({
  id: t.id,
  number: t.number,
  key: `${t.project.key}-${t.number}`,
  title: t.title,
  ...(t.dueDate !== undefined ? { dueDate: t.dueDate ? t.dueDate.toISOString() : null } : {}),
})
const group = <T>(items: T[]): AttentionGroup<T> => ({ items: items.slice(0, ATTENTION_CAP), total: items.length })

/**
 * 3.8.6 DEC-2 — the "Needs attention" triage: blocked, overdue, unassigned in the
 * active sprint, and milestones at risk. Each item links to the ticket/milestone.
 * `blockers` (already computed for the payload) is reused for the blocked group.
 */
async function computeNeedsAttention(projectId: string, blockers: OverviewBlocker[]): Promise<NeedsAttention> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const openStatus = { notIn: ['DONE', 'CANCELLED'] as TicketStatus[] }

  const activeSprint = await prisma.sprint.findFirst({ where: { projectId, status: 'ACTIVE' }, select: { id: true } })

  const [overdueRows, unassignedRows, milestoneRows, progress] = await Promise.all([
    prisma.ticket.findMany({
      where: { projectId, archivedAt: null, status: openStatus, dueDate: { lt: today } },
      orderBy: { dueDate: 'asc' },
      select: { id: true, number: true, title: true, dueDate: true, project: { select: { key: true } } },
    }),
    activeSprint
      ? prisma.ticket.findMany({
          where: { projectId, archivedAt: null, status: openStatus, sprintId: activeSprint.id, assignedToId: null },
          orderBy: { number: 'asc' },
          select: { id: true, number: true, title: true, project: { select: { key: true } } },
        })
      : Promise.resolve([]),
    prisma.milestone.findMany({
      where: { projectId, done: false, date: { lt: today } },
      orderBy: { date: 'asc' },
      select: { id: true, name: true, date: true },
    }),
    milestoneReadiness(projectId),
  ])

  // At-risk = overdue + open, excluding those whose linked tickets are all done.
  const atRisk: AttentionMilestone[] = milestoneRows
    .map((m) => ({ id: m.id, name: m.name, date: m.date.toISOString(), progress: progress.get(m.id) ?? { done: 0, total: 0 } }))
    .filter((m) => !(m.progress.total > 0 && m.progress.done === m.progress.total))

  const blocked = group(blockers.map((b) => ({ id: b.id, number: b.number, key: b.key, title: b.title })))
  const overdue = group(overdueRows.map(asTicket))
  const unassignedInSprint = group(unassignedRows.map(asTicket))
  const milestonesAtRisk = group(atRisk)
  const total = blocked.total + overdue.total + unassignedInSprint.total + milestonesAtRisk.total

  return { blocked, overdue, unassignedInSprint, milestonesAtRisk, total }
}

/** Next 3 open milestones (date asc) with their due-date readiness. */
async function computeMilestones(projectId: string): Promise<OverviewMilestone[]> {
  const [readiness, open] = await Promise.all([
    milestoneReadiness(projectId),
    prisma.milestone.findMany({
      where: { projectId, done: false },
      orderBy: { date: 'asc' },
      take: 3,
      select: { id: true, name: true, date: true, done: true },
    }),
  ])
  return open.map((m) => ({
    id: m.id,
    name: m.name,
    date: m.date.toISOString(),
    done: m.done,
    readiness: readiness.get(m.id) ?? { done: 0, total: 0 },
  }))
}

export async function projectOverview(projectId: string): Promise<ProjectOverview> {
  const [statusGroups, listStats, blockers, milestones, workload, velocity] = await Promise.all([
    prisma.ticket.groupBy({
      by: ['status', 'workstream'],
      where: { projectId, archivedAt: null },
      _count: { _all: true },
    }),
    projectListStats([projectId]),
    computeBlockers(projectId),
    computeMilestones(projectId),
    workloadReport(projectId),
    velocityReport(projectId),
  ])

  const status: OverviewStatus = { byStatus: {}, open: 0, done: 0, byWorkstream: { SPRINT: 0, ADHOC: 0 } }
  for (const g of statusGroups) {
    const n = g._count._all
    status.byStatus[g.status] = (status.byStatus[g.status] ?? 0) + n
    status.byWorkstream[g.workstream] += n
    if (g.status === 'DONE') status.done += n
    else if (g.status !== 'CANCELLED') status.open += n
  }

  const as = listStats.get(projectId)?.activeSprint ?? null
  const activeSprint: OverviewActiveSprint | null = as
    ? { id: as.id, name: as.name, endDate: as.endDate ? as.endDate.toISOString() : null, total: as.total, done: as.done }
    : null

  // Recent velocity = average of the last 3 completed sprints with a value.
  const vals = velocity.map((v) => v.velocity).filter((v): v is number => v != null).slice(-3)
  const recentVelocityAvg = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null

  const needsAttention = await computeNeedsAttention(projectId, blockers)

  return {
    status,
    activeSprint,
    needsAttention,
    blockers: blockers.slice(0, 5), // full list computed above; payload keeps the top 5
    milestones,
    capacity: { rows: workload, recentVelocityAvg },
  }
}
