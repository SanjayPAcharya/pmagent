import { useTranslation } from 'react-i18next'
import { Sparkles, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAIHealth, aiButtonState } from '@/lib/useAIHealth'

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

// 3.8 B1 — the live AI entry point. Enabled when the self-hosted model is reachable
// and ready; otherwise disabled with a reason tooltip (unavailable / model loading).
// Replaces BetaAIButton at each wired call site (board, drawer, overview).
export function AIButton({
  label,
  onClick,
  busy = false,
  disabled = false,
  className,
}: {
  label: string
  onClick: () => void
  busy?: boolean
  disabled?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const health = useAIHealth()
  const { ready, reasonKey } = aiButtonState(health.data)
  const off = !ready || disabled || health.isLoading
  const title = health.isLoading
    ? t('ai.checking')
    : reasonKey
      ? t(reasonKey)
      : undefined

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off || busy}
      aria-disabled={off || busy}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
        off || busy
          ? 'cursor-not-allowed text-muted-foreground opacity-70'
          : 'text-foreground hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      ) : (
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      )}
      <span>{busy ? t('ai.generating') : label}</span>
    </button>
  )
}
