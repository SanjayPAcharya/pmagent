import { type RefObject, useMemo } from 'react'
import type { GanttItem, GanttEdge, Milestone } from '@/lib/api'
import { STATUS_COLOR } from '@/lib/board'
import { barForTicket, ticks, toDayNum, xForDay, PX_PER_DAY, type GanttScale, type GanttBar } from '@/lib/gantt'
import { cn } from '@/lib/utils'

// 3.7 R7 — pure presentational Gantt. All date→pixel math comes from lib/gantt;
// this renders one hand-rolled <svg> (BurndownSparkline precedent). Only
// scheduled items (a bar) become rows; unscheduled ones live in the page's tray.

const ROW_H = 32
const HEADER_H = 40
const MILESTONE_LANE = 24
const RAIL_W = 240
const TOP = HEADER_H + MILESTONE_LANE
const BAR_H = 18
const MS_PER_DAY = 86_400_000

const isWeekend = (day: number) => {
  const dow = new Date(day * MS_PER_DAY).getUTCDay()
  return dow === 0 || dow === 6
}

interface Props {
  items: GanttItem[]
  edges: GanttEdge[]
  milestones: Milestone[]
  scale: GanttScale
  range: GanttBar
  today: number
  scrollRef?: RefObject<HTMLDivElement>
  onOpenTicket: (number: number) => void
}

export function GanttChart({ items, edges, milestones, scale, range, today, scrollRef, onOpenTicket }: Props) {
  const pxPerDay = PX_PER_DAY[scale]
  const xOf = (day: number) => xForDay(day, range.startDay, scale)

  // Scheduled rows: sort by start day, then number. Each keeps its bar + index.
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

  const tickList = useMemo(() => ticks(range.startDay, range.endDay, scale), [range.startDay, range.endDay, scale])
  const width = (range.endDay - range.startDay + 1) * pxPerDay
  const height = TOP + rows.length * ROW_H
  const rowCenter = (idx: number) => TOP + idx * ROW_H + ROW_H / 2
  const todayVisible = today >= range.startDay && today <= range.endDay

  return (
    <div className="grid overflow-hidden rounded-lg border bg-card" style={{ gridTemplateColumns: `${RAIL_W}px 1fr` }}>
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
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{r.item.title}</span>
          </button>
        ))}
      </div>

      {/* Right pane — horizontally scrollable timeline. */}
      <div ref={scrollRef} className="scrollbar-slim overflow-x-auto">
        <svg width={width} height={height} className="block" role="img" aria-label="Project timeline">
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
            const mx = xOf(toDayNum(m.date))
            const color = m.done ? 'hsl(var(--muted-foreground))' : '#f59e0b'
            const cy = HEADER_H + MILESTONE_LANE / 2
            return (
              <g key={m.id}>
                <line x1={mx} y1={HEADER_H + MILESTONE_LANE} x2={mx} y2={height} stroke={color} strokeOpacity={0.4} strokeDasharray="3 3" />
                <rect x={mx - 5} y={cy - 5} width={10} height={10} fill={color} transform={`rotate(45 ${mx} ${cy})`} />
                <text x={mx + 9} y={cy + 3} fontSize={10} fill={color} className={cn(m.done && 'line-through')}>
                  {m.name}
                </text>
              </g>
            )
          })}

          {/* Dependency edges (drawn under bars would be hidden; keep above gridlines, below bars) */}
          {edges.map((e, i) => {
            const from = rowById.get(e.dependsOnId)
            const to = rowById.get(e.ticketId)
            if (!from || !to) return null
            const fromX = xOf(from.bar.endDay) + pxPerDay
            const fromY = rowCenter(from.idx)
            const toX = xOf(to.bar.startDay)
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

          {/* Bars */}
          {rows.map((r, idx) => {
            const x = xOf(r.bar.startDay)
            const w = (r.bar.endDay - r.bar.startDay + 1) * pxPerDay
            const y = TOP + idx * ROW_H + (ROW_H - BAR_H) / 2
            const color = STATUS_COLOR[r.item.status]
            return (
              <g key={r.item.id} className="cursor-pointer" onClick={() => onOpenTicket(r.item.number)}>
                <rect x={x} y={y} width={w} height={BAR_H} rx={4} fill={color} fillOpacity={0.6} />
                <rect x={x} y={y} width={3} height={BAR_H} rx={1.5} fill={color} />
                {w > 120 && (
                  <text x={x + 8} y={y + BAR_H / 2 + 3.5} fontSize={11} fill="#fff" className="pointer-events-none">
                    {r.item.title}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
