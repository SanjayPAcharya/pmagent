import type { TicketStatus } from '@/lib/api'
import { cn } from '@/lib/utils'

// Segmented mini-bar summarising a project's tickets into three buckets
// (to do / in progress / done). CANCELLED is excluded. Colors are fixed hues
// that read on both light and dark card surfaces.
const BUCKETS = [
  { key: 'todo', label: 'to do', statuses: ['BACKLOG', 'TODO'] as TicketStatus[], bar: 'bg-muted-foreground/40' },
  {
    key: 'progress',
    label: 'in progress',
    statuses: ['IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'] as TicketStatus[],
    bar: 'bg-blue-500',
  },
  { key: 'done', label: 'done', statuses: ['DONE'] as TicketStatus[], bar: 'bg-emerald-500' },
]

export function StatusBar({
  byStatus,
  showLegend = true,
  className,
}: {
  byStatus?: Partial<Record<TicketStatus, number>>
  showLegend?: boolean
  className?: string
}) {
  const counts = BUCKETS.map((b) => ({
    ...b,
    n: b.statuses.reduce((s, st) => s + (byStatus?.[st] ?? 0), 0),
  }))
  const total = counts.reduce((s, b) => s + b.n, 0)

  return (
    <div className={className}>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          counts.map((b) =>
            b.n > 0 ? (
              <div key={b.key} className={cn('h-full', b.bar)} style={{ width: `${(b.n / total) * 100}%` }} />
            ) : null,
          )}
      </div>
      {showLegend && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {counts.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-1">
              <span className={cn('h-1.5 w-1.5 rounded-full', b.bar)} />
              {b.n} {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
