// D2 — lightweight frecency (frequency + recency) for the command palette.
// Records ticket/project visits in localStorage and surfaces the most relevant
// before the user types. No backend.
export type FrecencyKind = 'ticket' | 'project'

export interface FrecencyEntry {
  key: string // stable id (ticket id, project id)
  label: string
  href: string
  meta?: string // e.g. ticket key or project subtitle
  count: number
  lastAt: number
}

const MAX = 8
const storageKey = (k: FrecencyKind) => `agentpm-frecency-${k}`

function read(kind: FrecencyKind): FrecencyEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(kind))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Recency decays with age; frequency adds up. Tunable but deliberately simple.
function score(e: FrecencyEntry, now: number): number {
  const ageHours = (now - e.lastAt) / 3_600_000
  return e.count + 4 / (1 + ageHours)
}

export function recordVisit(kind: FrecencyKind, item: Omit<FrecencyEntry, 'count' | 'lastAt'>): void {
  const now = Date.now()
  const entries = read(kind)
  const existing = entries.find((e) => e.key === item.key)
  if (existing) {
    existing.count += 1
    existing.lastAt = now
    existing.label = item.label
    existing.href = item.href
    existing.meta = item.meta
  } else {
    entries.push({ ...item, count: 1, lastAt: now })
  }
  entries.sort((a, b) => score(b, now) - score(a, now))
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(entries.slice(0, MAX)))
  } catch {
    /* storage full / disabled — frecency is best-effort */
  }
}

export function getRecent(kind: FrecencyKind, limit = 5): FrecencyEntry[] {
  const now = Date.now()
  return read(kind)
    .sort((a, b) => score(b, now) - score(a, now))
    .slice(0, limit)
}
