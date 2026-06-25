import type { Member, Priority, Sprint } from './api'

// D3 — Linear-style natural quick-create. Parses a one-line query like
//   "Fix login bug !high @sanjay #sprint2"
// into title + priority/assignee/sprint. Tokens that don't resolve are left in
// the title so nothing is silently dropped.
const PRIORITY_WORDS: Record<string, Priority> = {
  urgent: 'URGENT',
  u: 'URGENT',
  high: 'HIGH',
  h: 'HIGH',
  medium: 'MEDIUM',
  med: 'MEDIUM',
  m: 'MEDIUM',
  low: 'LOW',
  l: 'LOW',
}

export interface ParsedQuickCreate {
  title: string
  priority?: Priority
  assignedToId?: string
  assigneeName?: string
  sprintId?: string
  sprintName?: string
}

export function parseQuickCreate(input: string, ctx: { members: Member[]; sprints: Sprint[] }): ParsedQuickCreate {
  let title = input
  const result: ParsedQuickCreate = { title: '' }

  // !priority
  const pm = input.match(/(^|\s)!([a-z]+)\b/i)
  if (pm) {
    const prio = PRIORITY_WORDS[pm[2].toLowerCase()]
    if (prio) {
      result.priority = prio
      title = title.replace(pm[0], ' ')
    }
  }

  // @assignee — match a member by name-without-spaces, any name word prefix, or email local part
  const am = input.match(/(^|\s)@([\w.-]+)/)
  if (am) {
    const tok = am[2].toLowerCase()
    const m = ctx.members.find(
      (mm) =>
        mm.name.toLowerCase().replace(/\s+/g, '').includes(tok) ||
        mm.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(tok)) ||
        mm.email.toLowerCase().startsWith(tok),
    )
    if (m) {
      result.assignedToId = m.userId
      result.assigneeName = m.name
      title = title.replace(am[0], ' ')
    }
  }

  // #sprint
  const sm = input.match(/(^|\s)#([\w.-]+)/)
  if (sm) {
    const tok = sm[2].toLowerCase()
    const s = ctx.sprints.find((ss) => ss.name.toLowerCase().replace(/\s+/g, '').includes(tok))
    if (s) {
      result.sprintId = s.id
      result.sprintName = s.name
      title = title.replace(sm[0], ' ')
    }
  }

  result.title = title.replace(/\s+/g, ' ').trim()
  return result
}
