import type { Priority, TicketStatus } from './api'

// Columns shown on the kanban (CANCELLED is reachable from the drawer only).
export const BOARD_COLUMNS: TicketStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE']

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
export const STATUS_COLOR: Record<TicketStatus, string> = {
  BACKLOG: '#94a3b8', // slate-400
  TODO: '#64748b', // slate-500
  IN_PROGRESS: '#3b82f6', // blue-500
  IN_REVIEW: '#a855f7', // purple-500
  BLOCKED: '#ef4444', // red-500
  DONE: '#10b981', // emerald-500
  CANCELLED: '#6b7280', // gray-500
}

export const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

export const PRIORITY_CLASS: Record<Priority, string> = {
  URGENT: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-slate-100 text-slate-600',
}
