import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
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
        <DropdownMenuSeparator />
        {(list.data?.items ?? []).length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t('notifications.empty')}</p>
        )}
        {list.data?.items.map((n) => {
          const num = n.subject?.match(/-(\d+)$/)?.[1]
          return (
            <DropdownMenuItem
              key={n.id}
              className={n.readAt ? 'opacity-60' : 'font-medium'}
              onClick={async () => {
                await api.markNotificationRead(n.id).catch(() => undefined)
                refresh()
                if (num) navigate(`/orgs/${slug}/projects/${projectSlug}/ticket/${num}`)
              }}
            >
              <div className="flex flex-col">
                <span className="text-sm">{n.body}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
