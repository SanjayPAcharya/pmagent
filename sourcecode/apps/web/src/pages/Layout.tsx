import { useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { logout } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { useOrgAccent } from '../lib/accent'
import { Button } from '@/components/ui/button'
import { CommandPalette } from '@/components/CommandPalette'
import { KeyboardHelp } from '@/components/KeyboardHelp'

export default function Layout() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const { theme, cycle } = useTheme()
  const { t } = useTranslation()

  // G2 — apply the current org's accent to --primary (cleared off org pages).
  const orgSlug = useLocation().pathname.match(/^\/orgs\/([^/]+)/)?.[1]
  const org = useQuery({ queryKey: ['org', orgSlug], queryFn: () => api.getOrg(orgSlug!), enabled: Boolean(orgSlug) })
  useOrgAccent(orgSlug ? org.data?.org.accentColor : null)

  // G2 — "t" cycles light → dark → system (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 't' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      cycle()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cycle])

  const ThemeIcon = theme === 'dark' ? Sun : theme === 'light' ? Moon : Monitor
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-6 py-3">
          <Link to="/" className="text-lg font-semibold text-foreground">
            {t('common.appName')}
          </Link>
          <div className="flex items-center gap-2 text-sm text-muted-foreground sm:gap-3">
            <span className="hidden max-w-[40vw] truncate sm:inline">{me.data?.user.email}</span>
            <Button variant="ghost" size="icon" onClick={cycle} title={t('theme.cycle', { theme: t(`theme.${theme}`) })} aria-label={t('theme.cycle', { theme: t(`theme.${theme}`) })}>
              <ThemeIcon className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              {t('common.signOut')}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] px-6 py-8">
        <Outlet />
      </main>
      <CommandPalette />
      <KeyboardHelp />
    </div>
  )
}
