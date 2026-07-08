import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Moon, Sun, Monitor, Loader2, Download } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { logout } from '@/lib/auth'
import { useTheme, type Theme } from '@/lib/theme'
import { cn, initialsOf } from '@/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/components/ui/field-error'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DangerZone } from '@/components/DangerZone'

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
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  useEffect(() => {
    if (user) {
      setName(user.name)
      setAvatarUrl(user.avatarUrl ?? '')
    }
  }, [user])

  const dirty = user && (name.trim() !== user.name || avatarUrl.trim() !== (user.avatarUrl ?? ''))

  const save = async () => {
    if (!user || !name.trim()) return
    setBusy(true)
    try {
      await api.updateMe({
        name: name.trim(),
        avatarUrl: avatarUrl.trim() || null,
      })
      qc.invalidateQueries({ queryKey: ['me'] })
      toast.success(t('account.saved'))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const downloadExport = async () => {
    setExporting(true)
    try {
      const { blob, filename } = await api.exportMyData()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('account.exportDownloaded'))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setExporting(false)
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
              <label htmlFor="account-name" className="text-xs text-muted-foreground">{t('account.name')}</label>
              <Input
                id="account-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={Boolean(user) && !name.trim()}
                className="mt-1"
              />
              <FieldError>{user && !name.trim() ? t('account.nameRequired') : null}</FieldError>
            </div>
            <div>
              <label htmlFor="account-avatar" className="text-xs text-muted-foreground">{t('account.avatarUrl')}</label>
              <Input
                id="account-avatar"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('account.avatarHint')}</p>
            </div>
            <div>
              <label htmlFor="account-email" className="text-xs text-muted-foreground">{t('account.email')}</label>
              <Input id="account-email" value={user?.email ?? ''} disabled className="mt-1" />
              <p className="mt-1 text-xs text-muted-foreground">{t('account.emailHint')}</p>
            </div>
            <Button size="sm" onClick={() => void save()} disabled={!dirty || !name.trim() || busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('account.privacyTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('account.exportHint')}</p>
          <Button size="sm" variant="outline" onClick={() => void downloadExport()} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t('account.exportData')}
          </Button>
        </CardContent>
      </Card>

      {user && (
        <>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DangerZone
            title={t('account.deleteTitle')}
            description={t('account.deleteWarning')}
            confirmLabel={user.email}
            confirmHint={t('settings.typeToConfirm', { name: user.email })}
            actionLabel={t('account.deleteAction')}
            onDelete={async () => {
              setDeleteError(null)
              try {
                await api.deleteMyAccount()
                void logout()
              } catch (e) {
                if (e instanceof ApiError && e.code === 'SOLE_OWNER') {
                  setDeleteError(e.message)
                } else {
                  toast.error((e as Error).message)
                }
              }
            }}
          />
        </>
      )}
    </div>
  )
}
