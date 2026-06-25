import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'

// F1 — tiny inline burndown: ideal line (dashed) vs actual remaining work,
// reconstructed server-side from activity. Renders nothing until there's data.
export function BurndownSparkline({ sprintId }: { sprintId: string }) {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['burndown', sprintId], queryFn: () => api.getBurndown(sprintId) })
  const data = q.data
  if (!data || data.total === 0 || data.points.length < 2) return null

  const W = 260
  const H = 56
  const pad = 4
  const n = data.points.length
  const x = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad)
  const y = (v: number) => pad + (1 - v / data.total) * (H - 2 * pad)

  const ideal = data.points.map((p, i) => `${x(i)},${y(p.ideal)}`).join(' ')
  const actualPts = data.points
    .map((p, i) => (p.remaining == null ? null : `${x(i)},${y(p.remaining)}`))
    .filter(Boolean)
    .join(' ')

  const last = [...data.points].reverse().find((p) => p.remaining != null)

  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>{t('sprints.burndown')}</span>
        {last && <span>{t('sprints.burndownRemaining', { remaining: last.remaining, unit: t(`sprints.unit.${data.unit}`) })}</span>}
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full" role="img" aria-label={t('sprints.burndown')}>
        <polyline points={ideal} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} strokeDasharray="3 3" className="text-muted-foreground" />
        {actualPts && <polyline points={actualPts} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      </svg>
    </div>
  )
}
