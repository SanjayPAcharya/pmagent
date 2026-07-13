import { describe, it, expect } from 'vitest'
import { composeEditedDraft, isDraftEdited } from './aiDraftEdit'
import type { AITicketDraft } from './api'

const base: AITicketDraft = {
  title: 'Add SLA dashboard',
  description: 'Dashboard showing breach risk per queue.',
  acceptanceCriteria: ['Shows risk per queue', 'Sends alerts on breach', 'Filterable by date'],
  priority: 'MEDIUM',
}
const pristine = { title: base.title, description: base.description, priority: base.priority }

describe('composeEditedDraft', () => {
  it('composes the edited values and drops unchecked AC bullets', () => {
    const out = composeEditedDraft(
      base,
      { title: 'SLA breach dashboard', description: 'Edited description.', priority: 'HIGH' },
      [true, false, true],
    )
    expect(out).toEqual({
      title: 'SLA breach dashboard',
      description: 'Edited description.',
      priority: 'HIGH',
      acceptanceCriteria: ['Shows risk per queue', 'Filterable by date'],
    })
  })

  it('falls back to the generated title when the edit blanks it out', () => {
    expect(composeEditedDraft(base, { ...pristine, title: '   ' }, [true, true, true]).title).toBe(base.title)
  })
})

describe('isDraftEdited', () => {
  it('is false for a pristine copy (regenerate needs no confirm)', () => {
    expect(isDraftEdited(base, pristine, [true, true, true])).toBe(false)
  })

  it('is true on any field edit or unchecked bullet', () => {
    expect(isDraftEdited(base, { ...pristine, title: 'x' }, [true, true, true])).toBe(true)
    expect(isDraftEdited(base, { ...pristine, priority: 'LOW' }, [true, true, true])).toBe(true)
    expect(isDraftEdited(base, pristine, [true, false, true])).toBe(true)
  })
})
