import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { type ActivityItem, type TicketStatus } from '@/lib/api'
import { STATUS_LABEL } from '@/lib/board'
import { formatRelative } from '@/lib/time'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)) || '?').toUpperCase()
}

function verb(item: ActivityItem, t: (k: string, o?: Record<string, unknown>) => string): string {
  const label = (v: string | null) => (v && v in STATUS_LABEL ? STATUS_LABEL[v as TicketStatus] : v)
  switch (item.type) {
    case 'CREATED':
      return t('activity.created')
    case 'STATUS_CHANGED':
      return t('activity.statusChanged', { status: label(item.toValue) ?? '' })
    case 'PRIORITY_CHANGED':
      return t('activity.priorityChanged', { priority: (item.toValue ?? '').toLowerCase() })
    case 'ASSIGNED':
      return t('activity.assigned')
    case 'SPRINT_CHANGED':
      return t('activity.sprintChanged')
    case 'WATCHER_ADDED':
      return t('activity.watched')
    case 'WATCHER_REMOVED':
      return t('activity.unwatched')
    default:
      return t('activity.updated')
  }
}

export function ActivityFeed({ orgSlug, items }: { orgSlug: string; items: ActivityItem[] }) {
  const { t } = useTranslation()
  if (items.length === 0) return null

  return (
    <section className="mt-8">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{t('activity.title')}</h3>
      <ul className="divide-y divide-border rounded-lg border bg-card px-4">
        {items.slice(0, 10).map((a) => {
          const actorName = a.actor?.name ?? t('activity.system')
          return (
            <li key={a.id} className="flex items-start gap-2.5 py-2.5 text-sm">
              <Avatar className="mt-0.5 h-6 w-6">
                {a.actor?.avatarUrl ? <AvatarImage src={a.actor.avatarUrl} alt={actorName} /> : null}
                <AvatarFallback className="text-[10px]">{initialsOf(actorName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-foreground">
                  <span className="font-medium">{actorName}</span>{' '}
                  <span className="text-muted-foreground">{verb(a, t)}</span>{' '}
                  <Link
                    to={`/orgs/${orgSlug}/projects/${a.ticket.projectSlug}/ticket/${a.ticket.number}`}
                    className="font-medium hover:underline"
                  >
                    {a.ticket.projectKey}-{a.ticket.number}
                  </Link>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.ticket.title} · {formatRelative(a.createdAt)}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
