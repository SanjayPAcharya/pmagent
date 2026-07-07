import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Sparkles, Plus, Check, Rocket, LayoutGrid, Pencil, Trash2 } from 'lucide-react'
import { BlockedBadge } from '@/components/BlockedBadge'
import { api, type WorkloadRow } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { BetaBadge } from '@/components/BetaBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { MetricChip } from '@/components/MetricChip'
import { StatusBar } from '@/components/StatusBar'
import { ActivityFeed } from '@/components/ActivityFeed'
import { BurndownSparkline } from '@/components/BurndownSparkline'
import { useProjectSync } from '@/lib/websocket'
import { daysUntil } from '@/lib/time'
import { cn } from '@/lib/utils'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const initialsOf = (name: string) => {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)) || '?').toUpperCase()
}

/** Small donut showing milestone readiness (done/total). */
function ReadinessDonut({ done, total }: { done: number; total: number }) {
  const size = 22
  const stroke = 3
  const r = size / 2 - stroke
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? done / total : 0
  const color = total === 0 ? 'text-muted-foreground/40' : done === total ? 'text-green-500' : 'text-amber-500'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('shrink-0', color)} role="img" aria-label={`${done}/${total}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

function CapacityRow({ row, max }: { row: WorkloadRow; max: number }) {
  const { t } = useTranslation()
  return (
    <li className="flex items-center gap-3">
      <Avatar className="h-6 w-6 shrink-0">
        {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt={row.name} />}
        <AvatarFallback className="text-[10px]">{row.userId ? initialsOf(row.name) : '—'}</AvatarFallback>
      </Avatar>
      <span className="w-28 shrink-0 truncate text-sm text-foreground">
        {row.userId ? row.name : t('reports.unassigned')}
      </span>
      <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
        <div className="h-full rounded bg-primary/70" style={{ width: `${(row.openCount / max) * 100}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">
        {t('reports.openCount', { count: row.openCount })}
      </span>
    </li>
  )
}

