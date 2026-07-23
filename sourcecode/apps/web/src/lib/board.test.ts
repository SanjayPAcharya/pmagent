import { describe, it, expect } from 'vitest'
import { workstreamForTab } from './board'

// B5 — every board create path (quick-add, template, AI draft) must inherit the
// workstream from the active tab: ad-hoc on the Ad-hoc tab, server default
// otherwise. Guards the finding-7 regression (template creates landed in the
// sprint-work backlog even on the Ad-hoc tab).
describe('workstreamForTab (3.8.4 B5)', () => {
  it('creates ad-hoc tickets on the Ad-hoc tab', () => {
    expect(workstreamForTab('ADHOC')).toBe('ADHOC')
  })

  it('leaves the workstream to the server default on other tabs', () => {
    expect(workstreamForTab('all')).toBeUndefined()
    expect(workstreamForTab('SPRINT')).toBeUndefined()
  })
})
