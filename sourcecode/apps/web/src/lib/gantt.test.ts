import { describe, it, expect } from 'vitest'
import {
  toDayNum,
  dayNumToISO,
  xForDay,
  dayForX,
  barForTicket,
  clampBar,
  computeRange,
  ticks,
  applyDrag,
  traySchedule,
  milestoneViewport,
  classifyEdge,
  PX_PER_DAY,
  type GanttScale,
} from './gantt'

const SCALES: GanttScale[] = ['day', 'week', 'month']

describe('gantt date math (3.7 R6)', () => {
  it('round-trips toDayNum / dayNumToISO', () => {
    for (const iso of ['2026-07-04T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z']) {
      expect(dayNumToISO(toDayNum(iso))).toBe(iso)
      expect(toDayNum(dayNumToISO(toDayNum(iso)))).toBe(toDayNum(iso))
    }
    // Time-of-day is discarded — same calendar day maps to the same number.
    expect(toDayNum('2026-07-04T23:59:59.000Z')).toBe(toDayNum('2026-07-04T00:00:00.000Z'))
    // Consecutive days differ by exactly 1.
    expect(toDayNum('2026-07-05T00:00:00.000Z') - toDayNum('2026-07-04T00:00:00.000Z')).toBe(1)
  })

  it('xForDay and dayForX are inverses at every scale', () => {
    const rangeStart = toDayNum('2026-06-01T00:00:00.000Z')
    for (const scale of SCALES) {
      for (const day of [rangeStart, rangeStart + 5, rangeStart + 33, rangeStart + 200]) {
        expect(dayForX(xForDay(day, rangeStart, scale), rangeStart, scale)).toBe(day)
      }
      expect(xForDay(rangeStart + 1, rangeStart, scale)).toBe(PX_PER_DAY[scale])
    }
  })

  it('derives bars for the four date combinations', () => {
    const s = '2026-07-04T00:00:00.000Z'
    const d = '2026-07-10T00:00:00.000Z'
    expect(barForTicket({ startDate: null, dueDate: null })).toBeNull()
    expect(barForTicket({ startDate: null, dueDate: d })).toEqual({ startDay: toDayNum(d), endDay: toDayNum(d) })
    expect(barForTicket({ startDate: s, dueDate: null })).toEqual({ startDay: toDayNum(s), endDay: toDayNum(s) })
    expect(barForTicket({ startDate: s, dueDate: d })).toEqual({ startDay: toDayNum(s), endDay: toDayNum(d) })
    // Inverted input is clamped, never inverted.
    expect(barForTicket({ startDate: d, dueDate: s })).toEqual({ startDay: toDayNum(s), endDay: toDayNum(d) })
    expect(clampBar(10, 3)).toEqual({ startDay: 3, endDay: 10 })
  })

  it('computes a padded range that always contains today; empty data uses the default window', () => {
    const today = toDayNum('2026-07-15T00:00:00.000Z')
    // Empty ⇒ [today-7, today+21].
    expect(computeRange([], [], today)).toEqual({ startDay: today - 7, endDay: today + 21 })

    const items = [{ startDate: '2026-07-20T00:00:00.000Z', dueDate: '2026-07-25T00:00:00.000Z' }]
    const milestones = [{ date: '2026-08-01T00:00:00.000Z' }]
    const r = computeRange(items, milestones, today)
    expect(r.startDay).toBe(today - 7) // today is the earliest mark, padded 7
    expect(r.endDay).toBe(toDayNum('2026-08-01T00:00:00.000Z') + 7) // latest mark padded 7
    expect(r.startDay).toBeLessThanOrEqual(today)
    expect(r.endDay).toBeGreaterThanOrEqual(today)

    // All-future data still pulls today into range.
    const future = computeRange([{ startDate: '2027-01-01T00:00:00.000Z', dueDate: '2027-01-05T00:00:00.000Z' }], [], today)
    expect(future.startDay).toBe(today - 7)
  })

  it('generates contiguous day ticks with Mondays as majors', () => {
    const start = toDayNum('2026-07-01T00:00:00.000Z') // Wed
    const end = toDayNum('2026-07-14T00:00:00.000Z')
    const t = ticks(start, end, 'day')
    // One tick per day, strictly increasing by 1, no gaps or dupes.
    expect(t).toHaveLength(14)
    for (let i = 1; i < t.length; i++) expect(t[i].day - t[i - 1].day).toBe(1)
    // 2026-07-06 is a Monday.
    const monday = t.find((x) => x.day === toDayNum('2026-07-06T00:00:00.000Z'))!
    expect(monday.major).toBe(true)
    expect(monday.label).toBe('6 Jul')
    expect(t.find((x) => x.day === toDayNum('2026-07-07T00:00:00.000Z'))!.major).toBe(false)
  })

  it('week ticks land on Mondays; month ticks on the 1st', () => {
    const weekly = ticks(toDayNum('2026-07-01T00:00:00.000Z'), toDayNum('2026-07-31T00:00:00.000Z'), 'week')
    expect(weekly.every((x) => new Date(x.day * 86_400_000).getUTCDay() === 1)).toBe(true)
    expect(weekly.every((x) => x.major)).toBe(true)

    const monthly = ticks(toDayNum('2026-06-15T00:00:00.000Z'), toDayNum('2026-09-15T00:00:00.000Z'), 'month')
    expect(monthly.map((x) => x.label)).toEqual(['Jul 2026', 'Aug 2026', 'Sep 2026'])
  })

  it('is unaffected by a DST boundary (all UTC)', () => {
    // Late-March DST change in many zones — UTC day math must stay contiguous.
    const t = ticks(toDayNum('2026-03-27T00:00:00.000Z'), toDayNum('2026-03-31T00:00:00.000Z'), 'day')
    expect(t.map((x) => x.day)).toEqual([27, 28, 29, 30, 31].map((d) => toDayNum(`2026-03-${d}T00:00:00.000Z`)))
    for (let i = 1; i < t.length; i++) expect(t[i].day - t[i - 1].day).toBe(1)
  })

  it('applies drags with edge-aware clamping', () => {
    const bar = { startDay: 100, endDay: 110 }
    // Move preserves width.
    expect(applyDrag(bar, 'move', 5)).toEqual({ startDay: 105, endDay: 115 })
    expect(applyDrag(bar, 'move', -20)).toEqual({ startDay: 80, endDay: 90 })
    // Resize edges move independently.
    expect(applyDrag(bar, 'resize-start', -3)).toEqual({ startDay: 97, endDay: 110 })
    expect(applyDrag(bar, 'resize-end', 4)).toEqual({ startDay: 100, endDay: 114 })
    // Neither edge can cross the other (min 1-day bar).
    expect(applyDrag(bar, 'resize-start', 999)).toEqual({ startDay: 110, endDay: 110 })
    expect(applyDrag(bar, 'resize-end', -999)).toEqual({ startDay: 100, endDay: 100 })
  })

  it('schedules a dropped tray ticket as a 3-day bar', () => {
    expect(traySchedule(200)).toEqual({ startDay: 200, endDay: 202 })
    const b = traySchedule(200)
    expect(b.endDay - b.startDay + 1).toBe(3)
  })

  it('classifies milestones by horizontal viewport (B2)', () => {
    // day scale ⇒ x = day * 36. Range starts at day 0.
    const ms = [
      { id: 'a', date: dayNumToISO(2) }, //   x = 72  (left of window)
      { id: 'b', date: dayNumToISO(100) }, // x = 3600 (right of window)
      { id: 'c', date: dayNumToISO(5) }, //   x = 180 (inside window)
    ]
    const vp = milestoneViewport(ms, 0, 'day', 100, 200) // visible x ∈ [100, 300]
    expect(vp.visibleIds).toEqual(['c'])
    expect(vp.offscreen).toEqual([
      { id: 'a', dir: 'left' },
      { id: 'b', dir: 'right' },
    ])
    // Before the container is measured, everything counts as visible (no arrows).
    const pre = milestoneViewport(ms, 0, 'day', 0, 0)
    expect(pre.visibleIds).toEqual(['a', 'b', 'c'])
    expect(pre.offscreen).toEqual([])
  })

  it('classifies dependency edges by which ends are scheduled (B3)', () => {
    const sched = new Set(['s1', 's2'])
    const isSched = (id: string) => sched.has(id)
    // both scheduled → arrow
    expect(classifyEdge({ ticketId: 's1', dependsOnId: 's2' }, isSched)).toEqual({ kind: 'arrow' })
    // blocked ticket scheduled, blocker off-chart → glyph on the blocked bar
    expect(classifyEdge({ ticketId: 's1', dependsOnId: 'u9' }, isSched)).toEqual({
      kind: 'glyph',
      onId: 's1',
      role: 'blocked',
      otherId: 'u9',
    })
    // blocker scheduled, blocked ticket off-chart → glyph on the blocker bar
    expect(classifyEdge({ ticketId: 'u9', dependsOnId: 's2' }, isSched)).toEqual({
      kind: 'glyph',
      onId: 's2',
      role: 'blocks',
      otherId: 'u9',
    })
    // neither on the chart → nothing to draw
    expect(classifyEdge({ ticketId: 'u8', dependsOnId: 'u9' }, isSched)).toEqual({ kind: 'none' })
  })
})