export default function ProjectOverview() {
  const { slug = '', projectSlug = '' } = useParams()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const orgId = org.data?.org.id
  const projects = useQuery({ queryKey: ['projects', orgId], queryFn: () => api.listProjects(orgId!), enabled: Boolean(orgId) })
  const project = projects.data?.projects.find((p) => p.slug === projectSlug)
  const projectId = project?.id
  const base = `/orgs/${slug}/projects/${projectSlug}`

  const overview = useQuery({
    queryKey: ['overview', projectId],
    queryFn: () => api.getProjectOverview(projectId!),
    enabled: Boolean(projectId),
  })
  const activity = useQuery({
    queryKey: ['activity', projectId],
    queryFn: () => api.projectActivity(projectId!),
    enabled: Boolean(projectId),
  })
  useProjectSync(projectId, [['overview', projectId], ['tickets', projectId]])

  const isAdmin = org.data?.org.role === 'OWNER' || org.data?.org.role === 'ADMIN'
  const [managing, setManaging] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // Manage mode edits ALL milestones (the overview payload only carries the next 3 open).
  const allMilestones = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: () => api.listMilestones(projectId!),
    enabled: managing && Boolean(projectId),
  })

  // A milestone change touches the overview cards, the manage list, and the Gantt lane.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['overview', projectId] })
    qc.invalidateQueries({ queryKey: ['milestones', projectId] })
    qc.invalidateQueries({ queryKey: ['gantt', projectId] })
  }
  const toggleMilestone = useMutation({
    mutationFn: (m: { id: string; done: boolean }) => api.updateMilestone(projectId!, m.id, { done: !m.done }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  })
  const saveMilestone = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; date?: string } }) =>
      api.updateMilestone(projectId!, id, body),
    onSuccess: () => {
      refresh()
      toast.success(t('overview.milestoneSaved'))
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const deleteMilestone = useMutation({
    mutationFn: (id: string) => api.deleteMilestone(projectId!, id),
    onSuccess: () => {
      refresh()
      toast.success(t('overview.milestoneDeleted'))
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const [msName, setMsName] = useState('')
  const [msDate, setMsDate] = useState('')
  const addMilestone = useMutation({
    mutationFn: () => api.createMilestone(projectId!, { name: msName.trim(), date: new Date(msDate).toISOString() }),
    onSuccess: () => {
      setMsName('')
      setMsDate('')
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const data = overview.data?.overview

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <Link to={`/orgs/${slug}`} className="text-sm text-muted-foreground hover:underline">
            ← {org.data?.org.name ?? slug}
          </Link>
          <h2 className="text-xl font-semibold text-foreground">{project?.name ?? projectSlug}</h2>
        </div>
        <Link
          to={`${base}/board`}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <LayoutGrid className="h-4 w-4" />
          {t('nav.board')}
        </Link>
      </header>

      {!data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('overview.statusTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <MetricChip label={t('overview.open')} value={data.status.open} />
                <MetricChip label={t('overview.done')} value={data.status.done} />
              </div>
              <StatusBar byStatus={data.status.byStatus} />
              <p className="text-xs text-muted-foreground">
                {t('overview.workstreamSplit', { sprint: data.status.byWorkstream.SPRINT, adhoc: data.status.byWorkstream.ADHOC })}
              </p>
            </CardContent>
          </Card>

          {/* Active sprint */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('overview.activeSprintTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.activeSprint ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <Rocket className="h-4 w-4 text-muted-foreground" />
                      {data.activeSprint.name}
                    </span>
                    {(() => {
                      const d = daysUntil(data.activeSprint.endDate)
                      return d !== null ? (
                        <span className="text-xs text-muted-foreground">{t('overview.daysLeft', { count: Math.max(0, d) })}</span>
                      ) : null
                    })()}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${data.activeSprint.total > 0 ? (data.activeSprint.done / data.activeSprint.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('overview.sprintProgress', { done: data.activeSprint.done, total: data.activeSprint.total })}
                  </p>
                  <BurndownSparkline sprintId={data.activeSprint.id} />
                </div>
              ) : (
                <div className="py-4 text-sm text-muted-foreground">
                  {t('overview.noActiveSprint')} —{' '}
                  <Link to={`${base}/sprints`} className="text-foreground hover:underline">
                    {t('overview.noActiveSprintHint')}
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Blockers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('overview.blockersTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.blockers.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t('overview.blockersEmpty')}</p>
              ) : (
                <ul className="space-y-1">
                  {data.blockers.map((b) => (
                    <li key={b.id}>
                      <button
                        onClick={() => navigate(`${base}/board/ticket/${b.number}`)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                      >
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{b.key}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{b.title}</span>
                        {b.openBlockerCount > 0 && <BlockedBadge count={b.openBlockerCount} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">{t('overview.milestonesTitle')}</CardTitle>
              <button
                onClick={() => {
                  setManaging((v) => !v)
                  setConfirmDeleteId(null)
                }}
                aria-label={t('overview.manageMilestones')}
                title={t('overview.manageMilestones')}
                className={cn(
                  'shrink-0 rounded p-1 text-muted-foreground hover:text-foreground',
                  managing && 'text-primary',
                )}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {managing ? (
                (allMilestones.data?.milestones.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {allMilestones.isLoading ? t('common.loading') : t('overview.milestonesEmpty')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {allMilestones.data!.milestones.map((m) => (
                      <li key={m.id} className="flex items-center gap-2">
                        <Input
                          defaultValue={m.name}
                          onBlur={(e) => {
                            const v = e.target.value.trim()
                            if (v && v !== m.name) saveMilestone.mutate({ id: m.id, body: { name: v } })
                          }}
                          className="h-8 flex-1"
                        />
                        <Input
                          type="date"
                          defaultValue={m.date.slice(0, 10)}
                          onBlur={(e) => {
                            const v = e.target.value
                            if (v && v !== m.date.slice(0, 10)) saveMilestone.mutate({ id: m.id, body: { date: new Date(v).toISOString() } })
                          }}
                          className="h-8 w-36"
                        />
                        <button
                          onClick={() => toggleMilestone.mutate(m)}
                          aria-label={t('overview.toggleDone')}
                          className={cn(
                            'shrink-0 rounded-full border p-1 text-muted-foreground hover:text-foreground',
                            m.done && 'border-green-500 bg-green-500/10 text-green-500',
                          )}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        {isAdmin &&
                          (confirmDeleteId === m.id ? (
                            <button
                              onClick={() => {
                                deleteMilestone.mutate(m.id)
                                setConfirmDeleteId(null)
                              }}
                              className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                            >
                              {t('overview.milestoneDeleteConfirm')}
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(m.id)}
                              aria-label={t('overview.deleteMilestone')}
                              title={t('overview.deleteMilestone')}
                              className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ))}
                      </li>
                    ))}
                  </ul>
                )
              ) : data.milestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('overview.milestonesEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {data.milestones.map((m) => (
                    <li key={m.id} className="flex items-center gap-2.5">
                      <ReadinessDonut done={m.readiness.done} total={m.readiness.total} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{m.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(m.date)} · {t('overview.milestoneReadiness', { done: m.readiness.done, total: m.readiness.total })}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleMilestone.mutate(m)}
                        aria-label={t('overview.toggleDone')}
                        className={cn(
                          'shrink-0 rounded-full border p-1 text-muted-foreground hover:text-foreground',
                          m.done && 'border-green-500 bg-green-500/10 text-green-500',
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (msName.trim() && msDate) addMilestone.mutate()
                }}
                className="flex items-center gap-2 border-t pt-3"
              >
                <Input
                  value={msName}
                  onChange={(e) => setMsName(e.target.value)}
                  placeholder={t('overview.milestoneName')}
                  className="h-8 flex-1"
                />
                <Input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} className="h-8 w-36" />
                <Button type="submit" size="sm" variant="outline" disabled={!msName.trim() || !msDate || addMilestone.isPending}>
                  <Plus className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Capacity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('overview.capacityTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.capacity.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('overview.capacityEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {data.capacity.rows.map((r) => (
                    <CapacityRow key={r.userId ?? 'unassigned'} row={r} max={Math.max(...data.capacity.rows.map((x) => x.openCount), 1)} />
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                {data.capacity.recentVelocityAvg !== null
                  ? t('overview.recentVelocity', { count: data.capacity.recentVelocityAvg })
                  : t('overview.recentVelocityNone')}
              </p>
            </CardContent>
          </Card>

          {/* AI summary (Beta placeholder — no network) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('overview.aiSummaryTitle')}
                <BetaBadge />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('overview.aiSummaryHint')}</p>
              <Button size="sm" variant="outline" disabled title={t('common.betaTooltip')}>
                {t('overview.generateSummary')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Activity — full width below the grid */}
      {activity.data && <ActivityFeed orgSlug={slug} items={activity.data.activity} />}
    </div>
  )
}
