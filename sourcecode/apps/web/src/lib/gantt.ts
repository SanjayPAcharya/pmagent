// 3.7 R6 — pure Gantt date math. NO React, NO local-time Date anything: every
// function works on **UTC day numbers** (whole days since the Unix epoch), so
// DST and the user's timezone can never shift a bar or a tick. Isolated here and
// unit-tested before any UI exists (this module is the risky part of the Gantt).

const MS_PER_DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type GanttScale = 'day' | 'week' | 'month'
export const PX_PER_DAY: Record<GanttScale, number> = { day: 36, week: 12, month: 3 }

export interface GanttBar {
  startDay: number
  endDay: number
}
export interface GanttTick {
  day: number
  label: string
  major: boolean
}
export interface GanttDates {
  startDate: string | null
  dueDate: string | null
}

/** ISO datetime → UTC day number (calendar day, time-of-day discarded). */
export function toDayNum(iso: string): number {
  const d = new Date(iso)
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / MS_PER_DAY)
}

/** UTC day number → ISO datetime at UTC midnight. */
export function dayNumToISO(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString()
}

/** Pixel offset of a day from the range start, at the given scale. */
export function xForDay(day: number, rangeStartDay: number, scale: GanttScale): number {
  return (day - rangeStartDay) * PX_PER_DAY[scale]
}

/** Inverse of xForDay — a pixel offset back to the nearest day. */
export function dayForX(x: number, rangeStartDay: number, scale: GanttScale): number {
  return rangeStartDay + Math.round(x / PX_PER_DAY[scale])
}

/** Guarantee startDay <= endDay (swap-free min/max). */
export function clampBar(startDay: number, endDay: number): GanttBar {
  return { startDay: Math.min(startDay, endDay), endDay: Math.max(startDay, endDay) }
}

/**
 * Bar span for a ticket. null when it has neither date. Due-only ⇒ a 1-day bar
 * on the due date; start-only ⇒ a 1-day bar on the start date; both ⇒ the span
 * (already validated start <= due server-side, but clamped defensively).
 */
export function barForTicket(t: GanttDates): GanttBar | null {
  const s = t.startDate ? toDayNum(t.startDate) : null
  const d = t.dueDate ? toDayNum(t.dueDate) : null
  if (s === null && d === null) return null
  if (s !== null && d !== null) return clampBar(s, d)
  const only = (s ?? d)!
  return { startDay: only, endDay: only }
}

/**
 * Visible day range: min/max across all ticket bars + milestone dates, padded 7
 * days each side and always containing today. Empty data ⇒ [today-7, today+21].
 */
export function computeRange(
  items: GanttDates[],
  milestones: { date: string }[],
  todayDay: number,
): GanttBar {
  const marks: number[] = []
  for (const it of items) {
    const bar = barForTicket(it)
    if (bar) marks.push(bar.startDay, bar.endDay)
  }
  for (const m of milestones) marks.push(toDayNum(m.date))
  if (marks.length === 0) return { startDay: todayDay - 7, endDay: todayDay + 21 }
  return {
    startDay: Math.min(todayDay, ...marks) - 7,
    endDay: Math.max(todayDay, ...marks) + 7,
  }
}

