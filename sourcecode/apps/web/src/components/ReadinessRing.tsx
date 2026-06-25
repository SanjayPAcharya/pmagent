import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

// A1 — "agent-readiness": how much of the structured spec (goal / acceptance
// criteria / constraints) a ticket has filled in. The richer these are, the more
// an agent can actually pick the ticket up. Pure derived UI over existing fields.
type ReadinessFields = { goal: string | null; acceptanceCriteria: string | null; constraints: string | null }

export function ticketReadiness(t: ReadinessFields) {
  const fields = [t.goal, t.acceptanceCriteria, t.constraints]
  const filled = fields.filter((f) => (f ?? '').trim().length > 0).length
  return { filled, total: fields.length, pct: filled / fields.length }
}

export function ReadinessRing({
  ticket,
  size = 16,
  className,
}: {
  ticket: ReadinessFields
  size?: number
  className?: string
}) {
  const { t } = useTranslation()
  const { filled, total, pct } = ticketReadiness(ticket)
  const stroke = 2
  const r = size / 2 - stroke
  const circ = 2 * Math.PI * r
  // green when fully ready, amber while partial, muted when empty.
  const color = filled === total ? 'text-green-500' : filled === 0 ? 'text-muted-foreground/40' : 'text-amber-500'
  const label = t('readiness.label', { filled, total })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('shrink-0', color, className)}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  )
}
