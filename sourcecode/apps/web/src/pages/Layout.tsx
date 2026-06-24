import { Outlet, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { logout } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { Button } from '@/components/ui/button'

export default function Layout() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const { theme, toggle } = useTheme()
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-6 py-3">
          <Link to="/" className="text-lg font-semibold text-foreground">
            {t('common.appName')}
          </Link>
          <div className="flex items-center gap-2 text-sm text-muted-foreground sm:gap-3">
            <span className="hidden max-w-[40vw] truncate sm:inline">{me.data?.user.email}</span>
            <Button variant="ghost" size="icon" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
    </div>
  )
}
