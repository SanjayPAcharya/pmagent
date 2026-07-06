import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Moon, Sun, Monitor } from 'lucide-react'
import { api } from '@/lib/api'
import { useTheme, type Theme } from '@/lib/theme'
import { cn, initialsOf } from '@/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// /account — the user's own profile. Email is owned by Keycloak (read-only
// here); name + avatar URL live on our User row via PATCH /api/me. No upload
// infra yet, so the avatar is a URL, not a file.
const THEME_OPTIONS: { value: Theme; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
]

export default function AccountSettings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { theme, setTheme } = useTheme()
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const user = me.data?.user

  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  useEffect(() => {
    if (user) {
      setName(user.name)
      setAvatarUrl(user.avatarUrl ?? '')
    }
  }, [user])

  const dirty = user && (name.trim() !== user.name || avatarUrl.trim() !== (user.avatarUrl ?? ''))

  const save = async () => {
    if (!user || !name.trim()) return
    try {
      await api.updateMe({
        name: name.trim(),
        avatarUrl: avatarUrl.trim() || null,
      })
      qc.invalidateQueries({ queryKey: ['me'] })
      toast.success(t('account.saved'))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-xl font-semibold text-foreground">{t('account.title')}</h2>

      {me.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('account.profile')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                {avatarUrl.trim() && <AvatarImage src={avatarUrl.trim()} alt={name} />}
                <AvatarFallback className="text-sm">{user ? initialsOf(name, user.email) : '?'}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('account.name')}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('account.avatarUrl')}</label>
              <Input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('account.avatarHint')}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('account.email')}</label>
              <Input value={user?.email ?? ''} disabled className="mt-1" />
              <p className="mt-1 text-xs text-muted-foreground">{t('account.emailHint')}</p>
            </div>
            <Button size="sm" onClick={() => void save()} disabled={!dirty || !name.trim()}>
              {t('common.save')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('account.appearance')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm capitalize transition-colors',
                  theme === value
                    ? 'border-primary/40 bg-primary/10 font-medium text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {t(`theme.${value}`)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
