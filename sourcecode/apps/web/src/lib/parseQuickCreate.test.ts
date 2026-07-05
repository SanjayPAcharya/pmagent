import { describe, it, expect } from 'vitest'
import { parseQuickCreate } from './parseQuickCreate'
import type { Member, Sprint } from './api'

const members = [
  { userId: 'u1', name: 'Sanjay Kumar', email: 'sanjay@x.com', avatarUrl: null, initials: 'SK', role: 'OWNER' },
] as unknown as Member[]
const sprints = [{ id: 's2', name: 'Sprint 2' }] as unknown as Sprint[]

describe('parseQuickCreate — token → chip preview (3.7 R9)', () => {
  it('extracts priority, assignee, and sprint, leaving a clean title', () => {
    const p = parseQuickCreate('Fix cache !high @sanjay #Sprint2', { members, sprints })
    expect(p.title).toBe('Fix cache')
    expect(p.priority).toBe('HIGH')
    expect(p.assignedToId).toBe('u1')
    expect(p.assigneeName).toBe('Sanjay Kumar')
    expect(p.sprintId).toBe('s2')
    expect(p.sprintName).toBe('Sprint 2')
  })

  it('leaves unresolved tokens in the title (nothing silently dropped)', () => {
    const p = parseQuickCreate('Ship it @nobody #ghost', { members, sprints })
    expect(p.title).toBe('Ship it @nobody #ghost')
    expect(p.assignedToId).toBeUndefined()
    expect(p.sprintId).toBeUndefined()
  })

  it('maps priority shorthands', () => {
    expect(parseQuickCreate('a !u', { members, sprints }).priority).toBe('URGENT')
    expect(parseQuickCreate('b !l', { members, sprints }).priority).toBe('LOW')
    expect(parseQuickCreate('c', { members, sprints }).priority).toBeUndefined()
  })
})
