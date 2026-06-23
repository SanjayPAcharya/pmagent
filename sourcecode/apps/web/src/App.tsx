import { useEffect, useState } from 'react'

type ApiState = 'checking…' | 'connected' | 'unreachable' | 'unexpected'

export default function App() {
  const [api, setApi] = useState<ApiState>('checking…')

  useEffect(() => {
    const base = (import.meta.env.VITE_API_URL as string) ?? ''
    fetch(`${base}/health`)
      .then((r) => r.json())
      .then((d) => setApi(d?.status === 'ok' ? 'connected' : 'unexpected'))
      .catch(() => setApi('unreachable'))
  }, [])

  const dot =
    api === 'connected'
      ? 'bg-emerald-500'
      : api === 'checking…'
        ? 'bg-amber-400'
        : 'bg-rose-500'

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="rounded-2xl border border-slate-200 bg-white px-10 py-8 shadow-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          AgentPM
        </h1>
        <p className="mt-1 text-sm text-slate-500">Phase 1 · Stage A skeleton</p>
        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-600">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
          API: <span className="font-mono text-slate-900">{api}</span>
        </div>
      </div>
    </main>
  )
}
