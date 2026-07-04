import { describe, it, expect, vi } from 'vitest'

// CsvTools pulls in @/lib/api → @/lib/auth, which instantiates Keycloak at
// import time — stub it so the pure mapRows logic can be tested in isolation.
vi.mock('keycloak-js', () => ({
  default: class {
    token?: string
    updateToken() {
      return Promise.resolve(true)
    }
  },
}))

import { toCsv, parseCsv } from '@/lib/csv'
import { mapRows, SAMPLE_CSV_ROWS } from './CsvTools'

describe('mapRows', () => {
  it('round-trips the downloadable sample CSV', () => {
    const { rows, skipped } = mapRows(parseCsv(toCsv(SAMPLE_CSV_ROWS)))
    expect(skipped).toBe(0)
    expect(rows).toHaveLength(3)

    expect(rows[0]).toEqual({
      title: 'Set up the login page',
      description: 'Users can sign in with email, or Google',
      acceptanceCriteria: '- [ ] Form validates the email\n- [ ] Errors are shown inline',
      status: 'TODO',
      priority: 'HIGH',
      type: 'FEATURE',
      storyPoints: 3,
      labels: ['frontend', 'auth'],
      assignee: 'dev@example.com',
    })
    // Jira-ish aliases: "Task" → CHORE, "Backlog"/"Urgent" pass through the maps.
    expect(rows[1]).toMatchObject({ title: 'Fix crash on save', status: 'BACKLOG', priority: 'URGENT', type: 'BUG', labels: ['bug'] })
    expect(rows[2]).toMatchObject({ title: 'Update onboarding docs', status: 'IN_PROGRESS', priority: 'LOW', type: 'CHORE' })
    expect(rows[2].description).toBeUndefined()
    expect(rows[2].labels).toBeUndefined()
    expect(rows[2].assignee).toBeUndefined()
  })

  it('accepts Jira header aliases (Summary / Issue Type / Points)', () => {
    const { rows } = mapRows([
      ['Summary', 'Issue Type', 'Points'],
      ['Imported from Jira', 'Story', '5'],
    ])
    expect(rows[0]).toMatchObject({ title: 'Imported from Jira', type: 'FEATURE', storyPoints: 5 })
  })

  it('skips rows without a title and counts them', () => {
    const { rows, skipped } = mapRows([
      ['Title'],
      [''],
      ['  '],
      ['Kept'],
    ])
    expect(rows.map((r) => r.title)).toEqual(['Kept'])
    expect(skipped).toBe(2)
  })

  it('drops unrecognized enum values instead of failing', () => {
    const { rows } = mapRows([
      ['Title', 'Status', 'Priority', 'Type', 'Story Points'],
      ['Odd values', 'Someday', 'ASAP', 'Epic', '-2'],
    ])
    expect(rows[0]).toEqual({
      title: 'Odd values',
      description: undefined,
      acceptanceCriteria: undefined,
      status: undefined,
      priority: undefined,
      type: undefined,
      storyPoints: undefined,
    })
  })

  it('splits Labels on ";" and accepts Assignee aliases', () => {
    const { rows } = mapRows([
      ['Title', 'Label', 'Assigned To'],
      ['With extras', ' backend ;; auth ', 'Jane Doe'],
    ])
    expect(rows[0].labels).toEqual(['backend', 'auth'])
    expect(rows[0].assignee).toBe('Jane Doe')
  })

  it('truncates titles to 200 chars and caps at 500 rows', () => {
    const long = 'x'.repeat(300)
    const grid = [['Title'], [long], ...Array.from({ length: 600 }, (_, i) => [`t${i}`])]
    const { rows } = mapRows(grid)
    expect(rows[0].title).toHaveLength(200)
    expect(rows).toHaveLength(500)
  })
})
