import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutGrid, List } from 'lucide-react'
import { cn } from '../lib/utils'

// Board ⇄ list segmented control. Remembers the last-used view so project
// links elsewhere can honor it later.
export const VIEW_PREF_KEY = 'agentpm-project-view'

export default function ViewToggle({ slug, projectSlug, active }: { slug: string; projectSlug: string; active: 'board' | 'list' }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const base = `/orgs/${slug}/projects/${projectSlug}`
  const go = (view: 'board' | 'list') => {
    localStorage.setItem(VIEW_PREF_KEY, view)
    if (view !== active) navigate(view === 'board' ? `${base}/board` : `${base}/list`)
  }
  const btn = (view: 'board' | 'list', Icon: typeof LayoutGrid, label: string) => (
    <button
      onClick={() => go(view)}
      aria-pressed={active === view}
      title={label}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded px-2 text-xs transition-colors',
        active === view ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
      {btn('board', LayoutGrid, t('list.viewBoard'))}
      {btn('list', List, t('list.viewList'))}
    </div>
  )
}
