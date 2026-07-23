import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Sparkles, Plus, Check, Rocket, LayoutGrid, Pencil, Trash2, Loader2, ChevronDown } from 'lucide-react'
import { BlockedBadge } from '@/components/BlockedBadge'
import { STATUS_LABEL, STATUS_COLOR } from '@/lib/board'
import { api, type AIProjectSummary, type WorkloadRow } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useAIHealth, aiButtonState, aiErrorKey } from '@/lib/useAIHealth'
import { useListReveal, useTextReveal } from '@/lib/aiReveal'
import { AIThinkingIndicator } from '@/components/AIThinkingIndicator'
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
function ReadinessDonut({ done, total, title }: { done: number; total: number; title?: string }) {
  const size = 22
  const stroke = 3
  const r = size / 2 - stroke
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? done / total : 0
  const color = total === 0 ? 'text-muted-foreground/40' : done === total ? 'text-green-500' : 'text-amber-500'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('shrink-0', color)} role="img" aria-label={`${done}/${total}`}>
      {title && <title>{title}</title>}
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

/** 3.8.5 MS-4 — the linked tickets behind a milestone's progress figure. */
function MilestoneLinkedTickets({ projectId, milestoneId, onOpen }: { projectId: string; milestoneId: string; onOpen: (n: number) => void }) {
  const { t } = useTranslation()
  const detail = useQuery({
    queryKey: ['milestone', projectId, milestoneId],
    queryFn: () => api.getMilestone(projectId, milestoneId),
  })
  if (detail.isLoading) return <p className="py-1 pl-8 text-xs text-muted-foreground">{t('common.loading')}</p>
  const tickets = detail.data?.tickets ?? []
  if (tickets.length === 0) return <p className="py-1 pl-8 text-xs text-muted-foreground">{t('overview.milestoneNoTickets')}</p>
  return (
    <ul className="space-y-1 border-l pl-3 ml-3">
      {tickets.map((tk) => (
        <li key={tk.id}>
          <button
            onClick={() => onOpen(tk.number)}
            className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted"
          >
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: STATUS_COLOR[tk.status] }} title={STATUS_LABEL[tk.status]} aria-hidden />
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{tk.key}</span>
            <span className="min-w-0 flex-1 truncate text-foreground">{tk.title}</span>
            {tk.assignedTo && (
              <Avatar className="h-4 w-4 shrink-0">
                <AvatarImage src={tk.assignedTo.avatarUrl ?? undefined} />
                <AvatarFallback className="text-[8px]">{tk.assignedTo.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
            )}
          </button>
        </li>
      ))}
    </ul>
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

// 3.8.1 B2 — staged "streaming" reveal of the AI digest: headline types in
// word-by-word, then bullets, then risks appear one by one. Presentation only —
// the validated summary is already complete when this renders.
function SummaryReveal({ summary }: { summary: AIProjectSummary }) {
  const { t } = useTranslation()
  const headline = useTextReveal(summary.headline)
  const bulletsVisible = useListReveal(summary.bullets.length, headline.done)
  const bulletsDone = headline.done && bulletsVisible >= summary.bullets.length
  const risksVisible = useListReveal(summary.risks.length, bulletsDone)

  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium text-foreground">{headline.shown}</p>
      {bulletsVisible > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
          {summary.bullets.slice(0, bulletsVisible).map((b, i) => (
            <li key={i} className="motion-safe:animate-in motion-safe:fade-in">
              {b}
            </li>
          ))}
        </ul>
      )}
      {risksVisible > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ai.risks')}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-destructive">
            {summary.risks.slice(0, risksVisible).map((r, i) => (
              <li key={i} className="motion-safe:animate-in motion-safe:fade-in">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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

  // 3.8 B4 — AI status digest. Cached in react-query keyed by project (ephemeral —
  // never persisted); generated only on demand via refetch, gated on AI health.
  const aiHealth = useAIHealth()
  const aiState = aiButtonState(aiHealth.data)
  const summary = useQuery({
    queryKey: ['ai-summary', projectId],
    // react-query's signal makes Cancel (cancelQueries) actually abort the fetch;
    // cancellation reverts to the previous state — it never lands in isError.
    queryFn: ({ signal }) => api.aiProjectSummary(projectId!, signal),
    enabled: false,
    staleTime: Infinity,
    retry: false,
  })
  const summaryErrorKey = summary.isError ? aiErrorKey(summary.error) : null
  // Re-gate the AI buttons immediately when a summary attempt reveals the server
  // is down, rather than waiting out the 60s health staleTime.
  useEffect(() => {
    if (summary.isError && aiErrorKey(summary.error) === 'ai.error.unavailable') {
      qc.invalidateQueries({ queryKey: ['ai-health'] })
    }
  }, [summary.isError, summary.error, qc])

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
  const [expandedMs, setExpandedMs] = useState<string | null>(null) // MS-4 — which milestone's linked tickets are shown
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
                    <li key={m.id}>
                      <div className="flex items-center gap-2.5">
                        <ReadinessDonut done={m.readiness.done} total={m.readiness.total} title={t('overview.milestoneReadinessHint')} />
                        <button
                          onClick={() => setExpandedMs((cur) => (cur === m.id ? null : m.id))}
                          aria-expanded={expandedMs === m.id}
                          title={t('overview.milestoneShowTickets')}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-1 truncate text-sm font-medium text-foreground">
                            {m.name}
                            <ChevronDown className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', expandedMs === m.id && 'rotate-180')} />
                          </div>
                          <div className="text-xs text-muted-foreground" title={t('overview.milestoneReadinessHint')}>
                            {fmtDate(m.date)} ·{' '}
                            {m.readiness.total === 0
                              ? t('overview.milestoneNoDue')
                              : t('overview.milestoneReadiness', { done: m.readiness.done, total: m.readiness.total })}
                          </div>
                        </button>
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
                      </div>
                      {expandedMs === m.id && (
                        <div className="mt-1.5">
                          <MilestoneLinkedTickets projectId={projectId!} milestoneId={m.id} onOpen={(n) => navigate(`${base}/board/ticket/${n}`)} />
                        </div>
                      )}
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

          {/* AI summary (3.8 B4 — self-hosted, on-demand digest) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('overview.aiSummaryTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Announce start + done only — the staged hint is not live. */}
              <span className="sr-only" aria-live="polite">
                {summary.isFetching ? t('ai.generating') : summary.data ? t('ai.readyAnnounce') : ''}
              </span>
              {summary.isFetching ? (
                /* B4 — modern "thinking" loader; the row's Cancel handles abort. */
                <AIThinkingIndicator active />
              ) : summary.data ? (
                <SummaryReveal summary={summary.data.summary} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {aiState.reasonKey ? t(aiState.reasonKey) : t('ai.summaryEmpty')}
                </p>
              )}
              {!summary.isFetching && summaryErrorKey && (
                <p className="text-xs text-destructive">{t(summaryErrorKey)}</p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => summary.refetch()}
                  disabled={!aiState.ready || summary.isFetching}
                  title={aiState.reasonKey ? t(aiState.reasonKey) : undefined}
                >
                  {summary.isFetching ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 motion-safe:animate-spin" />
                      {t('ai.generating')}
                    </>
                  ) : (
                    t(summary.data ? 'ai.regenerate' : 'ai.generateSummary')
                  )}
                </Button>
                {summary.isFetching && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => qc.cancelQueries({ queryKey: ['ai-summary', projectId] })}
                  >
                    {t('common.cancel')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Activity — full width below the grid */}
      {activity.data && <ActivityFeed orgSlug={slug} items={activity.data.activity} />}
    </div>
  )
}
