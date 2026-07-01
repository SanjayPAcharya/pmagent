import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Density = 'grid' | 'list'

// Grid ⇄ list switch. Pair with useLocalStorageState to persist the choice.
export function DensityToggle({
  value,
  onChange,
  className,
}: {
  value: Density
  onChange: (d: Density) => void
  className?: string
}) {
  const items: [Density, typeof LayoutGrid, string][] = [
    ['grid', LayoutGrid, 'Grid view'],
    ['list', List, 'List view'],
  ]
  return (
    <div className={cn('inline-flex rounded-lg border border-input p-0.5', className)}>
      {items.map(([mode, Icon, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-label={label}
          aria-pressed={value === mode}
          className={cn(
            'rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground',
            value === mode && 'bg-accent text-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}
