import { formatRelative } from '@/lib/time'

// "2h ago" with the exact timestamp on hover (and for screen readers).
export function RelativeTime({ date, className }: { date: string; className?: string }) {
  const exact = new Date(date).toLocaleString()
  return (
    <time dateTime={date} title={exact} aria-label={exact} className={className}>
      {formatRelative(date)}
    </time>
  )
}
