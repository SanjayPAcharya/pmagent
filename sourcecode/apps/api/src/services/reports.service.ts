import { prisma } from '../db/client.js'

// 3.3 R1/R2/R4 — per-project reporting, reconstructed from data that already
// exists (Sprint.velocity, TicketActivity STATUS_CHANGED, open-ticket counts).
// No snapshot tables; a handful of bounded queries per request. Built as
// service functions so the Phase 4 weekly digest can reuse them.

const CLOSED = ['DONE', 'CANCELLED'] as const
const CYCLE_WINDOW_DAYS = 90
const TREND_WEEKS = 8

export interface VelocityPoint {
  id: string
  name: string
  velocity: number | null
  endDate: string | null
}

export interface CycleWeek {
  weekStart: string // ISO date (Monday)
  count: number
  leadMedianDays: number | null
  cycleMedianDays: number | null
}

export interface CycleReport {
  windowDays: number
  closedCount: number
  leadMedianDays: number | null
  leadP85Days: number | null
  cycleMedianDays: number | null
  cycleP85Days: number | null
  weekly: CycleWeek[]
}

export interface WorkloadRow {
  userId: string | null // null = unassigned bucket
  name: string
  avatarUrl: string | null
  openCount: number
  inProgressCount: number
  sprintCount: number // 3.7 R11 — open sprint-work vs ad-hoc split
  adhocCount: number
}

export interface ReadinessMilestone {
  id: string
  name: string
  date: string
  done: number
  total: number
}
export interface ProjectReports {
  velocity: VelocityPoint[]
  cycle: CycleReport
  workload: WorkloadRow[]
  readiness: ReadinessMilestone[] // 3.7 R14 — open milestones with due-date readiness
  overall: { done: number; open: number } // completed vs pending (non-archived, non-cancelled)
}

const round1 = (n: number) => Math.round(n * 10) / 10
const quantile = (sorted: number[], q: number): number | null => {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)
  return round1(sorted[Math.max(0, idx)])
}
const median = (values: number[]): number | null =>
  quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  )

