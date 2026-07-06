import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AtSign,
  Bell,
  Eye,
  Flag,
  ListChecks,
  MessageSquare,
  Play,
  RefreshCw,
  Unlock,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { api } from '@/lib/api'
import { RelativeTime } from '@/components/RelativeTime'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Per-type icon + i18n label key; unknown/future types fall back to the bell.
const TYPE_META: Record<string, { icon: LucideIcon; label: string }> = {
  TICKET_ASSIGNED: { icon: UserPlus, label: 'notifications.types.assigned' },
  TICKET_STATUS_CHANGED: { icon: RefreshCw, label: 'notifications.types.statusChanged' },
  TICKET_COMMENTED: { icon: MessageSquare, label: 'notifications.types.commented' },
  MENTION: { icon: AtSign, label: 'notifications.types.mention' },
  WATCHER_ADDED: { icon: Eye, label: 'notifications.types.watcherAdded' },
  SPRINT_STARTED: { icon: Play, label: 'notifications.types.sprintStarted' },
  SPRINT_COMPLETED: { icon: Flag, label: 'notifications.types.sprintCompleted' },
  TICKET_UNBLOCKED: { icon: Unlock, label: 'notifications.types.unblocked' },
  SUBTASKS_DONE: { icon: ListChecks, label: 'notifications.types.subtasksDone' },
}

// Unread badge is seeded by /unread-count and kept live by Board's WS handler,
// which invalidates ['notifications'] / ['unreadCount'] on `notification.new`.
export function NotificationBell({ slug, projectSlug }: { slug: string; projectSlug: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const unread = useQuery({ queryKey: ['unreadCount'], queryFn: api.unreadCount })
  const list = useQuery({ queryKey: ['notifications'], queryFn: api.listNotifications })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['unreadCount'] })
  }

  const count = unread.data?.count ?? 0

  // E3 — group notifications by ticket ("3 updates on EMPL-42"); preserve the
  // API's newest-first order. Clicking a group marks all its items read.
  const items = list.data?.items ?? []
  const order: string[] = []
  const byTicket = new Map<string, typeof items>()
  for (const n of items) {
    const key = n.ticketId ?? n.id
    if (!byTicket.has(key)) {
      byTicket.set(key, [])
      order.push(key)
    }
    byTicket.get(key)!.push(n)
  }
  const groups = order.map((key) => {
    const groupItems = byTicket.get(key)!
    const latest = groupItems[0]
    return {
      key,
      latest,
      count: groupItems.length,
      unread: groupItems.filter((n) => !n.readAt).length,
      num: latest.subject?.match(/-(\d+)$/)?.[1],
      ids: groupItems.map((n) => n.id),
    }
  })

  const openGroup = async (g: (typeof groups)[number]) => {
    await Promise.all(g.ids.map((id) => api.markNotificationRead(id).catch(() => undefined)))
    refresh()
    if (g.num) navigate(`/orgs/${slug}/projects/${projectSlug}/board/ticket/${g.num}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('notifications.title')}>
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <div className="flex items-center justify-between px-1">
          <DropdownMenuLabel>{t('notifications.title')}</DropdownMenuLabel>
          {count > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={async () => {
                await api.markAllNotificationsRead().catch(() => undefined)
                refresh()
              }}
            >
              {t('notifications.markAllRead')}
            </Button>
          )}
        </div>
        {count > 0 && <p className="px-2 pb-1 text-[11px] text-muted-foreground">{t('notifications.catchUp', { count })}</p>}
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t('notifications.empty')}</p>
        )}
        {groups.map((g) => {
          const meta = TYPE_META[g.latest.type] ?? { icon: Bell, label: 'notifications.title' }
          const Icon = meta.icon
          return (
            <DropdownMenuItem key={g.key} className={g.unread === 0 ? 'opacity-60' : 'font-medium'} onClick={() => openGroup(g)}>
              <div className="flex w-full items-start gap-2">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">{g.count > 1 ? t('notifications.grouped', { count: g.count }) : g.latest.body}</span>
                    {g.unread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />}
                  </div>
                  {g.count > 1 && <span className="truncate text-xs text-muted-foreground">{g.latest.body}</span>}
                  <span className="text-[10px] text-muted-foreground">
                    {t(meta.label)} · <RelativeTime date={g.latest.createdAt} />
                  </span>
                </div>
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
