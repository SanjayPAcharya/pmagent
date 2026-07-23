import {
  type MutableRefObject,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type DragEvent as ReactDragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { GanttItem, GanttEdge, Milestone } from '@/lib/api'
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/board'
import { useTranslation } from 'react-i18next'
import {
  applyDrag,
  barForTicket,
  classifyEdge,
  dayForX,
  ganttHeader,
  toDayNum,
  xForDay,
  PX_PER_DAY,
  type DragKind,
  type GanttBar,
  type GanttScale,
} from '@/lib/gantt'
import { cn } from '@/lib/utils'

/** B3 — key + title for every payload ticket, so an off-chart dependency end can be named. */
export type TicketMeta = Record<string, { key: string; title: string }>
/** Grouped row source (sprint / assignee / workstream). Order is render order. */
export interface GanttGroup {
  key: string
  label: string
  items: GanttItem[]
}
const DEP_GLYPH = 'hsl(var(--destructive))'

// 3.7 R7/R8 — presentational Gantt (hand-rolled <svg>, BurndownSparkline
// precedent) with pointer-driven drag (move / resize / milestone) layered on in
// R8. Date↔pixel math all comes from lib/gantt; persistence + undo live in the
// page via the callbacks. Scheduled items get a bar; when interactive,
// unscheduled items get a ghost row you draw a bar onto.

const ROW_H = 42
const HEADER_H = 40
const MILESTONE_LANE = 24
const RAIL_W = 240
const TOP = HEADER_H + MILESTONE_LANE
const BAR_H = 16
const MS_PER_DAY = 86_400_000
const HANDLE_W = 8 // resize hit target; only shown on bars wide enough for it
const EDGE_ZONE = 48 // px from the scroll container edge where drag auto-scroll kicks in
const DRAW_DEFAULT_DAYS = 3 // ghost-row hover hint length
const MIN_BAR_W = 7 // compressed scales: a 1-day ticket stays a visible pill, not a sliver

const isWeekend = (day: number) => {
  const dow = new Date(day * MS_PER_DAY).getUTCDay()
  return dow === 0 || dow === 6
}
const fmtDay = (day: number) =>
  new Date(day * MS_PER_DAY).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

type Row =
  | { kind: 'group'; key: string; label: string; count: number; span: GanttBar | null; collapsed: boolean }
  | { kind: 'bar'; item: GanttItem; bar: GanttBar }
  | { kind: 'ghost'; item: GanttItem }

type Drag =
  | { type: 'bar'; id: string; number: number; mode: DragKind; startBar: GanttBar; originDay: number; moved: boolean; preview: GanttBar }
  | { type: 'milestone'; id: string; originDay: number; day: number }
  | { type: 'draw'; id: string; number: number; anchorDay: number; moved: boolean; preview: GanttBar }
  | { type: 'link'; fromId: string; fromX: number; fromY: number; toX: number; toY: number; targetId: string | null }

interface Props {
  items: GanttItem[]
  edges: GanttEdge[]
  ticketMeta?: TicketMeta
  milestones: Milestone[]
  scale: GanttScale
  range: GanttBar
  today: number
  scrollRef?: RefObject<HTMLDivElement>
  interactive?: boolean
  narrow?: boolean // below sm: shrink the rail to the key only, freeing width for the bars
  groups?: GanttGroup[] // grouped row source; flat list when absent
  memberName?: Record<string, string> // userId → display name, for rail avatars
  onOpenTicket: (number: number) => void
  onReschedule?: (id: string, startDay: number, endDay: number) => void
  onScheduleFromTray?: (id: string, startDay: number) => void
  onDrawSchedule?: (id: string, startDay: number, endDay: number) => void
  onCreateDependency?: (blockedId: string, blockerId: string) => void
  onRescheduleMilestone?: (id: string, day: number) => void
  onDragActiveChange?: (active: boolean) => void
}

export function GanttChart({
  items,
  edges,
  ticketMeta,
  milestones,
  scale,
  range,
  today,
  scrollRef,
  interactive = false,
  narrow = false,
  groups,
  memberName,
  onOpenTicket,
  onReschedule,
  onScheduleFromTray,
  onDrawSchedule,
  onCreateDependency,
  onRescheduleMilestone,
  onDragActiveChange,
}: Props) {
  const { t } = useTranslation()
  const pxPerDay = PX_PER_DAY[scale]
  const railW = narrow ? 88 : RAIL_W
  const xOf = (day: number) => xForDay(day, range.startDay, scale)
  const svgRef = useRef<SVGSVGElement>(null)
  const scrollElRef = useRef<HTMLDivElement | null>(null)
  const setScrollEl = (el: HTMLDivElement | null) => {
    scrollElRef.current = el
    if (scrollRef) (scrollRef as MutableRefObject<HTMLDivElement | null>).current = el
  }

  // Collapsed group keys (grouping is view state, not data — component-local).
  const [collapsedKeys, setCollapsedKeys] = useState<string[]>([])
  const toggleGroup = (key: string) =>
    setCollapsedKeys((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]))

  // Flat render-row model: optional group headers, then scheduled bars, then
  // (interactive only) ghost rows for unscheduled tickets you can draw onto.
  const rows = useMemo<Row[]>(() => {
    const source: GanttGroup[] = groups ?? [{ key: '', label: '', items }]
    const out: Row[] = []
    for (const g of source) {
      const withBar = g.items.map((item) => ({ item, bar: barForTicket(item) }))
      const scheduled = withBar
        .filter((r): r is { item: GanttItem; bar: GanttBar } => r.bar !== null)
        .sort((a, b) => a.bar.startDay - b.bar.startDay || a.item.number - b.item.number)
      const ghosts = interactive ? withBar.filter((r) => r.bar === null) : []
      if (scheduled.length === 0 && ghosts.length === 0) continue
      if (groups) {
        const collapsed = collapsedKeys.includes(g.key)
        const span = scheduled.length
          ? {
              startDay: Math.min(...scheduled.map((r) => r.bar.startDay)),
              endDay: Math.max(...scheduled.map((r) => r.bar.endDay)),
            }
          : null
        out.push({ kind: 'group', key: g.key, label: g.label, count: scheduled.length + ghosts.length, span, collapsed })
        if (collapsed) continue
      }
      for (const r of scheduled) out.push({ kind: 'bar', item: r.item, bar: r.bar })
      for (const r of ghosts) out.push({ kind: 'ghost', item: r.item })
    }
    return out
  }, [groups, items, interactive, collapsedKeys])

  const rowById = useMemo(() => {
    const m = new Map<string, { idx: number; bar: GanttBar }>()
    rows.forEach((r, idx) => {
      if (r.kind === 'bar') m.set(r.item.id, { idx, bar: r.bar })
    })
    return m
  }, [rows])

  // B3 — split edges into arrows (both ends scheduled) and off-chart glyphs (one
  // end in the tray / off-payload / inside a collapsed group). Glyphs are grouped
  // per bar+direction so a ticket blocked by several off-chart tickets shows a
  // single marker.
  const { arrowEdges, glyphs } = useMemo(() => {
    const arrows: GanttEdge[] = []
    const byKey = new Map<string, { onId: string; role: 'blocked' | 'blocks'; others: string[] }>()
    for (const e of edges) {
      const c = classifyEdge(e, (id) => rowById.has(id))
      if (c.kind === 'arrow') arrows.push(e)
      else if (c.kind === 'glyph') {
        const k = `${c.onId}:${c.role}`
        const g = byKey.get(k) ?? { onId: c.onId, role: c.role, others: [] }
        g.others.push(c.otherId)
        byKey.set(k, g)
      }
    }
    return { arrowEdges: arrows, glyphs: [...byKey.values()] }
  }, [edges, rowById])

  const nameOf = (id: string) => {
    const m = ticketMeta?.[id]
    return m ? `${m.key} ${m.title}` : ''
  }

  // Extend the drawn range so the chart always fills the viewport: at week/month
  // scales the data range can be narrower than the container, which would leave a
  // dead, unpainted region on the right (no gridlines, stripes stopping short).
  const [viewportW, setViewportW] = useState(0)
  useEffect(() => {
    const el = scrollElRef.current
    if (!el) return
    const update = () => setViewportW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const endDay = Math.max(range.endDay, range.startDay + Math.ceil(viewportW / pxPerDay) - 1)

  const header = useMemo(() => ganttHeader(range.startDay, endDay, scale), [range.startDay, endDay, scale])
  const width = (endDay - range.startDay + 1) * pxPerDay
  const height = TOP + rows.length * ROW_H

  // Rendered geometry of a bar: true day span, but never narrower than MIN_BAR_W.
  const barGeom = (bar: GanttBar) => ({
    x: xOf(bar.startDay),
    w: Math.max((bar.endDay - bar.startDay + 1) * pxPerDay, MIN_BAR_W),
  })
  const rowTop = (idx: number) => TOP + idx * ROW_H
  const rowCenter = (idx: number) => rowTop(idx) + ROW_H / 2
  const barTop = (idx: number) => rowTop(idx) + (ROW_H - BAR_H) / 2
  const todayVisible = today >= range.startDay && today <= endDay

  // ── Drag (R8: move/resize/milestone · TL5: draw-to-schedule, link, edge auto-scroll) ──
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const rangeRef = useRef(range)
  rangeRef.current = range
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const lastPointer = useRef({ x: 0, y: 0 })
  // Ghost-row hover: which unscheduled row the pointer is over, and at which day.
  const [hoverGhost, setHoverGhost] = useState<{ id: string; day: number } | null>(null)
  // Hovered bar row — drives the reveal of resize handles / link dot / title.
  // React state instead of CSS :hover so the reveal can't silently break.
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const dayAtClientX = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return dayForX(clientX - rect.left, rangeRef.current.startDay, scaleRef.current)
  }

  // One place turns the current pointer position into drag state — shared by the
  // pointermove listener and the auto-scroll loop (scrolling moves the chart
  // under a stationary pointer, which must update the preview too).
  const updateDragFromPointer = (clientX: number, clientY: number) => {
    const d = dragRef.current
    if (!d) return
    if (d.type === 'bar') {
      const delta = dayAtClientX(clientX) - d.originDay
      setDrag({ ...d, moved: d.moved || delta !== 0, preview: applyDrag(d.startBar, d.mode, delta) })
    } else if (d.type === 'milestone') {
      setDrag({ ...d, day: dayAtClientX(clientX) })
    } else if (d.type === 'draw') {
      const day = dayAtClientX(clientX)
      setDrag({
        ...d,
        moved: d.moved || day !== d.anchorDay,
        preview: { startDay: Math.min(d.anchorDay, day), endDay: Math.max(d.anchorDay, day) },
      })
    } else {
      const rect = svgRef.current!.getBoundingClientRect()
      const el = document.elementFromPoint(clientX, clientY)
      const target = el ? (el as Element).closest?.('[data-ticket-id]')?.getAttribute('data-ticket-id') ?? null : null
      setDrag({ ...d, toX: clientX - rect.left, toY: clientY - rect.top, targetId: target === d.fromId ? null : target })
    }
  }
  const updateDragRef = useRef(updateDragFromPointer)
  updateDragRef.current = updateDragFromPointer

  useEffect(() => {
    if (!interactive) return
    const onMove = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY }
      if (dragRef.current) updateDragRef.current(e.clientX, e.clientY)
    }
    const finish = (commit: boolean) => {
      const d = dragRef.current
      if (!d) return
      if (commit && d.type === 'bar') {
        if (d.mode === 'move' && !d.moved) onOpenTicket(d.number)
        else if (d.preview.startDay !== d.startBar.startDay || d.preview.endDay !== d.startBar.endDay)
          onReschedule?.(d.id, d.preview.startDay, d.preview.endDay)
      } else if (commit && d.type === 'milestone' && d.day !== d.originDay) {
        onRescheduleMilestone?.(d.id, d.day)
      } else if (commit && d.type === 'draw') {
        if (d.moved) onDrawSchedule?.(d.id, d.preview.startDay, d.preview.endDay)
        else onOpenTicket(d.number)
      } else if (commit && d.type === 'link' && d.targetId) {
        onCreateDependency?.(d.targetId, d.fromId)
      }
      setDrag(null)
      onDragActiveChange?.(false)
    }
    const onUp = () => finish(true)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [interactive, onOpenTicket, onReschedule, onRescheduleMilestone, onDrawSchedule, onCreateDependency, onDragActiveChange])

  // Edge auto-scroll: while any drag is live, nudge the scroll container when the
  // pointer sits near its left/right edge, then re-derive the preview from the
  // (now shifted) pointer position. Speed ramps with proximity to the edge.
  const dragActive = drag !== null
  useEffect(() => {
    if (!dragActive || !interactive) return
    let raf = 0
    const tick = () => {
      const el = scrollElRef.current
      if (el && dragRef.current) {
        const r = el.getBoundingClientRect()
        const x = lastPointer.current.x
        let dx = 0
        if (x < r.left + EDGE_ZONE) dx = -Math.min(24, Math.ceil((r.left + EDGE_ZONE - x) / 3))
        else if (x > r.right - EDGE_ZONE) dx = Math.min(24, Math.ceil((x - (r.right - EDGE_ZONE)) / 3))
        if (dx !== 0) {
          const before = el.scrollLeft
          el.scrollLeft += dx
          if (el.scrollLeft !== before) updateDragRef.current(lastPointer.current.x, lastPointer.current.y)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [dragActive, interactive])

  const startBarDrag = (item: GanttItem, bar: GanttBar, mode: DragKind) => (e: ReactPointerEvent) => {
    if (!interactive) return
    e.preventDefault()
    const originDay = dayAtClientX(e.clientX)
    setDrag({ type: 'bar', id: item.id, number: item.number, mode, startBar: bar, originDay, moved: false, preview: bar })
    onDragActiveChange?.(true)
  }
  const startMilestoneDrag = (m: Milestone) => (e: ReactPointerEvent) => {
    if (!interactive) return
    e.preventDefault()
    setDrag({ type: 'milestone', id: m.id, originDay: dayAtClientX(e.clientX), day: toDayNum(m.date) })
    onDragActiveChange?.(true)
  }
  const startDrawDrag = (item: GanttItem) => (e: ReactPointerEvent) => {
    if (!interactive) return
    e.preventDefault()
    const day = dayAtClientX(e.clientX)
    setHoverGhost(null)
    setDrag({ type: 'draw', id: item.id, number: item.number, anchorDay: day, moved: false, preview: { startDay: day, endDay: day } })
    onDragActiveChange?.(true)
  }
  const startLinkDrag = (item: GanttItem, fromX: number, fromY: number) => (e: ReactPointerEvent) => {
    if (!interactive) return
    e.preventDefault()
    e.stopPropagation()
    setDrag({ type: 'link', fromId: item.id, fromX, fromY, toX: fromX, toY: fromY, targetId: null })
    onDragActiveChange?.(true)
  }

  // Keyboard nudge: focus a bar (Tab), arrows move ±1 day, shift+arrows resize
  // the end, Enter/Space opens the ticket. Same persistence path as drag.
  const barKeyDown = (item: GanttItem, bar: GanttBar) => (e: ReactKeyboardEvent<SVGGElement>) => {
    if (!interactive) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const delta = e.key === 'ArrowRight' ? 1 : -1
      if (e.shiftKey) onReschedule?.(item.id, bar.startDay, Math.max(bar.startDay, bar.endDay + delta))
      else onReschedule?.(item.id, bar.startDay + delta, bar.endDay + delta)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenTicket(item.number)
    }
  }

  // Effective bar/day for a row/milestone, honoring an in-flight drag preview.
  const barOf = (id: string, real: GanttBar) => (drag?.type === 'bar' && drag.id === id ? drag.preview : real)
  const milestoneDay = (m: Milestone) => (drag?.type === 'milestone' && drag.id === m.id ? drag.day : toDayNum(m.date))

  const onDrop = (e: ReactDragEvent) => {
    if (!interactive) return
    e.preventDefault()
    const id = e.dataTransfer.getData('text/ganttticket')
    if (!id) return
    const rect = svgRef.current!.getBoundingClientRect()
    onScheduleFromTray?.(id, dayForX(e.clientX - rect.left, range.startDay, scale))
  }

  // Floating date chip shown during drags — instant feedback on what a drop means.
  const dragChip = (x: number, yTop: number, label: string) => {
    const w = label.length * 5.9 + 14
    return (
      <g className="pointer-events-none">
        <rect x={x} y={yTop - 22} width={w} height={18} rx={9} fill="hsl(var(--foreground))" fillOpacity={0.92} />
        <text x={x + 7} y={yTop - 9} fontSize={10} fontWeight={500} fill="hsl(var(--background))">
          {label}
        </text>
      </g>
    )
  }
  const spanLabel = (b: GanttBar) => `${fmtDay(b.startDay)} – ${fmtDay(b.endDay)} · ${b.endDay - b.startDay + 1}d`

  return (
    <div className="grid overflow-hidden rounded-lg border bg-card" style={{ gridTemplateColumns: `${railW}px 1fr` }}>
      {/* Left rail — sticky ticket list, aligned row-for-row with the svg. */}
      <div className="border-r bg-card">
        <div style={{ height: TOP }} className="border-b" />
        {rows.map((r) => {
          if (r.kind === 'group')
            return (
              <button
                key={`g-${r.key}`}
                onClick={() => toggleGroup(r.key)}
                style={{ height: ROW_H }}
                aria-expanded={!r.collapsed}
                className="flex w-full items-center gap-1.5 border-b bg-muted/40 px-2 text-left hover:bg-muted/70"
              >
                <span className="w-3 shrink-0 text-center text-[10px] text-muted-foreground" aria-hidden>
                  {r.collapsed ? '▸' : '▾'}
                </span>
                <span className="min-w-0 truncate text-xs font-semibold text-foreground">{r.label}</span>
                <span className="text-[11px] text-muted-foreground">{r.count}</span>
              </button>
            )
          const item = r.item
          const ghost = r.kind === 'ghost'
          return (
            <button
              key={item.id}
              onClick={() => onOpenTicket(item.number)}
              style={{ height: ROW_H }}
              className="flex w-full items-center gap-2 border-b px-3 text-left last:border-b-0 hover:bg-accent"
            >
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{item.key}</span>
              {!narrow && (
                <>
                  <span className={cn('min-w-0 flex-1 truncate text-xs', ghost ? 'text-muted-foreground' : 'text-foreground')}>
                    {item.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: STATUS_COLOR[item.status] }}
                      title={STATUS_LABEL[item.status]}
                    />
                    {item.assignedToId && memberName?.[item.assignedToId] && (
                      <span
                        title={memberName[item.assignedToId]}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground"
                      >
                        {initials(memberName[item.assignedToId])}
                      </span>
                    )}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* Right pane — horizontally scrollable timeline (+ tray drop target). */}
      <div
        ref={setScrollEl}
        className="scrollbar-slim overflow-x-auto"
        onDragOver={interactive ? (e) => e.preventDefault() : undefined}
        onDrop={interactive ? onDrop : undefined}
      >
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className={cn('block', drag && 'select-none')}
          role="img"
          aria-label="Project timeline"
        >
          <defs>
            <marker id="gantt-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="hsl(var(--muted-foreground))" fillOpacity={0.9} />
            </marker>
            <marker id="gantt-arrow-active" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="hsl(var(--primary))" />
            </marker>
          </defs>

          {/* Weekend shading (day + week scales; too dense to read at month) */}
          {scale !== 'month' &&
            Array.from({ length: endDay - range.startDay + 1 }, (_, i) => range.startDay + i)
              .filter(isWeekend)
              .map((day) => (
                <rect key={`we-${day}`} x={xOf(day)} y={HEADER_H} width={pxPerDay} height={height - HEADER_H} fill="hsl(var(--muted))" fillOpacity={scale === 'day' ? 0.3 : 0.2} />
              ))}

          {/* TL3 — two-tier header. Bottom band: gridlines + compact day/week/month
              sub-labels. Top band: the month/year that groups them. */}
          {header.secondary.map((tk) => (
            <g key={`t-${tk.day}`}>
              <line x1={xOf(tk.day)} y1={HEADER_H} x2={xOf(tk.day)} y2={height} stroke="hsl(var(--border))" strokeOpacity={tk.major ? 0.5 : 0.2} />
              <text x={xOf(tk.day) + 4} y={33} fontSize={10} fontWeight={tk.major ? 600 : 400} fill="hsl(var(--muted-foreground))" className="pointer-events-none">
                {tk.label}
              </text>
            </g>
          ))}
          {/* Tier divider */}
          <line x1={0} y1={HEADER_H / 2} x2={width} y2={HEADER_H / 2} stroke="hsl(var(--border))" strokeOpacity={0.5} />
          {/* Top band: month (day/week) or year (month), with a stronger boundary
              line. The label is hidden when its segment is too narrow to fit it
              (e.g. a partial first month at a compressed scale), so labels never
              overlap — the boundary line + neighbouring label still orient you.
              The boundary line is split: a short tick in the top band (above the
              sub-labels) plus the body divider (below the header), so it never
              slices through a week/day number that lands next to a month start. */}
          {header.primary.map((seg, i) => {
            const nextStart = header.primary[i + 1]?.startDay ?? endDay + 1
            const segW = xOf(nextStart) - xOf(seg.startDay)
            return (
              <g key={`p-${seg.startDay}`}>
                {i > 0 && (
                  <>
                    <line x1={xOf(seg.startDay)} y1={0} x2={xOf(seg.startDay)} y2={HEADER_H / 2} stroke="hsl(var(--border))" strokeOpacity={0.7} />
                    <line x1={xOf(seg.startDay)} y1={HEADER_H} x2={xOf(seg.startDay)} y2={height} stroke="hsl(var(--border))" strokeOpacity={0.7} />
                  </>
                )}
                {segW >= seg.label.length * 7 && (
                  <text x={xOf(seg.startDay) + 6} y={15} fontSize={11} fontWeight={600} fill="hsl(var(--foreground))" className="pointer-events-none">
                    {seg.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Today marker */}
          {todayVisible && <line x1={xOf(today)} y1={HEADER_H} x2={xOf(today)} y2={height} stroke="hsl(var(--primary))" strokeWidth={1.5} strokeOpacity={0.8} />}

          {/* Milestone lane */}
          {milestones.map((m) => {
            const mDay = milestoneDay(m)
            const mx = xOf(mDay)
            const color = m.done ? 'hsl(var(--muted-foreground))' : '#f59e0b'
            const cy = HEADER_H + MILESTONE_LANE / 2
            const draggingThis = drag?.type === 'milestone' && drag.id === m.id
            return (
              <g
                key={m.id}
                transform={`translate(${mx} 0)`}
                style={{ transition: draggingThis ? undefined : 'transform 160ms ease' }}
              >
                <line x1={0} y1={HEADER_H + MILESTONE_LANE} x2={0} y2={height} stroke={color} strokeOpacity={0.3} strokeDasharray="3 3" />
                <rect
                  x={-5}
                  y={cy - 5}
                  width={10}
                  height={10}
                  fill={color}
                  transform={`rotate(45 0 ${cy})`}
                  className={cn(interactive && 'cursor-grab active:cursor-grabbing')}
                  onPointerDown={startMilestoneDrag(m)}
                />
                <text x={9} y={cy + 3} fontSize={10} fill={color} className={cn('pointer-events-none', m.done && 'line-through')}>
                  {m.name}
                </text>
                {draggingThis && dragChip(10, HEADER_H + MILESTONE_LANE + 18, fmtDay(mDay))}
              </g>
            )
          })}

          {/* Dependency edges — from the END of the blocker bar to the START of the
              blocked bar. The line is routed to never lie along a bar: a forward
              dep uses a simple elbow; an inverted dep (blocked scheduled before its
              blocker) drops into the gap *below* the blocked row and approaches its
              start from the left, so it stays clear of the bar and its title. */}
          {arrowEdges.map((e, i) => {
            const from = rowById.get(e.dependsOnId)
            const to = rowById.get(e.ticketId)
            if (!from || !to) return null
            const fromBar = barOf(e.dependsOnId, from.bar)
            const toBar = barOf(e.ticketId, to.bar)
            const fromGeom = barGeom(fromBar)
            const fromX = fromGeom.x + fromGeom.w // right end of the blocker bar as rendered
            const fromY = rowCenter(from.idx)
            const toX = xOf(toBar.startDay) // left start of the blocked bar
            const toY = rowCenter(to.idx)
            const STEP = 10
            const gapBelowDest = rowTop(to.idx) + ROW_H - 3 // just below the blocked bar
            const d =
              toX >= fromX
                ? `M ${fromX} ${fromY} H ${Math.max(fromX + STEP, toX - STEP)} V ${toY} H ${toX}`
                : `M ${fromX} ${fromY} H ${fromX + STEP} V ${gapBelowDest} H ${toX - STEP} V ${toY} H ${toX}`
            return (
              <path
                key={`e-${i}`}
                d={d}
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.25}
                strokeOpacity={0.55}
                markerEnd="url(#gantt-arrow)"
              />
            )
          })}

          {/* B3 — off-chart dependency glyphs: the other end is unscheduled/off-payload */}
          {glyphs.map((g) => {
            const row = rowById.get(g.onId)
            if (!row) return null
            const bar = barOf(g.onId, row.bar)
            const geom = barGeom(bar)
            const cx = g.role === 'blocked' ? geom.x - 6 : geom.x + geom.w + 6
            const cy = rowCenter(row.idx)
            const names = g.others.map(nameOf).filter(Boolean).join(', ')
            const label = g.role === 'blocked' ? t('gantt.depBlockedBy', { names }) : t('gantt.depBlocks', { names })
            return (
              <g key={`g-${g.onId}-${g.role}`}>
                <title>{label}</title>
                <circle cx={cx} cy={cy} r={4} fill={DEP_GLYPH} fillOpacity={0.85} />
              </g>
            )
          })}

          {/* Rows: group summary spans, bars, ghost lanes */}
          {rows.map((r, idx) => {
            if (r.kind === 'group') {
              return (
                <g key={`grp-${r.key}`} className="pointer-events-none">
                  <rect x={0} y={rowTop(idx)} width={width} height={ROW_H} fill="hsl(var(--muted))" fillOpacity={0.35} />
                  {r.span && (
                    <rect
                      x={barGeom(r.span).x}
                      y={rowCenter(idx) - 2.5}
                      width={barGeom(r.span).w}
                      height={5}
                      rx={2.5}
                      fill="hsl(var(--muted-foreground))"
                      fillOpacity={0.35}
                    />
                  )}
                </g>
              )
            }

            if (r.kind === 'ghost') {
              const item = r.item
              const yTop = rowTop(idx)
              const yBar = barTop(idx)
              const drawing = drag?.type === 'draw' && drag.id === item.id
              const hovering = !drag && hoverGhost?.id === item.id
              const color = STATUS_COLOR[item.status]
              return (
                <g key={`ghost-${item.id}`}>
                  {hovering && (
                    <g className="pointer-events-none">
                      <rect
                        x={xOf(hoverGhost.day)}
                        y={yBar}
                        width={DRAW_DEFAULT_DAYS * pxPerDay}
                        height={BAR_H}
                        rx={4}
                        fill={color}
                        fillOpacity={0.15}
                        stroke={color}
                        strokeOpacity={0.6}
                        strokeDasharray="4 3"
                      />
                      <text x={xOf(hoverGhost.day) + DRAW_DEFAULT_DAYS * pxPerDay + 8} y={yBar + BAR_H - 3} fontSize={10} fill="hsl(var(--muted-foreground))">
                        {t('gantt.dragToSchedule')}
                      </text>
                    </g>
                  )}
                  {drawing && (
                    <g className="pointer-events-none">
                      <rect
                        x={barGeom(drag.preview).x}
                        y={yBar}
                        width={barGeom(drag.preview).w}
                        height={BAR_H}
                        rx={4}
                        fill={color}
                        fillOpacity={0.6}
                        stroke={color}
                        strokeDasharray="4 3"
                      />
                      {dragChip(xOf(drag.preview.startDay), yBar, spanLabel(drag.preview))}
                    </g>
                  )}
                  <rect
                    x={0}
                    y={yTop}
                    width={width}
                    height={ROW_H}
                    fill="transparent"
                    className="cursor-crosshair"
                    onPointerDown={startDrawDrag(item)}
                    onPointerMove={(e) => {
                      if (!drag) setHoverGhost({ id: item.id, day: dayAtClientX(e.clientX) })
                    }}
                    onPointerLeave={() => setHoverGhost((h) => (h?.id === item.id ? null : h))}
                  />
                </g>
              )
            }

            const item = r.item
            const bar = barOf(item.id, r.bar)
            const { x, w } = barGeom(bar)
            const y = barTop(idx)
            const color = STATUS_COLOR[item.status]
            const showHandles = interactive && w >= 24
            const draggingThis = drag?.type === 'bar' && drag.id === item.id
            const linkTarget = drag?.type === 'link' && drag.targetId === item.id
            const hovered = hoveredId === item.id || draggingThis
            const cy = BAR_H / 2
            return (
              <g
                key={item.id}
                data-ticket-id={item.id}
                transform={`translate(${x} ${y})`}
                style={{ transition: draggingThis ? undefined : 'transform 160ms ease' }}
                onPointerEnter={() => setHoveredId(item.id)}
                onPointerLeave={() => setHoveredId((h) => (h === item.id ? null : h))}
              >
                <rect
                  x={0}
                  y={0}
                  width={w}
                  height={BAR_H}
                  rx={4}
                  fill={color}
                  stroke={linkTarget ? 'hsl(var(--primary))' : 'none'}
                  strokeWidth={linkTarget ? 2 : 0}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={`${item.key} ${item.title}, ${spanLabel(bar)}`}
                  style={{ transition: draggingThis ? undefined : 'width 160ms ease' }}
                  className={cn(
                    'focus:outline-none focus-visible:stroke-[hsl(var(--ring))] focus-visible:[stroke-width:2]',
                    interactive ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                  )}
                  onPointerDown={interactive ? startBarDrag(item, r.bar, 'move') : undefined}
                  onKeyDown={interactive ? barKeyDown(item, bar) : undefined}
                  onClick={interactive ? undefined : () => onOpenTicket(item.number)}
                />
                {showHandles && (
                  <>
                    <rect x={2.5} y={3} width={3} height={BAR_H - 6} rx={1.5} fill="hsl(var(--background))" fillOpacity={0.9} className={cn('pointer-events-none transition-opacity', hovered ? 'opacity-100' : 'opacity-0')} />
                    <rect x={w - 5.5} y={3} width={3} height={BAR_H - 6} rx={1.5} fill="hsl(var(--background))" fillOpacity={0.9} className={cn('pointer-events-none transition-opacity', hovered ? 'opacity-100' : 'opacity-0')} />
                    <rect x={0} y={0} width={HANDLE_W} height={BAR_H} fill="transparent" className="cursor-ew-resize" onPointerDown={startBarDrag(item, r.bar, 'resize-start')} />
                    <rect x={w - HANDLE_W} y={0} width={HANDLE_W} height={BAR_H} fill="transparent" className="cursor-ew-resize" onPointerDown={startBarDrag(item, r.bar, 'resize-end')} />
                  </>
                )}
                {/* TL5 — dependency handle: drag from the end of a blocker onto
                    another bar to create "target depends on this". */}
                {interactive && onCreateDependency && (
                  <circle
                    cx={w}
                    cy={cy}
                    r={4.5}
                    fill="hsl(var(--background))"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={1.5}
                    className={cn(
                      'cursor-crosshair transition-opacity',
                      hovered || (drag?.type === 'link' && drag.fromId === item.id) ? 'opacity-100' : 'opacity-0',
                    )}
                    onPointerDown={startLinkDrag(item, x + w, y + cy)}
                  />
                )}
                {/* Ticket title just outside (right of) the bar and lifted to sit
                    ABOVE the bar's centre line, so a dependency line (which runs at
                    the row centre) never crosses it. Dimmed by default to keep the
                    chart calm; full opacity on row hover. */}
                <text
                  x={w + 8}
                  y={-2}
                  fontSize={11}
                  fill="hsl(var(--muted-foreground))"
                  className={cn('pointer-events-none transition-opacity', hovered ? 'opacity-100' : 'opacity-70')}
                >
                  {item.title}
                </text>
              </g>
            )
          })}

          {/* Live date chip for a bar move/resize */}
          {drag?.type === 'bar' && drag.moved && (() => {
            const row = rowById.get(drag.id)
            if (!row) return null
            return dragChip(xOf(drag.preview.startDay), barTop(row.idx), spanLabel(drag.preview))
          })()}

          {/* Link drag: dashed connector following the pointer, plus target key chip */}
          {drag?.type === 'link' && (
            <g className="pointer-events-none">
              <path
                d={`M ${drag.fromX} ${drag.fromY} L ${drag.toX} ${drag.toY}`}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                markerEnd="url(#gantt-arrow-active)"
              />
              {drag.targetId && ticketMeta?.[drag.targetId] &&
                dragChip(drag.toX + 10, drag.toY + 10, `→ ${ticketMeta[drag.targetId].key}`)}
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
