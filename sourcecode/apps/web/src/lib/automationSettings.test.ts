import { describe, it, expect } from 'vitest'
import { resolveAutomation } from './automationSettings'

describe('resolveAutomation', () => {
  it('defaults: unblockNudge on, opt-ins off', () => {
    expect(resolveAutomation(null)).toEqual({
      unblockNudge: true,
      autoTodoOnAssign: false,
      subtasksDoneNudge: false,
    })
    expect(resolveAutomation(undefined)).toEqual(resolveAutomation({}))
  })

  it('respects explicit values', () => {
    expect(resolveAutomation({ unblockNudge: false, autoTodoOnAssign: true, subtasksDoneNudge: true })).toEqual({
      unblockNudge: false,
      autoTodoOnAssign: true,
      subtasksDoneNudge: true,
    })
  })

  it('merges partial settings over the defaults', () => {
    expect(resolveAutomation({ subtasksDoneNudge: true })).toEqual({
      unblockNudge: true,
      autoTodoOnAssign: false,
      subtasksDoneNudge: true,
    })
  })
})
