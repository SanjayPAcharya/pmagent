import { type RefObject, type PointerEvent as ReactPointerEvent, type DragEvent as ReactDragEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { GanttItem, GanttEdge, Milestone } from '@/lib/api'
import { STATUS_COLOR } from '@/lib/board'
import { useTranslation } from 'react-i18next'
import {
  applyDrag,
  barForTicket,
  classifyEdge,
  dayForX,
  ticks,
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
const DEP_GLYPH = 'hsl(var(--destructive))'

// 3.7 R7/R8 — presentational Gantt (hand-rolled <svg>, BurndownSparkline
// precedent) with pointer-driven drag (move / resize / milestone) layered on in
// R8. Date↔pixel math all comes from lib/gantt; persistence + undo live in the
// page via the callbacks. Only scheduled items (a bar) become rows.

const ROW_H = 32
const HEADER_H = 40
const MILESTONE_LANE = 24
const RAIL_W = 240
const TOP = HEADER_H + MILESTONE_LANE
const BAR_H = 18
const MS_PER_DAY = 86_400_000
const HANDLE_W = 8 // resize hit target; only shown on bars wide enough for it

const isWeekend = (day: number) => {
  const dow = new Date(day * MS_PER_DAY).getUTCDay()
  return dow === 0 || dow === 6
}

type Drag =
  | { type: 'bar'; id: string; number: number; mode: DragKind; startBar: GanttBar; originDay: number; moved: boolean; preview: GanttBar }
  | { type: 'milestone'; id: string; originDay: number; day: number }

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
  onOpenTicket: (number: number) => void
  onReschedule?: (id: string, startDay: number, endDay: number) => void
  onScheduleFromTray?: (id: string, startDay: number) => void
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
  onOpenTicket,
  onReschedule,
  onScheduleFromTray,
  onRescheduleMilestone,
  onDragActiveChange,
}: Props) {
  const { t } = useTranslation()
  const pxPerDay = PX_PER_DAY[scale]
  const railW = narrow ? 88 : RAIL_W
  const xOf = (day: number) => xForDay(day, range.startDay, scale)
  const svgRef = useRef<SVGSVGElement>(null)

  const rows = useMemo(() => {
    return items
      .map((item) => ({ item, bar: barForTicket(item)! }))
      .filter((r) => r.bar)
      .sort((a, b) => a.bar.startDay - b.bar.startDay || a.item.number - b.item.number)
  }, [items])

  const rowById = useMemo(() => {
    const m = new Map<string, { idx: number; bar: GanttBar }>()
    rows.forEach((r, idx) => m.set(r.item.id, { idx, bar: r.bar }))
    return m
  }, [rows])

  // B3 — split edges into arrows (both ends scheduled) and off-chart glyphs (one
  // end in the tray / off-payload). Glyphs are grouped per bar+direction so a
  // ticket blocked by several off-chart tickets shows a single marker.
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

  const tickList = useMemo(() => ticks(range.startDay, range.endDay, scale), [range.startDay, range.endDay, scale])
  const width = (range.endDay - range.startDay + 1) * pxPerDay
  const height = TOP + rows.length * ROW_H
  const rowCenter = (idx: number) => TOP + idx * ROW_H + ROW_H / 2
  const todayVisible = today >= range.startDay && today <= range.endDay

  // ── Drag (R8) ──────────────────────────────────────────────
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const rangeRef = useRef(range)
  rangeRef.current = range
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  const dayAtClientX = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return dayForX(clientX - rect.left, rangeRef.current.startDay, scaleRef.current)
  }

  useEffect(() => {
    if (!interactive) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (d.type === 'bar') {
        const delta = dayAtClientX(e.clientX) - d.originDay
        setDrag({ ...d, moved: d.moved || delta !== 0, preview: applyDrag(d.startBar, d.mode, delta) })
      } else {
        setDrag({ ...d, day: dayAtClientX(e.clientX) })
      }
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
  }, [interactive, onOpenTicket, onReschedule, onRescheduleMilestone, onDragActiveChange])

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

  return (
    <div className="grid overflow-hidden rounded-lg border bg-card" style={{ gridTemplateColumns: `${railW}px 1fr` }}>
      {/* Left rail — sticky ticket list, aligned row-for-row with the svg. */}
      <div className="border-r bg-card">
        <div style={{ height: TOP }} className="border-b" />
        {rows.map((r) => (
          <button
            key={r.item.id}
            onClick={() => onOpenTicket(r.item.number)}
            style={{ height: ROW_H }}
            className="flex w-full items-center gap-2 border-b px-3 text-left last:border-b-0 hover:bg-accent"
          >
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{r.item.key}</span>
            {!narrow && <span className="min-w-0 flex-1 truncate text-xs text-foreground">{r.item.title}</span>}
          </button>
        ))}
      </div>

      {/* Right pane — horizontally scrollable timeline (+ tray drop target). */}
      <div
        ref={scrollRef}
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
            <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="hsl(var(--muted-foreground))" fillOpacity={0.5} />
            </marker>
          </defs>

          {/* Weekend shading (day scale only) */}
          {scale === 'day' &&
            Array.from({ length: range.endDay - range.startDay + 1 }, (_, i) => range.startDay + i)
              .filter(isWeekend)
              .map((day) => (
                <rect key={`we-${day}`} x={xOf(day)} y={HEADER_H} width={pxPerDay} height={height - HEADER_H} fill="hsl(var(--muted))" fillOpacity={0.4} />
              ))}

          {/* Gridlines + tick labels */}
          {tickList.map((tk) => (
            <g key={`t-${tk.day}`}>
              <line x1={xOf(tk.day)} y1={HEADER_H} x2={xOf(tk.day)} y2={height} stroke="hsl(var(--border))" strokeOpacity={tk.major ? 1 : 0.5} />
              <text x={xOf(tk.day) + 4} y={24} fontSize={10} fontWeight={tk.major ? 600 : 400} fill="hsl(var(--muted-foreground))">
                {tk.label}
              </text>
            </g>
          ))}

          {/* Today marker */}
          {todayVisible && <line x1={xOf(today)} y1={HEADER_H} x2={xOf(today)} y2={height} stroke="hsl(var(--primary))" strokeWidth={2} />}

          {/* Milestone lane */}
          {milestones.map((m) => {
            const mx = xOf(milestoneDay(m))
            const color = m.done ? 'hsl(var(--muted-foreground))' : '#f59e0b'
            const cy = HEADER_H + MILESTONE_LANE / 2
            return (
              <g key={m.id}>
                <line x1={mx} y1={HEADER_H + MILESTONE_LANE} x2={mx} y2={height} stroke={color} strokeOpacity={0.4} strokeDasharray="3 3" />
                <rect
                  x={mx - 5}
                  y={cy - 5}
                  width={10}
                  height={10}
                  fill={color}
                  transform={`rotate(45 ${mx} ${cy})`}
                  className={cn(interactive && 'cursor-grab active:cursor-grabbing')}
                  onPointerDown={startMilestoneDrag(m)}
                />
                <text x={mx + 9} y={cy + 3} fontSize={10} fill={color} className={cn('pointer-events-none', m.done && 'line-through')}>
                  {m.name}
                </text>
              </g>
            )
          })}

          {/* Dependency edges — arrows between two scheduled bars */}
          {arrowEdges.map((e, i) => {
            const from = rowById.get(e.dependsOnId)
            const to = rowById.get(e.ticketId)
            if (!from || !to) return null
            const fromBar = barOf(e.dependsOnId, from.bar)
            const toBar = barOf(e.ticketId, to.bar)
            const fromX = xOf(fromBar.endDay) + pxPerDay
            const fromY = rowCenter(from.idx)
            const toX = xOf(toBar.startDay)
            const toY = rowCenter(to.idx)
            const midX = Math.max(fromX + 10, toX - 10)
            return (
              <path
                key={`e-${i}`}
                d={`M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`}
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.35}
                markerEnd="url(#gantt-arrow)"
              />
            )
          })}

          {/* B3 — off-chart dependency glyphs: the other end is unscheduled/off-payload */}
          {glyphs.map((g) => {
            const row = rowById.get(g.onId)
            if (!row) return null
            const bar = barOf(g.onId, row.bar)
            const cx = g.role === 'blocked' ? xOf(bar.startDay) - 6 : xOf(bar.endDay) + pxPerDay + 6
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

          {/* Bars */}
          {rows.map((r, idx) => {
            const bar = barOf(r.item.id, r.bar)
            const x = xOf(bar.startDay)
            const w = (bar.endDay - bar.startDay + 1) * pxPerDay
            const y = TOP + idx * ROW_H + (ROW_H - BAR_H) / 2
            const color = STATUS_COLOR[r.item.status]
            const showHandles = interactive && w >= 24
            return (
              <g key={r.item.id}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={BAR_H}
                  rx={4}
                  fill={color}
                  fillOpacity={0.6}
                  className={cn(interactive ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer')}
                  onPointerDown={interactive ? startBarDrag(r.item, r.bar, 'move') : undefined}
                  onClick={interactive ? undefined : () => onOpenTicket(r.item.number)}
                />
                <rect x={x} y={y} width={3} height={BAR_H} rx={1.5} fill={color} className="pointer-events-none" />
                {showHandles && (
                  <>
                    <rect x={x} y={y} width={HANDLE_W} height={BAR_H} fill="transparent" className="cursor-ew-resize" onPointerDown={startBarDrag(r.item, r.bar, 'resize-start')} />
                    <rect x={x + w - HANDLE_W} y={y} width={HANDLE_W} height={BAR_H} fill="transparent" className="cursor-ew-resize" onPointerDown={startBarDrag(r.item, r.bar, 'resize-end')} />
                  </>
                )}
                {/* Ticket title just outside (right of) the bar, so every bar is
                    identifiable even when it's too narrow to hold a label. */}
                <text
                  x={x + w + 6}
                  y={y + BAR_H / 2 + 3.5}
                  fontSize={11}
                  fill="hsl(var(--foreground))"
                  className="pointer-events-none"
                >
                  {r.item.title}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
