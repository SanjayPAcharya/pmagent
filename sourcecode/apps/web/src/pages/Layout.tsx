import { Outlet, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { logout } from '../lib/auth'
import { Button } from '@/components/ui/button'

export default function Layout() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <Link to="/" className="text-lg font-semibold text-foreground">
            AgentPM
          </Link>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{me.data?.user.email}</span>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
