import { ListFilter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// Shared filter popover — one "Filters" button (Jira-style) that holds every
// filter for a view, so toolbars stay on a single line. Each group is a set of
// checkboxes; the trigger shows the total active count. Used by Board, List and
// Timeline via a `FilterGroup[]` config so the three screens filter identically.
export interface FilterGroup {
  key: string
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}

export function FilterBar({ groups, className }: { groups: FilterGroup[]; className?: string }) {
  const { t } = useTranslation()
  const total = groups.reduce((n, g) => n + g.selected.length, 0)
  const clearAll = () => groups.forEach((g) => g.selected.length && g.onChange([]))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors',
            total > 0 ? 'border-primary/50 text-foreground' : 'border-input text-muted-foreground hover:text-foreground',
            className,
          )}
        >
          <ListFilter className="h-3.5 w-3.5" />
          {t('filters.button')}
          {total > 0 && <span className="rounded-full bg-primary/15 px-1.5 text-xs font-medium text-primary">{total}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] w-60 overflow-y-auto">
        {groups.map((g, i) => {
          const toggle = (v: string) =>
            g.onChange(g.selected.includes(v) ? g.selected.filter((x) => x !== v) : [...g.selected, v])
          return (
            <div key={g.key}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="flex items-center justify-between gap-2">
                <span>{g.label}</span>
                {g.selected.length > 0 && (
                  <button
                    onClick={() => g.onChange([])}
                    className="text-[11px] font-normal text-muted-foreground hover:text-foreground"
                  >
                    {t('filters.clear')}
                  </button>
                )}
              </DropdownMenuLabel>
              {g.options.length === 0 ? (
                <div className="px-2 py-1 text-xs text-muted-foreground">—</div>
              ) : (
                g.options.map((o) => (
                  <DropdownMenuCheckboxItem
                    key={o.value}
                    checked={g.selected.includes(o.value)}
                    onCheckedChange={() => toggle(o.value)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {o.label}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </div>
          )
        })}
        {total > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                clearAll()
              }}
              className="justify-center text-sm text-muted-foreground"
            >
              {t('filters.clearAll', { count: total })}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