const dayMonthLabel = (day: number) => {
  const d = new Date(day * MS_PER_DAY)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
const monthYearLabel = (day: number) => {
  const d = new Date(day * MS_PER_DAY)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
const isMonday = (day: number) => new Date(day * MS_PER_DAY).getUTCDay() === 1
const isFirstOfMonth = (day: number) => new Date(day * MS_PER_DAY).getUTCDate() === 1

/**
 * Axis ticks for the range. day: every day (major on Mondays, "4 Jul"); week:
 * each Monday ("4 Jul"); month: each 1st ("Jul 2026"). All UTC — a DST boundary
 * is a non-event.
 */
export function ticks(rangeStartDay: number, rangeEndDay: number, scale: GanttScale): GanttTick[] {
  const out: GanttTick[] = []
  if (scale === 'day') {
    for (let d = rangeStartDay; d <= rangeEndDay; d++) out.push({ day: d, label: dayMonthLabel(d), major: isMonday(d) })
    return out
  }
  if (scale === 'week') {
    let d = rangeStartDay
    while (d <= rangeEndDay && !isMonday(d)) d++
    for (; d <= rangeEndDay; d += 7) out.push({ day: d, label: dayMonthLabel(d), major: true })
    return out
  }
  // month
  let d = rangeStartDay
  while (d <= rangeEndDay && !isFirstOfMonth(d)) d++
  while (d <= rangeEndDay) {
    out.push({ day: d, label: monthYearLabel(d), major: true })
    const dt = new Date(d * MS_PER_DAY)
    d = Math.floor(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / MS_PER_DAY)
  }
  return out
}

export interface GanttHeaderSegment {
  startDay: number
  label: string
}
export interface GanttHeader {
  /** Top band: the grouping unit — month (day/week scales) or year (month scale). */
  primary: GanttHeaderSegment[]
  /** Bottom band: compact sub-ticks — day-of-month numbers, or short month names (month scale). */
  secondary: GanttTick[]
}

const dayNum = (day: number) => new Date(day * MS_PER_DAY).getUTCDate()

/**
 * TL3 — two-tier axis model for a cleaner header. The top band groups columns by
 * month (day/week) or year (month) so the eye reads "July" once instead of a
 * date on every column; the bottom band carries compact numbers/short months.
 * All UTC.
 */
export function ganttHeader(rangeStartDay: number, rangeEndDay: number, scale: GanttScale): GanttHeader {
  const secondary: GanttTick[] = []
  if (scale === 'day') {
    for (let d = rangeStartDay; d <= rangeEndDay; d++) secondary.push({ day: d, label: String(dayNum(d)), major: isMonday(d) })
  } else if (scale === 'week') {
    let d = rangeStartDay
    while (d <= rangeEndDay && !isMonday(d)) d++
    for (; d <= rangeEndDay; d += 7) secondary.push({ day: d, label: String(dayNum(d)), major: true })
  } else {
    let d = rangeStartDay
    while (d <= rangeEndDay && !isFirstOfMonth(d)) d++
    while (d <= rangeEndDay) {
      secondary.push({ day: d, label: MONTHS[new Date(d * MS_PER_DAY).getUTCMonth()], major: true })
      const dt = new Date(d * MS_PER_DAY)
      d = Math.floor(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / MS_PER_DAY)
    }
  }

  const primary: GanttHeaderSegment[] = []
  if (scale === 'month') {
    const startY = new Date(rangeStartDay * MS_PER_DAY).getUTCFullYear()
    const endY = new Date(rangeEndDay * MS_PER_DAY).getUTCFullYear()
    for (let y = startY; y <= endY; y++) {
      const yearStart = Math.floor(Date.UTC(y, 0, 1) / MS_PER_DAY)
      primary.push({ startDay: Math.max(yearStart, rangeStartDay), label: String(y) })
    }
  } else {
    const start = new Date(rangeStartDay * MS_PER_DAY)
    const end = new Date(rangeEndDay * MS_PER_DAY)
    const startYm = start.getUTCFullYear() * 12 + start.getUTCMonth()
    const endYm = end.getUTCFullYear() * 12 + end.getUTCMonth()
    for (let ym = startYm; ym <= endYm; ym++) {
      const yy = Math.floor(ym / 12)
      const mm = ym % 12
      const monthStart = Math.floor(Date.UTC(yy, mm, 1) / MS_PER_DAY)
      primary.push({ startDay: Math.max(monthStart, rangeStartDay), label: `${MONTHS[mm]} ${yy}` })
    }
  }
  return { primary, secondary }
}

export type DragKind = 'move' | 'resize-start' | 'resize-end'

/**
 * Apply a drag to a bar. 'move' shifts both edges; 'resize-start'/'resize-end'
 * move one edge but never past the other (a bar is at minimum 1 day).
 */
export function applyDrag(bar: GanttBar, kind: DragKind, deltaDays: number): GanttBar {
  if (kind === 'move') return { startDay: bar.startDay + deltaDays, endDay: bar.endDay + deltaDays }
  if (kind === 'resize-start') return { startDay: Math.min(bar.startDay + deltaDays, bar.endDay), endDay: bar.endDay }
  return { startDay: bar.startDay, endDay: Math.max(bar.endDay + deltaDays, bar.startDay) }
}

/** Default bar when an unscheduled ticket is dropped on `day`: a 3-day span. */
export function traySchedule(day: number): GanttBar {
  return { startDay: day, endDay: day + 2 }
}

export type EdgeRender =
  | { kind: 'arrow' } // both ends are scheduled bars — draw the connector
  | { kind: 'glyph'; onId: string; role: 'blocked' | 'blocks'; otherId: string } // one end off-chart
  | { kind: 'none' } // neither end is on the chart — nothing to anchor to

/**
 * B3 — how to render a dependency edge on the Timeline. `ticketId` is the
 * blocked ticket, `dependsOnId` the one it waits on. Both scheduled ⇒ an arrow.
 * Exactly one scheduled ⇒ a glyph on that scheduled bar: if the blocked ticket
 * is the scheduled one it is `blocked` (by an off-chart ticket); if the blocker
 * is scheduled it `blocks` an off-chart ticket. Neither scheduled ⇒ nothing to
 * draw on the chart (the tray shows those). This is what lets a dependency
 * touching an unscheduled ticket stay visible instead of silently vanishing.
 */
export function classifyEdge(
  edge: { ticketId: string; dependsOnId: string },
  isScheduled: (id: string) => boolean,
): EdgeRender {
  const blockedSched = isScheduled(edge.ticketId)
  const blockerSched = isScheduled(edge.dependsOnId)
  if (blockedSched && blockerSched) return { kind: 'arrow' }
  if (blockedSched) return { kind: 'glyph', onId: edge.ticketId, role: 'blocked', otherId: edge.dependsOnId }
  if (blockerSched) return { kind: 'glyph', onId: edge.dependsOnId, role: 'blocks', otherId: edge.ticketId }
  return { kind: 'none' }
}

export interface MilestoneViewport {
  /** ids of milestones whose diamond falls inside the horizontal viewport */
  visibleIds: string[]
  /** milestones scrolled out of view, and which way to scroll to reach them */
  offscreen: { id: string; dir: 'left' | 'right' }[]
}

/**
 * B2 — classify each milestone as visible in the horizontal viewport or
 * off-screen (and which direction), from the chart's scroll offset. Works in
 * the same pixel space as the chart (`xForDay`): a milestone counts as visible
 * when its diamond x is within `[scrollLeft, scrollLeft + clientWidth]`. Before
 * the container is measured (`clientWidth <= 0`) everything is treated as
 * visible, so no chip flashes a stale off-screen arrow on first paint.
 */
export function milestoneViewport(
  milestones: { id: string; date: string }[],
  rangeStartDay: number,
  scale: GanttScale,
  scrollLeft: number,
  clientWidth: number,
): MilestoneViewport {
  const visibleIds: string[] = []
  const offscreen: { id: string; dir: 'left' | 'right' }[] = []
  if (clientWidth <= 0) return { visibleIds: milestones.map((m) => m.id), offscreen }
  for (const m of milestones) {
    const x = xForDay(toDayNum(m.date), rangeStartDay, scale)
    if (x < scrollLeft) offscreen.push({ id: m.id, dir: 'left' })
    else if (x > scrollLeft + clientWidth) offscreen.push({ id: m.id, dir: 'right' })
    else visibleIds.push(m.id)
  }
  return { visibleIds, offscreen }
}
