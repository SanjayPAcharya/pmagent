import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Ban, Eye, UserCircle2 } from 'lucide-react'
import { api, type TicketHit } from '../lib/api'
import { PRIORITY_CLASS, STATUS_LABEL } from '../lib/board'
import { formatRelative } from '../lib/time'
import { cn } from '../lib/utils'
import { Skeleton } from '../components/ui/skeleton'

// Everything relevant to me, across all orgs: assigned first, watching second.
// Brand-new accounts (no orgs) get a welcome pointing at the next step instead
// of two empty lists — this page must never be a dead-end.
export default function MyWork() {
  const { t } = useTranslation()
  const work = useQuery({ queryKey: ['my-work'], queryFn: api.myWork })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: api.listOrgs })

  if (orgs.data && orgs.data.organizations.length === 0) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-xl border bg-card p-8 text-center">
        <UserCircle2 className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-3 text-lg font-semibold text-foreground">{t('mywork.noOrgsTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('mywork.noOrgsHint')}</p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('mywork.goCreate')}
        </Link>
      </div>
    )
  }

  const row = (tk: TicketHit) => (
    <li key={tk.id}>
      <Link
        to={`/orgs/${tk.orgSlug}/projects/${tk.projectSlug}/ticket/${tk.number}`}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent"
      >
        <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{tk.key}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{tk.title}</span>
        {(tk.blockedBy ?? 0) > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            <Ban className="h-3 w-3" /> {t('list.blocked')}
          </span>
        )}
        <span className={cn('hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline', PRIORITY_CLASS[tk.priority])}>
          {tk.priority}
        </span>
        <span className="hidden w-24 shrink-0 text-xs text-muted-foreground md:inline">{STATUS_LABEL[tk.status]}</span>
        <span className="hidden w-28 shrink-0 truncate text-right text-xs text-muted-foreground lg:inline">{tk.projectSlug}</span>
        <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground sm:inline">{formatRelative(tk.updatedAt)}</span>
      </Link>
    </li>
  )

  const section = (title: React.ReactNode, items: TicketHit[] | undefined, emptyKey: string) => (
    <section className="mb-8">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">{title}</h3>
      <ul className="divide-y divide-border rounded-lg border bg-card">
        {!items
          ? Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </li>
            ))
          : items.length === 0
            ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t(emptyKey)}</li>
            : items.map(row)}
      </ul>
    </section>
  )

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-6 text-xl font-semibold text-foreground">{t('mywork.title')}</h2>
      {work.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(work.error as Error).message}
        </div>
      ) : (
        <>
          {section(
            <><UserCircle2 className="h-4 w-4" /> {t('mywork.assigned')} {work.data && <span className="text-xs font-normal text-muted-foreground">({work.data.assigned.length})</span>}</>,
            work.data?.assigned,
            'mywork.emptyAssigned',
          )}
          {section(
            <><Eye className="h-4 w-4" /> {t('mywork.watching')} {work.data && <span className="text-xs font-normal text-muted-foreground">({work.data.watching.length})</span>}</>,
            work.data?.watching,
            'mywork.emptyWatching',
          )}
        </>
      )}
    </div>
  )
}
