import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// 3.7 R10 — single source for the "Beta" AI copy. The agent features land after
// Phase 5 (owner decision); until then these affordances are visible but inert
// (disabled, no handlers, no network). Reuse everywhere so the wording is one edit.

export function BetaBadge({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium text-muted-foreground', className)} title={t('common.betaTooltip')}>
      {t('common.beta')}
    </Badge>
  )
}

/** A disabled "sparkle" AI entry point with a Beta tag. Inert by design. */
export function BetaAIButton({ label, className }: { label: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={t('common.betaTooltip')}
      className={cn(
        'inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground opacity-70',
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5 text-primary" />
      <span>{label}</span>
      <BetaBadge />
    </button>
  )
}
