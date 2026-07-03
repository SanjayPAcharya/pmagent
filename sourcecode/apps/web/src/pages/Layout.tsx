import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Moon, Sun, Monitor, Menu, PanelLeftOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { logout } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { useOrgAccent } from '../lib/accent'
import { useLocalStorageState } from '../lib/useLocalStorage'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { OrgTree } from '@/components/OrgTree'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CommandPalette } from '@/components/CommandPalette'
import { KeyboardHelp } from '@/components/KeyboardHelp'

export default function Layout() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const { theme, cycle } = useTheme()
  const { t } = useTranslation()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useLocalStorageState('agentpm-tree-collapsed', false)

  // G2 — apply the current org's accent to --primary (cleared off org pages).
  const orgSlug = location.pathname.match(/^\/orgs\/([^/]+)/)?.[1]
  const org = useQuery({ queryKey: ['org', orgSlug], queryFn: () => api.getOrg(orgSlug!), enabled: Boolean(orgSlug) })
  useOrgAccent(orgSlug ? org.data?.org.accentColor : null)

  // Close the mobile nav sheet whenever the route changes.
  useEffect(() => setMobileNavOpen(false), [location.pathname])

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
    <div className="flex min-h-screen flex-col bg-background">
      {/* Chrome (header + rail) sits on a quiet muted tint; content stays on the
          clean background — subtle two-surface split, hairline borders only. */}
      <header className="sticky top-0 z-30 border-b bg-muted/40 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label={t('nav.openMenu')}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link to="/" className="shrink-0 text-lg font-semibold text-foreground">
            {t('common.appName')}
          </Link>
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground sm:gap-3">
            <span className="hidden max-w-[30vw] truncate lg:inline">{me.data?.user.email}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={cycle}
              title={t('theme.cycle', { theme: t(`theme.${theme}`) })}
              aria-label={t('theme.cycle', { theme: t(`theme.${theme}`) })}
            >
              <ThemeIcon className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              {t('common.signOut')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1">
        {/* Desktop rail */}
        {collapsed ? (
          <div className="hidden shrink-0 border-r bg-muted/40 p-2 lg:block">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(false)}
              aria-label={t('tree.expand')}
              title={t('tree.expand')}
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-hidden border-r bg-muted/40 lg:block">
            <OrgTree onCollapse={() => setCollapsed(true)} />
          </aside>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile nav sheet */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">{t('tree.title')}</SheetTitle>
          <OrgTree onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <CommandPalette />
      <KeyboardHelp />
    </div>
  )
}
