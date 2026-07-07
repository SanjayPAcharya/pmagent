import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The one empty-state idiom: a muted lucide icon + message + optional CTA slot,
// on the bordered-card look from Dashboard. Pass `className="border-0
// bg-transparent py-6"` for the bare variant used inside a table cell / list.
export function EmptyState({
  icon: Icon,
  message,
  cta,
  className,
}: {
  icon: LucideIcon
  message: string
  cta?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border bg-card px-4 py-10 text-center', className)}>
      <Icon className="mx-auto h-8 w-8 text-muted-foreground/50" />
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  )
}