/** Monday 00:00 UTC of the week containing `d` — stable bucket key for trends. */
function weekStartUtc(d: Date): string {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (day.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  day.setUTCDate(day.getUTCDate() - dow)
  return day.toISOString().slice(0, 10)
}

/** R1 — velocity across the last completed sprints (set on sprint complete). */
export async function velocityReport(projectId: string): Promise<VelocityPoint[]> {
  const sprints = await prisma.sprint.findMany({
    where: { projectId, status: 'COMPLETED' },
    select: { id: true, name: true, velocity: true, endDate: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' },
    take: 12,
  })
  return sprints.map((s) => ({
    id: s.id,
    name: s.name,
    velocity: s.velocity,
    endDate: (s.endDate ?? s.updatedAt).toISOString(),
  }))
}

/**
 * R2 — lead time (created → last DONE) and cycle time (first IN_PROGRESS →
 * last DONE) for tickets closed inside the window, plus a weekly trend.
 */
export async function cycleReport(projectId: string): Promise<CycleReport> {
  const cutoff = new Date(Date.now() - CYCLE_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  // Last DONE transition per ticket inside the window…
  const doneActs = await prisma.ticketActivity.findMany({
    where: {
      type: 'STATUS_CHANGED',
      toValue: 'DONE',
      createdAt: { gte: cutoff },
      ticket: { projectId, archivedAt: null, status: 'DONE' },
    },
    select: { ticketId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 1000,
  })
  const doneAt = new Map<string, Date>()
  for (const a of doneActs) doneAt.set(a.ticketId, a.createdAt) // asc → last write wins

  const ids = [...doneAt.keys()]
  const empty: CycleReport = {
    windowDays: CYCLE_WINDOW_DAYS,
    closedCount: 0,
    leadMedianDays: null,
    leadP85Days: null,
    cycleMedianDays: null,
    cycleP85Days: null,
    weekly: [],
  }
  if (ids.length === 0) return empty

  // …their creation dates and first IN_PROGRESS transition (may predate the window).
  const [tickets, progressActs] = await Promise.all([
    prisma.ticket.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true } }),
    prisma.ticketActivity.findMany({
      where: { ticketId: { in: ids }, type: 'STATUS_CHANGED', toValue: 'IN_PROGRESS' },
      select: { ticketId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  const createdAt = new Map(tickets.map((t) => [t.id, t.createdAt]))
  const startedAt = new Map<string, Date>()
  for (const a of progressActs) if (!startedAt.has(a.ticketId)) startedAt.set(a.ticketId, a.createdAt)

  const DAY = 24 * 60 * 60 * 1000
  const leads: number[] = []
  const cycles: number[] = []
  const byWeek = new Map<string, { leads: number[]; cycles: number[] }>()
  for (const id of ids) {
    const done = doneAt.get(id)!
    const created = createdAt.get(id)
    if (!created) continue
    const lead = (done.getTime() - created.getTime()) / DAY
    // Tickets that never passed through IN_PROGRESS fall back to lead time.
    const start = startedAt.get(id) ?? created
    const cycle = (done.getTime() - start.getTime()) / DAY
    leads.push(lead)
    cycles.push(cycle)
    const wk = weekStartUtc(done)
    const bucket = byWeek.get(wk) ?? { leads: [], cycles: [] }
    bucket.leads.push(lead)
    bucket.cycles.push(cycle)
    byWeek.set(wk, bucket)
  }

  const weekly = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-TREND_WEEKS)
    .map(([weekStart, b]) => ({
      weekStart,
      count: b.leads.length,
      leadMedianDays: median(b.leads),
      cycleMedianDays: median(b.cycles),
    }))

  const sortedLeads = [...leads].sort((a, b) => a - b)
  const sortedCycles = [...cycles].sort((a, b) => a - b)
  return {
    windowDays: CYCLE_WINDOW_DAYS,
    closedCount: leads.length,
    leadMedianDays: quantile(sortedLeads, 0.5),
    leadP85Days: quantile(sortedLeads, 0.85),
    cycleMedianDays: quantile(sortedCycles, 0.5),
    cycleP85Days: quantile(sortedCycles, 0.85),
    weekly,
  }
}

/** R4 — open tickets per member (grouped count; one bucket for unassigned). */
export async function workloadReport(projectId: string): Promise<WorkloadRow[]> {
  const groups = await prisma.ticket.groupBy({
    by: ['assignedToId', 'status', 'workstream'],
    where: { projectId, archivedAt: null, status: { notIn: [...CLOSED] } },
    _count: { _all: true },
  })
  const byUser = new Map<string | null, { openCount: number; inProgressCount: number; sprintCount: number; adhocCount: number }>()
  for (const g of groups) {
    const row = byUser.get(g.assignedToId) ?? { openCount: 0, inProgressCount: 0, sprintCount: 0, adhocCount: 0 }
    row.openCount += g._count._all
    if (g.status === 'IN_PROGRESS') row.inProgressCount += g._count._all
    if (g.workstream === 'ADHOC') row.adhocCount += g._count._all
    else row.sprintCount += g._count._all
    byUser.set(g.assignedToId, row)
  }

  const userIds = [...byUser.keys()].filter((id): id is string => id !== null)
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatarUrl: true } })
    : []
  const userById = new Map(users.map((u) => [u.id, u]))

  return [...byUser.entries()]
    .map(([userId, counts]) => ({
      userId,
      name: userId ? (userById.get(userId)?.name ?? '?') : '',
      avatarUrl: userId ? (userById.get(userId)?.avatarUrl ?? null) : null,
      ...counts,
    }))
    .sort((a, b) => b.openCount - a.openCount)
}

export interface MilestoneReadiness {
  done: number
  total: number
}

/**
 * 3.7 R4/R14 — per open-milestone readiness. Tickets are bucketed by `dueDate`
 * into the window (previousOpenMilestoneDate, thisMilestoneDate] (the first
 * window opens at -∞); `total` counts non-archived, non-CANCELLED tickets in the
 * window, `done` those that are DONE. Returned keyed by milestone id.
 */
export async function milestoneReadiness(projectId: string): Promise<Map<string, MilestoneReadiness>> {
  const out = new Map<string, MilestoneReadiness>()
  const milestones = await prisma.milestone.findMany({
    where: { projectId, done: false },
    orderBy: { date: 'asc' },
    select: { id: true, date: true },
  })
  if (milestones.length === 0) return out

  const tickets = await prisma.ticket.findMany({
    where: { projectId, archivedAt: null, status: { not: 'CANCELLED' }, dueDate: { not: null } },
    select: { status: true, dueDate: true },
  })

  let lower = -Infinity
  for (const m of milestones) {
    const upper = m.date.getTime()
    let total = 0
    let done = 0
    for (const t of tickets) {
      const due = t.dueDate!.getTime()
      if (due > lower && due <= upper) {
        total += 1
        if (t.status === 'DONE') done += 1
      }
    }
    out.set(m.id, { done, total })
    lower = upper
  }
  return out
}

/** 3.7 R14 — open milestones with their due-date readiness (reuses milestoneReadiness). */
async function readinessReport(projectId: string): Promise<ReadinessMilestone[]> {
  const [map, milestones] = await Promise.all([
    milestoneReadiness(projectId),
    prisma.milestone.findMany({ where: { projectId, done: false }, orderBy: { date: 'asc' }, select: { id: true, name: true, date: true } }),
  ])
  return milestones.map((m) => ({ id: m.id, name: m.name, date: m.date.toISOString(), ...(map.get(m.id) ?? { done: 0, total: 0 }) }))
}

export async function projectReports(projectId: string): Promise<ProjectReports> {
  const [velocity, cycle, workload, readiness, statusGroups] = await Promise.all([
    velocityReport(projectId),
    cycleReport(projectId),
    workloadReport(projectId),
    readinessReport(projectId),
    prisma.ticket.groupBy({ by: ['status'], where: { projectId, archivedAt: null }, _count: { _all: true } }),
  ])
  let done = 0
  let open = 0
  for (const g of statusGroups) {
    if (g.status === 'DONE') done += g._count._all
    else if (g.status !== 'CANCELLED') open += g._count._all
  }
  return { velocity, cycle, workload, readiness, overall: { done, open } }
}
