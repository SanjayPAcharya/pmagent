import { describe, it, expect } from 'vitest'
import { buildReviewFields, composeAccepted, defaultAccepts, setAllAccepts, type ExpandValues } from './aiExpandReview'
import type { AIExpandDraft } from './api'

const draft: AIExpandDraft = {
  description: 'A fuller description of the work.',
  goal: 'Ship the CSAT survey.',
  acceptanceCriteria: ['Email sent on close', 'One-click rating link'],
  constraints: 'GDPR compliant.',
}
const empty: ExpandValues = { description: '', goal: '', ac: '', constraints: '' }
const acText = '- Email sent on close\n- One-click rating link'

describe('buildReviewFields', () => {
  it('pre-accepts every field when the ticket is empty (no conflicts)', () => {
    const fields = buildReviewFields(empty, draft)
    expect(fields.map((f) => f.key)).toEqual(['description', 'goal', 'ac', 'constraints'])
    expect(fields.every((f) => f.defaultAccept && !f.conflict)).toBe(true)
    expect(fields.find((f) => f.key === 'ac')!.proposed).toBe(acText)
  })

  it('marks filled fields as conflicts that default to keep-current', () => {
    const current: ExpandValues = { ...empty, description: 'Existing text', goal: 'Existing goal' }
    const fields = buildReviewFields(current, draft)
    const desc = fields.find((f) => f.key === 'description')!
    expect(desc.conflict).toBe(true)
    expect(desc.defaultAccept).toBe(false)
    expect(fields.find((f) => f.key === 'constraints')!.conflict).toBe(false)
  })

  it('skips fields the AI left empty (nothing to accept)', () => {
    const thin: AIExpandDraft = { description: 'only this', goal: '', acceptanceCriteria: [], constraints: '   ' }
    expect(buildReviewFields(empty, thin).map((f) => f.key)).toEqual(['description'])
  })
})

describe('composeAccepted', () => {
  it('applies accepted proposals and keeps current for the rest', () => {
    const current: ExpandValues = { description: 'keep me', goal: '', ac: '', constraints: 'keep too' }
    const fields = buildReviewFields(current, draft)
    // Empty goal + ac pre-accepted; description + constraints are conflicts (kept).
    const out = composeAccepted(current, draft, defaultAccepts(fields))
    expect(out).toEqual({ description: 'keep me', goal: 'Ship the CSAT survey.', ac: acText, constraints: 'keep too' })
  })

  it('accept-all overwrites conflicts; keep-all reverts to current', () => {
    const current: ExpandValues = { description: 'old d', goal: 'old g', ac: 'old ac', constraints: 'old c' }
    const fields = buildReviewFields(current, draft)
    expect(composeAccepted(current, draft, setAllAccepts(fields, true))).toEqual({
      description: draft.description,
      goal: draft.goal,
      ac: acText,
      constraints: draft.constraints,
    })
    expect(composeAccepted(current, draft, setAllAccepts(fields, false))).toEqual(current)
  })

  it('never blanks a field whose proposal was empty, even if somehow accepted', () => {
    const thin: AIExpandDraft = { description: '', goal: 'g', acceptanceCriteria: [], constraints: '' }
    const current: ExpandValues = { description: 'keep', goal: '', ac: 'keep ac', constraints: 'keep c' }
    const out = composeAccepted(current, thin, { description: true, goal: true, ac: true, constraints: true })
    expect(out).toEqual({ description: 'keep', goal: 'g', ac: 'keep ac', constraints: 'keep c' })
  })
})
