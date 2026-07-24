import { describe, it, expect } from 'vitest'
import { applyGanttVarMap, ganttRowsToCsv, type GanttCsvLookups } from './ganttExport'
import type { GanttItem } from './api'

describe('applyGanttVarMap', () => {
  it('substitutes every var(--x) with its mapped value', () => {
    const svg = '<rect fill="hsl(var(--primary))" stroke="hsl(var(--border))"/><rect fill="hsl(var(--primary))"/>'
    const out = applyGanttVarMap(svg, { primary: '10 20% 30%', border: '0 0% 50%' })
    expect(out).toBe('<rect fill="hsl(10 20% 30%)" stroke="hsl(0 0% 50%)"/><rect fill="hsl(10 20% 30%)"/>')
  })
  it('leaves unknown or empty vars untouched', () => {
    const svg = '<rect fill="hsl(var(--primary))" stroke="hsl(var(--ring))"/>'
    const out = applyGanttVarMap(svg, { primary: '1 2% 3%', ring: '' })
    expect(out).toBe('<rect fill="hsl(1 2% 3%)" stroke="hsl(var(--ring))"/>')
  })
})

describe('ganttRowsToCsv', () => {
  const lk: GanttCsvLookups = {
    memberName: { u1: 'Ada Lovelace' },
    sprintName: { s1: 'Sprint 1' },
    milestoneName: { m1: 'GA' },
  }
  const base: GanttItem = {
    id: 't1', number: 1, key: 'NEW-1', title: 'First', status: 'IN_PROGRESS', priority: 'HIGH',
    assignedToId: 'u1', sprintId: 's1', milestoneId: 'm1', workstream: 'SPRINT',
    startDate: '2026-07-01T00:00:00.000Z', dueDate: '2026-07-10T00:00:00.000Z', storyPoints: 5, labelIds: [],
  }

  it('emits a header plus a fully-resolved row', () => {
    const rows = ganttRowsToCsv([base], lk)
    expect(rows[0]).toEqual(['Key', 'Title', 'Status', 'Priority', 'Assignee', 'Start', 'Due', 'Story Points', 'Sprint', 'Milestone', 'Workstream'])
    expect(rows[1]).toEqual(['NEW-1', 'First', 'IN_PROGRESS', 'HIGH', 'Ada Lovelace', '2026-07-01', '2026-07-10', '5', 'Sprint 1', 'GA', 'SPRINT'])
  })

  it('blanks unset fields (no dates, no assignee/sprint/milestone/points)', () => {
    const bare: GanttItem = { ...base, assignedToId: null, sprintId: null, milestoneId: null, startDate: null, dueDate: null, storyPoints: null }
    const rows = ganttRowsToCsv([bare], lk)
    expect(rows[1]).toEqual(['NEW-1', 'First', 'IN_PROGRESS', 'HIGH', '', '', '', '', '', '', 'SPRINT'])
  })
})
