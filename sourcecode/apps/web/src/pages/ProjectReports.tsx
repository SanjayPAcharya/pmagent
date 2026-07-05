import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api, type CycleReport, type ReadinessMilestone, type VelocityPoint, type WorkloadRow } from '@/lib/api'
import { initialsOf } from '@/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// 3.3 R5 — the project Reports tab. Charts stay hand-rolled inline SVG,
// following the BurndownSparkline precedent (no chart lib).

/** R1 — velocity bars across completed sprints. */
function VelocityChart({ points }: { points: VelocityPoint[] }) {
  const { t } = useTranslation()
  const data = points.map((p) => ({ ...p, velocity: p.velocity ?? 0 }))
  const max = Math.max(...data.map((p) => p.velocity), 1)
  const W = 560
  const H = 160
  const padB = 34
  const padT = 14
  const gap = 10
  const bw = Math.min(64, (W - gap) / data.length - gap)
  const x = (i: number) => gap + i * (bw + gap)
  const barH = (v: number) => (v / max) * (H - padT - padB)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label={t('reports.velocity')}>
      {data.map((p, i) => (
        <g key={p.id}>
          <rect
            x={x(i)}
            y={H - padB - barH(p.velocity)}
            width={bw}
            height={barH(p.velocity)}
            rx={3}
            fill="hsl(var(--primary))"
            fillOpacity={0.85}
          />
          <text
            x={x(i) + bw / 2}
            y={H - padB - barH(p.velocity) - 4}
            textAnchor="middle"
            className="fill-foreground"
            fontSize={11}
            fontWeight={600}
          >
            {p.velocity}
          </text>
          <text x={x(i) + bw / 2} y={H - padB + 14} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
            {p.name.length > 12 ? `${p.name.slice(0, 11)}…` : p.name}
          </text>
          {p.endDate && (
            <text x={x(i) + bw / 2} y={H - padB + 27} textAnchor="middle" className="fill-muted-foreground" fontSize={9} opacity={0.7}>
              {new Date(p.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

/** R2 — weekly lead/cycle median trend (two polylines). */
function CycleTrend({ cycle }: { cycle: CycleReport }) {
  const { t } = useTranslation()
  const weeks = cycle.weekly
  if (weeks.length < 2) return null
  const W = 560
  const H = 120
  const pad = 8
  const padB = 18
  const max = Math.max(...weeks.flatMap((w) => [w.leadMedianDays ?? 0, w.cycleMedianDays ?? 0]), 1)
  const x = (i: number) => pad + (i / (weeks.length - 1)) * (W - 2 * pad)
  const y = (v: number) => pad + (1 - v / max) * (H - pad - padB)
  const line = (pick: (w: (typeof weeks)[number]) => number | null) =>
    weeks
      .map((w, i) => (pick(w) == null ? null : `${x(i)},${y(pick(w)!)}`))
      .filter(Boolean)
      .join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label={t('reports.cycleTrend')}>
        <polyline points={line((w) => w.leadMedianDays)} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 3" className="text-muted-foreground" />
        <polyline points={line((w) => w.cycleMedianDays)} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {weeks.map((w, i) => (
          <text key={w.weekStart} x={x(i)} y={H - 4} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
            {new Date(w.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-primary" /> {t('reports.cycleLine')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t border-dashed border-muted-foreground" /> {t('reports.leadLine')}
        </span>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

/** R4 — open tickets per member, proportional bars. */
function WorkloadList({ rows }: { rows: WorkloadRow[] }) {
  const { t } = useTranslation()
  const max = Math.max(...rows.map((r) => r.openCount), 1)
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.userId ?? 'unassigned'} className="flex items-center gap-3">
          <Avatar className="h-6 w-6 shrink-0">
            {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.name} />}
            <AvatarFallback className="text-[10px]">{r.userId ? initialsOf(r.name) : '—'}</AvatarFallback>
          </Avatar>
          <span className="w-32 shrink-0 truncate text-sm text-foreground">
            {r.userId ? r.name : t('reports.unassigned')}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
            <div className="h-full rounded bg-primary/70" style={{ width: `${(r.openCount / max) * 100}%` }} />
          </div>
          <span className="w-44 shrink-0 text-right text-xs text-muted-foreground">
            {t('reports.openCount', { count: r.openCount })}
            {r.inProgressCount > 0 && ` · ${t('reports.inProgressCount', { count: r.inProgressCount })}`}
            {r.adhocCount > 0 && ` · ${t('reports.workstreamSplit', { sprint: r.sprintCount, adhoc: r.adhocCount })}`}
          </span>
        </li>
      ))}
    </ul>
  )
}

// R14 — completed-vs-pending donut (hand-rolled SVG, two arcs via dasharray).
function ReadinessDonut({ done, open }: { done: number; open: number }) {
  const { t } = useTranslation()
  const total = done + open
  const pct = total ? Math.round((done / total) * 100) : 0
  const size = 104
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const doneLen = c * (total ? done / total : 0)
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t('reports.readinessOverall', { pct })}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        {total > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#10b981"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${doneLen} ${c - doneLen}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <text x={size / 2} y={size / 2 + 6} textAnchor="middle" fill="hsl(var(--foreground))" className="text-lg font-semibold">{pct}%</text>
      </svg>
      <span className="text-xs text-muted-foreground">{t('reports.readinessDoneOpen', { done, open })}</span>
    </div>
  )
}

function ReleaseReadiness({ readiness, overall, backHref }: { readiness: ReadinessMilestone[]; overall: { done: number; open: number }; backHref: string }) {
  const { t } = useTranslation()
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <ReadinessDonut done={overall.done} open={overall.open} />
      <div className="min-w-0 flex-1 space-y-3">
        {readiness.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t('reports.readinessEmpty')}{' '}
            <Link to={backHref} className="text-foreground hover:underline">{t('nav.overview')}</Link>
          </p>
        ) : (
          readiness.map((m) => {
            const pct = m.total ? Math.round((m.done / m.total) * 100) : 0
            const openCount = m.total - m.done
            return (
              <div key={m.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmt(m.date)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t('reports.readinessProgress', { done: m.done, total: m.total })}
                  {openCount > 0 && ` · ${t('reports.readinessOpen', { count: openCount })}`}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default function ProjectReports() {
  const { slug = '', projectSlug = '' } = useParams()
  const { t } = useTranslation()
  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const orgId = org.data?.org.id
  const projects = useQuery({ queryKey: ['projects', orgId], queryFn: () => api.listProjects(orgId!), enabled: Boolean(orgId) })
  const project = projects.data?.projects.find((p) => p.slug === projectSlug)
  const reports = useQuery({
    queryKey: ['reports', project?.id],
    queryFn: () => api.getProjectReports(project!.id),
    enabled: Boolean(project?.id),
  })

  const data = reports.data?.reports
  const days = (v: number | null) => (v == null ? '—' : t('reports.days', { count: v }))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          to={`/orgs/${slug}/projects/${projectSlug}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          {t('settings.backToProject')}
        </Link>
        <h2 className="text-xl font-semibold text-foreground">
          {t('reports.title')}
          {project && <span className="ml-2 text-base font-normal text-muted-foreground">{project.name}</span>}
        </h2>
      </div>

      {!data ? (
        <>
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('reports.velocity')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.velocity.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t('reports.velocityEmpty')}</p>
              ) : (
                <VelocityChart points={data.velocity} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('reports.cycleTitle', { days: data.cycle.windowDays })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.cycle.closedCount === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t('reports.cycleEmpty')}</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label={t('reports.cycleMedian')} value={days(data.cycle.cycleMedianDays)} />
                    <Stat label={t('reports.cycleP85')} value={days(data.cycle.cycleP85Days)} />
                    <Stat label={t('reports.leadMedian')} value={days(data.cycle.leadMedianDays)} />
                    <Stat label={t('reports.leadP85')} value={days(data.cycle.leadP85Days)} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('reports.closedCount', { count: data.cycle.closedCount })}</p>
                  <CycleTrend cycle={data.cycle} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('reports.workload')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.workload.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t('reports.workloadEmpty')}</p>
              ) : (
                <WorkloadList rows={data.workload} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('reports.readiness')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ReleaseReadiness readiness={data.readiness} overall={data.overall} backHref={`/orgs/${slug}/projects/${projectSlug}`} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
