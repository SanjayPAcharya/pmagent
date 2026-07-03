import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import type { Organization } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useLocalStorageState } from '@/lib/useLocalStorage'

// Getting-started checklist (Dashboard). Progress is derived from data the
// dashboard already fetches plus two local "did it once" flags set elsewhere:
//   agentpm-onboard-moved   — Board sets it on the first status move
//   agentpm-onboard-palette — CommandPalette sets it on first open
// Dismissed state persists; the card also disappears once every step is done.
export const ONBOARD_MOVED_KEY = 'agentpm-onboard-moved'
export const ONBOARD_PALETTE_KEY = 'agentpm-onboard-palette'

const flag = (key: string) => typeof window !== 'undefined' && localStorage.getItem(key) === '1'

export function GettingStarted({ orgs }: { orgs: Organization[] }) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useLocalStorageState('agentpm-onboard-dismissed', false)

  const firstOrg = orgs[0]
  const steps: { key: string; done: boolean; to?: string; onClick?: () => void }[] = [
    { key: 'org', done: orgs.length > 0 },
    {
      key: 'project',
      done: orgs.some((o) => (o.projectCount ?? 0) > 0),
      to: firstOrg ? `/orgs/${firstOrg.slug}` : undefined,
    },
    {
      key: 'ticket',
      done: orgs.some((o) => (o.openTicketCount ?? 0) > 0) || flag(ONBOARD_MOVED_KEY),
      to: firstOrg ? `/orgs/${firstOrg.slug}` : undefined,
    },
    {
      key: 'move',
      done: flag(ONBOARD_MOVED_KEY),
      to: firstOrg ? `/orgs/${firstOrg.slug}` : undefined,
    },
    {
      key: 'invite',
      done: orgs.some((o) => (o.memberCount ?? 0) > 1),
      to: firstOrg ? `/orgs/${firstOrg.slug}/members` : undefined,
    },
    {
      key: 'palette',
      done: flag(ONBOARD_PALETTE_KEY),
      onClick: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })),
    },
  ]
  const doneCount = steps.filter((s) => s.done).length

  if (dismissed || doneCount === steps.length) return null

  const row = (s: (typeof steps)[number]) => {
    const label = t(`onboard.${s.key}`)
    const hint = t(`onboard.${s.key}Hint`)
    const inner = (
      <>
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
            s.done ? 'border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500' : 'border-muted-foreground/40',
          )}
        >
          {s.done && <Check className="h-3 w-3" />}
        </span>
        <span className={cn('text-sm', s.done ? 'text-muted-foreground line-through' : 'font-medium text-foreground')}>{label}</span>
        {!s.done && <span className="hidden text-xs text-muted-foreground sm:inline">— {hint}</span>}
      </>
    )
    const cls = 'flex items-center gap-2 rounded-md px-2 py-1.5'
    if (s.done) return <li key={s.key} className={cls}>{inner}</li>
    if (s.to)
      return (
        <li key={s.key}>
          <Link to={s.to} className={cn(cls, 'hover:bg-accent')}>{inner}</Link>
        </li>
      )
    return (
      <li key={s.key}>
        <button onClick={s.onClick} className={cn(cls, 'w-full text-left hover:bg-accent')}>{inner}</button>
      </li>
    )
  }

  return (
    <div className="mt-6 rounded-lg border bg-card p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t('onboard.title')}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{t('onboard.progress', { done: doneCount, total: steps.length })}</span>
          <button
            onClick={() => setDismissed(true)}
            aria-label={t('onboard.dismiss')}
            title={t('onboard.dismiss')}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ul className="space-y-0.5">{steps.map(row)}</ul>
    </div>
  )
}
