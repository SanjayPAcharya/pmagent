import type { TicketStatus } from '@prisma/client'
import { prisma } from '../db/client.js'

// Aggregates for the Organizations + Projects redesign. Every function runs a
// small fixed number of grouped queries (no N+1), mirroring sprintCounts() in
// routes/sprints.ts. "Open" = not DONE and not CANCELLED. Archived tickets are
// always excluded.
const CLOSED: TicketStatus[] = ['DONE', 'CANCELLED']

export interface OrgListStat {
  projectCount: number
  memberCount: number
  openTicketCount: number
}

const emptyOrgStat = (): OrgListStat => ({ projectCount: 0, memberCount: 0, openTicketCount: 0 })

/** Counts for a caller's org list — 3 queries total regardless of org count. */
export async function orgListStats(orgIds: string[]): Promise<Map<string, OrgListStat>> {
  const out = new Map<string, OrgListStat>()
  if (orgIds.length === 0) return out
  for (const id of orgIds) out.set(id, emptyOrgStat())

  const [projects, members] = await Promise.all([
    prisma.project.findMany({ where: { orgId: { in: orgIds } }, select: { id: true, orgId: true } }),
    prisma.orgMember.groupBy({ by: ['orgId'], where: { orgId: { in: orgIds } }, _count: { _all: true } }),
  ])
  const projectToOrg = new Map(projects.map((p) => [p.id, p.orgId]))
  for (const p of projects) out.get(p.orgId)!.projectCount += 1
  for (const m of members) out.get(m.orgId)!.memberCount = m._count._all

  if (projects.length > 0) {
    const openByProject = await prisma.ticket.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projects.map((p) => p.id) }, archivedAt: null, status: { notIn: CLOSED } },
      _count: { _all: true },
    })
    for (const g of openByProject) {
      const orgId = projectToOrg.get(g.projectId)
      if (orgId) out.get(orgId)!.openTicketCount += g._count._all
    }
  }
  return out
}

export interface ActiveSprintSummary {
  id: string
  name: string
  endDate: Date | null
  total: number
  done: number
}
export interface ProjectListStat {
  openTicketCount: number
  byStatus: Partial<Record<TicketStatus, number>>
  activeSprint: ActiveSprintSummary | null
}

const emptyProjectStat = (): ProjectListStat => ({ openTicketCount: 0, byStatus: {}, activeSprint: null })

/** Per-project status breakdown + active-sprint progress — up to 3 grouped queries. */
export async function projectListStats(projectIds: string[]): Promise<Map<string, ProjectListStat>> {
  const out = new Map<string, ProjectListStat>()
  if (projectIds.length === 0) return out
  for (const id of projectIds) out.set(id, emptyProjectStat())

  const [ticketGroups, activeSprints] = await Promise.all([
    prisma.ticket.groupBy({
      by: ['projectId', 'status'],
      where: { projectId: { in: projectIds }, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.sprint.findMany({
      where: { projectId: { in: projectIds }, status: 'ACTIVE' },
      select: { id: true, projectId: true, name: true, endDate: true },
      orderBy: { startDate: 'asc' },
    }),
  ])

  for (const g of ticketGroups) {
    const stat = out.get(g.projectId)!
    stat.byStatus[g.status] = g._count._all
    if (!CLOSED.includes(g.status)) stat.openTicketCount += g._count._all
  }

  if (activeSprints.length > 0) {
    const sprintGroups = await prisma.ticket.groupBy({
      by: ['sprintId', 'status'],
      where: { sprintId: { in: activeSprints.map((s) => s.id) }, archivedAt: null },
      _count: { _all: true },
    })
    const bySprint = new Map<string, { total: number; done: number }>()
    for (const g of sprintGroups) {
      if (!g.sprintId) continue
      const c = bySprint.get(g.sprintId) ?? { total: 0, done: 0 }
      c.total += g._count._all
      if (g.status === 'DONE') c.done += g._count._all
      bySprint.set(g.sprintId, c)
    }
    // First active sprint per project (multiple active sprints is not expected).
    for (const s of activeSprints) {
      const stat = out.get(s.projectId)!
      if (stat.activeSprint) continue
      const c = bySprint.get(s.id) ?? { total: 0, done: 0 }
      stat.activeSprint = { id: s.id, name: s.name, endDate: s.endDate, total: c.total, done: c.done }
    }
  }
  return out
}
