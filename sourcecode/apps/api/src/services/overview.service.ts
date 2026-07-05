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
export interface ProjectOverview {
  status: OverviewStatus
  activeSprint: OverviewActiveSprint | null
  blockers: OverviewBlocker[]
  milestones: OverviewMilestone[]
  capacity: OverviewCapacity
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Top-5 blockers: BLOCKED status ∪ tickets with ≥1 open dependency. */
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
    .slice(0, 5)
    .map(({ status: _status, ...rest }) => rest)
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

  return { status, activeSprint, blockers, milestones, capacity: { rows: workload, recentVelocityAvg } }
}
