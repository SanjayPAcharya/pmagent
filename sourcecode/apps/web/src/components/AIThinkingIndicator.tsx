import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStagedHint } from '@/lib/aiReveal'
import { cn } from '@/lib/utils'

// 3.8.1 B4 — modern "thinking" loader shown while an AI generation is in flight,
// before the result streams in (replaces the earlier result-shaped skeletons).
// A sparkle + a gradient-shimmered stage word (Thinking → Cooking → Finishing,
// rising in on each change) + bouncing dots, with an optional Cancel.
//
// The stage word must NOT sit in an aria-live region (it would announce every
// change) — callers pair this with a separate sr-only start/done announcement.
export function AIThinkingIndicator({
  active,
  onCancel,
  className,
}: {
  active: boolean
  onCancel?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const stageKey = useStagedHint(active)
  if (!active) return null
  return (
    <div aria-busy="true" className={cn('flex items-center gap-2 rounded-md border bg-background px-3 py-2.5', className)}>
      <Sparkles className="h-4 w-4 shrink-0 text-primary motion-safe:animate-pulse" aria-hidden="true" />
      <span
        key={stageKey ?? ''}
        className="ai-shimmer-text text-sm font-medium motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
      >
        {stageKey ? t(stageKey) : ''}
      </span>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        <span className="ai-dot h-1 w-1 rounded-full bg-primary" style={{ animationDelay: '0ms' }} />
        <span className="ai-dot h-1 w-1 rounded-full bg-primary" style={{ animationDelay: '150ms' }} />
        <span className="ai-dot h-1 w-1 rounded-full bg-primary" style={{ animationDelay: '300ms' }} />
      </span>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {t('common.cancel')}
        </button>
      )}
    </div>
  )
}
