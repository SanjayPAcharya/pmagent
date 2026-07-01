import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Small stat tile: muted label above, large number below. Use in a grid of 2–4.
export function MetricChip({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg bg-muted/50 px-3 py-2', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold text-foreground">{value}</div>
    </div>
  )
}
