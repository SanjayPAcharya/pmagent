import { login, register } from '../lib/auth'

export default function Landing() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-[360px] rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AgentPM</h1>
        <p className="mt-1 text-sm text-slate-500">AI-agent-first project management</p>
        <div className="mt-8 space-y-3">
          <button
            onClick={() => login()}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Sign in
          </button>
          <button
            onClick={() => register()}
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Create account
          </button>
        </div>
        <p className="mt-6 text-xs text-slate-400">
          Email/password and social sign-in (Google, Microsoft, GitHub) are presented on the
          secure Keycloak page.
        </p>
      </div>
    </main>
  )
}
