import { useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api, type GanttItem } from '@/lib/api'
import { ALL_STATUSES, STATUS_LABEL } from '@/lib/board'
import { barForTicket, computeRange, toDayNum, xForDay, type GanttScale } from '@/lib/gantt'
import { useProjectSync } from '@/lib/websocket'
import { useLocalStorageState } from '@/lib/useLocalStorage'
import { Skeleton } from '@/components/ui/skeleton'
import { GanttChart } from '@/components/gantt/GanttChart'
import { cn } from '@/lib/utils'

const selectCls = 'h-8 rounded-md border border-input bg-transparent px-2 text-sm'

export default function ProjectGantt() {
  const { slug = '', projectSlug = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)

  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const orgId = org.data?.org.id
  const projects = useQuery({ queryKey: ['projects', orgId], queryFn: () => api.listProjects(orgId!), enabled: Boolean(orgId) })
  const project = projects.data?.projects.find((p) => p.slug === projectSlug)
  const projectId = project?.id
  const base = `/orgs/${slug}/projects/${projectSlug}`

  const gantt = useQuery({ queryKey: ['gantt', projectId], queryFn: () => api.getProjectGantt(projectId!), enabled: Boolean(projectId) })
  const members = useQuery({ queryKey: ['members', slug], queryFn: () => api.listMembers(slug), enabled: Boolean(slug) })
  const sprints = useQuery({ queryKey: ['sprints', projectId], queryFn: () => api.listSprints(projectId!), enabled: Boolean(projectId) })
  const labels = useQuery({ queryKey: ['labels', orgId], queryFn: () => api.listLabels(orgId!), enabled: Boolean(orgId) })
  useProjectSync(projectId, [['gantt', projectId]])

  const [scale, setScale] = useLocalStorageState<GanttScale>('agentpm-gantt-scale', 'week')
  const [trayOpen, setTrayOpen] = useLocalStorageState('agentpm-gantt-tray', true)
  const [assignee, setAssignee] = useLocalStorageState('agentpm-gantt-f-assignee', '')
  const [sprint, setSprint] = useLocalStorageState('agentpm-gantt-f-sprint', '')
  const [label, setLabel] = useLocalStorageState('agentpm-gantt-f-label', '')
  const [status, setStatus] = useLocalStorageState('agentpm-gantt-f-status', '')
  const [workstream, setWorkstream] = useLocalStorageState('agentpm-gantt-f-ws', '')

  const payload = gantt.data?.gantt
  const hasFilters = Boolean(assignee || sprint || label || status || workstream)
  const clearFilters = () => {
    setAssignee(''); setSprint(''); setLabel(''); setStatus(''); setWorkstream('')
  }

  const filtered = useMemo(() => {
    const items = payload?.items ?? []
    return items.filter(
      (it: GanttItem) =>
        (!assignee || it.assignedToId === assignee) &&
        (!sprint || it.sprintId === sprint) &&
        (!label || it.labelIds.includes(label)) &&
        (!status || it.status === status) &&
        (!workstream || it.workstream === workstream),
    )
  }, [payload, assignee, sprint, label, status, workstream])

  const scheduled = useMemo(() => filtered.filter((it) => barForTicket(it) !== null), [filtered])
  const unscheduled = useMemo(() => filtered.filter((it) => barForTicket(it) === null), [filtered])

  const today = toDayNum(new Date().toISOString())
  const range = useMemo(() => computeRange(scheduled, payload?.milestones ?? [], today), [scheduled, payload, today])

  const openTicket = (number: number) => navigate(`${base}/board/ticket/${number}`)
  const scrollToToday = () => {
    const el = scrollRef.current
    if (el) el.scrollLeft = xForDay(today, range.startDay, scale) - el.clientWidth / 3
  }

  const scaleBtn = (s: GanttScale, labelKey: string) => (
    <button
      onClick={() => setScale(s)}
      aria-pressed={scale === s}
      className={cn('h-7 rounded px-2.5 text-xs transition-colors', scale === s ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
    >
      {t(labelKey)}
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link to={base} className="text-sm text-muted-foreground hover:underline">← {project?.name ?? projectSlug}</Link>
          <h2 className="text-xl font-semibold text-foreground">{t('gantt.title')}</h2>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={selectCls}>
          <option value="">{t('gantt.allAssignees')}</option>
          {members.data?.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
        </select>
        <select value={sprint} onChange={(e) => setSprint(e.target.value)} className={selectCls}>
          <option value="">{t('gantt.allSprints')}</option>
          {sprints.data?.sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={label} onChange={(e) => setLabel(e.target.value)} className={selectCls}>
          <option value="">{t('gantt.allLabels')}</option>
          {labels.data?.labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">{t('gantt.allStatuses')}</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select value={workstream} onChange={(e) => setWorkstream(e.target.value)} className={selectCls}>
          <option value="">{t('gantt.allWorkstreams')}</option>
          <option value="SPRINT">{t('gantt.workstreamSprint')}</option>
          <option value="ADHOC">{t('gantt.workstreamAdhoc')}</option>
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="text-sm text-muted-foreground hover:text-foreground">{t('gantt.clearFilters')}</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={scrollToToday} className="h-7 rounded-md border px-2.5 text-xs text-muted-foreground hover:text-foreground">{t('gantt.today')}</button>
          <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
            {scaleBtn('day', 'gantt.scaleDay')}
            {scaleBtn('week', 'gantt.scaleWeek')}
            {scaleBtn('month', 'gantt.scaleMonth')}
          </div>
        </div>
      </div>

      {payload?.truncated && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
          {t('gantt.truncated')}
        </div>
      )}

      {!payload ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : scheduled.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">{t('gantt.empty')}</div>
      ) : (
        <GanttChart
          items={scheduled}
          edges={payload.edges}
          milestones={payload.milestones}
          scale={scale}
          range={range}
          today={today}
          scrollRef={scrollRef}
          onOpenTicket={openTicket}
        />
      )}

      {/* Unscheduled tray */}
      {payload && unscheduled.length > 0 && (
        <div className="rounded-lg border bg-card">
          <button
            onClick={() => setTrayOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-foreground"
          >
            <span>{t('gantt.unscheduled', { count: unscheduled.length })}</span>
            <span className="text-muted-foreground">{trayOpen ? '▾' : '▸'}</span>
          </button>
          {trayOpen && (
            <div className="flex flex-wrap gap-2 border-t p-3">
              {unscheduled.map((it) => (
                <button
                  key={it.id}
                  onClick={() => openTicket(it.number)}
                  className="inline-flex max-w-xs items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs hover:border-primary/40"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">{it.key}</span>
                  <span className="truncate text-foreground">{it.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
