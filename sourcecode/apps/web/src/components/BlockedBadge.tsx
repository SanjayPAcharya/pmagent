import { useTranslation } from 'react-i18next'
import { Ban } from 'lucide-react'
import { cn } from '@/lib/utils'

// The one blocked/blocker pill, on the --destructive token (replaces five
// hand-rolled bg-red-100/text-red-700 copies). Pass `count` to show a number
// (open-blocker count) instead of the "Blocked" label; `showIcon={false}` for
// the collapsed drawer header; `className` for layout tweaks (e.g. ml-auto).
export function BlockedBadge({
  count,
  showIcon = true,
  title,
  className,
}: {
  count?: number
  showIcon?: boolean
  title?: string
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive',
        className,
      )}
    >
      {showIcon && <Ban className="h-3 w-3" />}
      {count !== undefined ? count : t('list.blocked')}
    </span>
  )
}
