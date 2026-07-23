import type { Priority, TicketStatus, Workstream } from './api'

// Columns shown on the kanban (CANCELLED is reachable from the drawer only).
export const BOARD_COLUMNS: TicketStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE']

// B5 — a new ticket inherits the board's workstream tab: created ad-hoc on the
// Ad-hoc tab, otherwise left to the server default (sprint-work). Shared by every
// board create path (quick-add, template, AI draft) so they all behave the same.
export type WorkstreamTab = 'all' | 'SPRINT' | 'ADHOC'
export function workstreamForTab(wsTab: WorkstreamTab): Workstream | undefined {
  return wsTab === 'ADHOC' ? 'ADHOC' : undefined
}

export const ALL_STATUSES: TicketStatus[] = [...BOARD_COLUMNS, 'CANCELLED']

export const STATUS_LABEL: Record<TicketStatus, string> = {
  BACKLOG: 'Backlog',
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  BLOCKED: 'Blocked',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
}

// B2 — soft WIP limits: a column header pulses amber when its count exceeds the
// limit. Flow discipline with zero config beyond a number. Columns not listed
// are unlimited.
export const WIP_LIMITS: Partial<Record<TicketStatus, number>> = {
  IN_PROGRESS: 3,
  IN_REVIEW: 3,
}

// 3.7 R7 — fixed status hues for SVG fills (Gantt bars). Read on light + dark.
// The four chromatic states are CVD-validated all-pairs on both surfaces;
// not-started/cancelled stay neutral so active work carries the color.
export const STATUS_COLOR: Record<TicketStatus, string> = {
  BACKLOG: '#94a3b8', // neutral — not committed
  TODO: '#64748b', // neutral, one step firmer
  IN_PROGRESS: '#2a78d6', // blue
  IN_REVIEW: '#c98500', // gold — waiting on someone
  BLOCKED: '#e34948', // red
  DONE: '#1baf7a', // green
  CANCELLED: '#cbd5e1', // recedes to the surface
}

export const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

export const PRIORITY_CLASS: Record<Priority, string> = {
  URGENT: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-slate-100 text-slate-600',
}
