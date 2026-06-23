import { Outlet, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { logout } from '../lib/auth'

export default function Layout() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <Link to="/" className="text-lg font-semibold text-slate-900">
            AgentPM
          </Link>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>{me.data?.user.email}</span>
            <button
              onClick={() => logout()}
              className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
