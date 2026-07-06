import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// A checkbox-list dropdown for multi-value filters (board/list). Selecting keeps
// the menu open; the trigger summarises the current selection.
export interface MultiOption {
  value: string
  label: string
}

export function MultiSelect({
  placeholder,
  options,
  selected,
  onChange,
  className,
}: {
  placeholder: string
  options: MultiOption[]
  selected: string[]
  onChange: (next: string[]) => void
  className?: string
}) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? labelOf(selected[0])
        : `${labelOf(selected[0])} +${selected.length - 1}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md border px-2 text-sm',
            selected.length > 0 ? 'border-primary/50 text-foreground' : 'border-input text-muted-foreground hover:text-foreground',
            className,
          )}
        >
          <span className="max-w-[11rem] truncate">{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {options.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">—</div>}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => toggle(o.value)}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="truncate">{o.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
