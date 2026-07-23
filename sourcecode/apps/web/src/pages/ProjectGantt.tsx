import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api, type GanttItem, type GanttPayload } from '@/lib/api'
import { ALL_STATUSES, STATUS_COLOR, STATUS_LABEL } from '@/lib/board'
import { barForTicket, computeRange, dayForX, dayNumToISO, milestoneViewport, toDayNum, traySchedule, xForDay, type GanttScale } from '@/lib/gantt'
import { useProjectSync } from '@/lib/websocket'
import { useLocalStorageState } from '@/lib/useLocalStorage'
import { CalendarRange, Search, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { GanttChart, type GanttGroup } from '@/components/gantt/GanttChart'
import { TicketDrawer } from '@/components/TicketDrawer'
import { cn } from '@/lib/utils'

const selectCls = 'h-8 rounded-md border border-input bg-transparent px-2 text-sm'
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function ProjectGantt() {
  const { slug = '', projectSlug = '', number } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragPaused = useRef(false)

  // Drag is pointer-precise; disable it below the sm breakpoint (touch/scroll).
  const [interactive, setInteractive] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 640 : true))
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const onChange = () => setInteractive(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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
  useProjectSync(projectId, [['gantt', projectId]], dragPaused)

  const [scale, setScale] = useLocalStorageState<GanttScale>('agentpm-gantt-scale', 'week')
  const [trayOpen, setTrayOpen] = useLocalStorageState('agentpm-gantt-tray', true)
  const [assignee, setAssignee] = useLocalStorageState('agentpm-gantt-f-assignee', '')
  const [sprint, setSprint] = useLocalStorageState('agentpm-gantt-f-sprint', '')
  const [label, setLabel] = useLocalStorageState('agentpm-gantt-f-label', '')
  const [status, setStatus] = useLocalStorageState('agentpm-gantt-f-status', '')
  const [workstream, setWorkstream] = useLocalStorageState('agentpm-gantt-f-ws', '')
  const [groupBy, setGroupBy] = useLocalStorageState<'' | 'sprint' | 'assignee' | 'workstream'>('agentpm-gantt-group', '')
  const [search, setSearch] = useState('') // ephemeral — a text query shouldn't survive a reload

  const payload = gantt.data?.gantt
  const hasFilters = Boolean(assignee || sprint || label || status || workstream || search.trim())
  const clearFilters = () => {
    setAssignee(''); setSprint(''); setLabel(''); setStatus(''); setWorkstream(''); setSearch('')
  }

  const filtered = useMemo(() => {
    const items = payload?.items ?? []
    const q = search.trim().toLowerCase()
    return items.filter(
      (it: GanttItem) =>
        (!assignee || it.assignedToId === assignee) &&
        (!sprint || it.sprintId === sprint) &&
        (!label || it.labelIds.includes(label)) &&
        (!status || it.status === status) &&
        (!workstream || it.workstream === workstream) &&
        (!q || it.title.toLowerCase().includes(q) || it.key.toLowerCase().includes(q) || String(it.number) === q),
    )
  }, [payload, assignee, sprint, label, status, workstream, search])

  const scheduled = useMemo(() => filtered.filter((it) => barForTicket(it) !== null), [filtered])
  const unscheduled = useMemo(() => filtered.filter((it) => barForTicket(it) === null), [filtered])

  // TL5 — optional row grouping. Groups are ordered (sprints in list order,
  // members alphabetically, workstreams fixed), with the "none" bucket last.
  const groups = useMemo<GanttGroup[] | undefined>(() => {
    if (!groupBy) return undefined
    const defs: { key: string; label: string; match: (it: GanttItem) => boolean }[] = []
    if (groupBy === 'sprint') {
      for (const s of sprints.data?.sprints ?? []) defs.push({ key: s.id, label: s.name, match: (it) => it.sprintId === s.id })
      defs.push({ key: 'none', label: t('gantt.noSprint'), match: () => true })
    } else if (groupBy === 'assignee') {
      const ms = [...(members.data?.members ?? [])].sort((a, b) => a.name.localeCompare(b.name))
      for (const m of ms) defs.push({ key: m.userId, label: m.name, match: (it) => it.assignedToId === m.userId })
      defs.push({ key: 'none', label: t('gantt.unassigned'), match: () => true })
    } else {
      defs.push({ key: 'SPRINT', label: t('gantt.workstreamSprint'), match: (it) => it.workstream === 'SPRINT' })
      defs.push({ key: 'ADHOC', label: t('gantt.workstreamAdhoc'), match: () => true })
    }
    const used = new Set<string>()
    const out: GanttGroup[] = []
    for (const d of defs) {
      const its = filtered.filter((it) => !used.has(it.id) && d.match(it))
      for (const it of its) used.add(it.id)
      if (its.length > 0) out.push({ key: d.key, label: d.label, items: its })
    }
    return out
  }, [groupBy, filtered, sprints.data, members.data, t])

  const memberName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const mem of members.data?.members ?? []) m[mem.userId] = mem.name
    return m
  }, [members.data])

  const today = toDayNum(new Date().toISOString())
  const range = useMemo(() => computeRange(scheduled, payload?.milestones ?? [], today), [scheduled, payload, today])

  // B1 — open the ticket in the standard drawer *over the Timeline* (its own
  // /gantt/ticket/:number route), so opening and closing both stay on this page
  // and keep the chart's horizontal scroll. Mirrors the List/Board drawer idiom.
  const openTicket = (n: number) => navigate(`${base}/gantt/ticket/${n}`)
  const closeDrawer = () => navigate(`${base}/gantt`)
  const drawerTicket = number ? payload?.items.find((it) => it.number === Number(number)) : undefined
  const scrollToDay = (day: number) => {
    const el = scrollRef.current
    if (el) el.scrollTo({ left: xForDay(day, range.startDay, scale) - el.clientWidth / 3, behavior: 'smooth' })
  }
  const scrollToToday = () => scrollToDay(today)

  // Keep the date at the viewport's left edge stable across a zoom change, so
  // switching Day/Week/Month zooms around what you're looking at.
  const changeScale = (s: GanttScale) => {
    const el = scrollRef.current
    const anchorDay = el ? dayForX(el.scrollLeft, range.startDay, scale) : null
    setScale(s)
    if (el && anchorDay !== null) requestAnimationFrame(() => { el.scrollLeft = xForDay(anchorDay, range.startDay, s) })
  }

  // B2 — track the chart's horizontal scroll so we can tell which milestones are
  // currently off-screen (their diamonds can sit far past the last bar). The
  // scroll container lives inside GanttChart but is reachable via scrollRef.
  const milestones = payload?.milestones ?? []
  const [viewport, setViewport] = useState({ scrollLeft: 0, width: 0 })
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setViewport({ scrollLeft: el.scrollLeft, width: el.clientWidth })
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [payload, scale])
  const mViewport = useMemo(
    () => milestoneViewport(milestones, range.startDay, scale, viewport.scrollLeft, viewport.width),
    [milestones, range.startDay, scale, viewport],
  )
  const offscreenDir = (id: string) => mViewport.offscreen.find((o) => o.id === id)?.dir

  // B3 — name any dependency end for the chart's off-chart glyphs, and flag tray
  // (unscheduled) tickets that are linked to a scheduled one so the pair shows
  // from both sides.
  const ticketMeta = useMemo(() => {
    const m: Record<string, { key: string; title: string }> = {}
    for (const it of payload?.items ?? []) m[it.id] = { key: it.key, title: it.title }
    return m
  }, [payload])
  const scheduledIds = useMemo(() => new Set(scheduled.map((s) => s.id)), [scheduled])
  const trayDepTitle = useMemo(() => {
    const acc = new Map<string, string[]>()
    const add = (id: string, s: string) => acc.set(id, [...(acc.get(id) ?? []), s])
    for (const e of payload?.edges ?? []) {
      const blockedSched = scheduledIds.has(e.ticketId)
      const blockerSched = scheduledIds.has(e.dependsOnId)
      if (!blockedSched && blockerSched) add(e.ticketId, t('gantt.depBlockedBy', { names: ticketMeta[e.dependsOnId]?.key ?? '?' }))
      else if (blockedSched && !blockerSched) add(e.dependsOnId, t('gantt.depBlocks', { names: ticketMeta[e.ticketId]?.key ?? '?' }))
    }
    const out = new Map<string, string>()
    for (const [id, arr] of acc) out.set(id, arr.join(' · '))
    return out
  }, [payload, scheduledIds, ticketMeta, t])

  // ── Persistence + undo (R8) — optimistic gantt-cache patch, rollback on error.
  const ganttKey = ['gantt', projectId]
  const patchItem = (id: string, patch: Partial<GanttItem>) => (old?: { gantt: GanttPayload }) =>
    old ? { gantt: { ...old.gantt, items: old.gantt.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } } : old
  const patchMilestone = (id: string, date: string) => (old?: { gantt: GanttPayload }) =>
    old ? { gantt: { ...old.gantt, milestones: old.gantt.milestones.map((m) => (m.id === id ? { ...m, date } : m)) } } : old

  // Cmd/Ctrl+Z pops the most recent reschedule (ticket or milestone). Each undo
  // is itself undoable — pressing again toggles back — which is enough for the
  // "oops, put it back" case without a full history model.
  const undoStack = useRef<Array<() => void>>([])

  const writeTicketDates = (id: string, startDate: string | null, dueDate: string | null, withUndo = true) => {
    const prev = qc.getQueryData<{ gantt: GanttPayload }>(ganttKey)?.gantt.items.find((i) => i.id === id)
    const prevStart = prev?.startDate ?? null
    const prevDue = prev?.dueDate ?? null
    qc.setQueryData(ganttKey, patchItem(id, { startDate, dueDate }))
    if (withUndo) undoStack.current.push(() => writeTicketDates(id, prevStart, prevDue))
    api
      .updateTicket(id, { startDate, dueDate })
      .then(() => {
        if (withUndo)
          toast(t('gantt.rescheduled'), {
            action: { label: t('common.undo'), onClick: () => writeTicketDates(id, prevStart, prevDue, false) },
          })
      })
      .catch((e: Error) => {
        qc.setQueryData(ganttKey, patchItem(id, { startDate: prevStart, dueDate: prevDue })) // rollback
        toast.error(e.message)
      })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const el = e.target as HTMLElement | null
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
        const undo = undoStack.current.pop()
        if (undo) {
          e.preventDefault()
          undo()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onReschedule = (id: string, startDay: number, endDay: number) =>
    writeTicketDates(id, dayNumToISO(startDay), dayNumToISO(endDay))
  const onScheduleFromTray = (id: string, startDay: number) => {
    const bar = traySchedule(startDay)
    writeTicketDates(id, dayNumToISO(bar.startDay), dayNumToISO(bar.endDay))
  }
  // TL5 — draw-to-schedule on a ghost row: the drawn span is the schedule.
  const onDrawSchedule = (id: string, startDay: number, endDay: number) =>
    writeTicketDates(id, dayNumToISO(startDay), dayNumToISO(endDay))
  // TL5 — dependency drawn on the chart (end of blocker → onto the blocked bar).
  const onCreateDependency = (blockedId: string, blockerId: string) => {
    const edges = qc.getQueryData<{ gantt: GanttPayload }>(ganttKey)?.gantt.edges ?? []
    if (edges.some((e) => e.ticketId === blockedId && e.dependsOnId === blockerId)) return
    qc.setQueryData(ganttKey, (old?: { gantt: GanttPayload }) =>
      old ? { gantt: { ...old.gantt, edges: [...old.gantt.edges, { ticketId: blockedId, dependsOnId: blockerId }] } } : old,
    )
    api
      .addDependency(blockedId, blockerId)
      .then(() =>
        toast(t('gantt.depCreated', { blocked: ticketMeta[blockedId]?.key ?? '?', blocker: ticketMeta[blockerId]?.key ?? '?' })),
      )
      .catch((e: Error) => {
        qc.invalidateQueries({ queryKey: ganttKey })
        toast.error(e.message)
      })
  }
  const onRescheduleMilestone = (id: string, day: number, withUndo = true) => {
    const prevDate = qc.getQueryData<{ gantt: GanttPayload }>(ganttKey)?.gantt.milestones.find((m) => m.id === id)?.date
    const nextDate = dayNumToISO(day)
    qc.setQueryData(ganttKey, patchMilestone(id, nextDate))
    if (withUndo && prevDate) undoStack.current.push(() => onRescheduleMilestone(id, toDayNum(prevDate)))
    api
      .updateMilestone(projectId!, id, { date: nextDate })
      .then(() => {
        if (withUndo && prevDate)
          toast(t('gantt.milestoneMoved'), {
            action: { label: t('common.undo'), onClick: () => onRescheduleMilestone(id, toDayNum(prevDate), false) },
          })
      })
      .catch((e: Error) => {
        if (prevDate) qc.setQueryData(ganttKey, patchMilestone(id, prevDate))
        toast.error(e.message)
      })
  }

  const scaleBtn = (s: GanttScale, labelKey: string) => (
    <button
      onClick={() => changeScale(s)}
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
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('gantt.searchPlaceholder')}
            aria-label={t('gantt.searchPlaceholder')}
            className="h-8 w-44 rounded-md border border-input bg-transparent pl-7 pr-7 text-sm placeholder:text-muted-foreground focus:w-56 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label={t('gantt.clearSearch')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
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
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} className={selectCls}>
          <option value="">{t('gantt.groupNone')}</option>
          <option value="sprint">{t('gantt.groupSprint')}</option>
          <option value="assignee">{t('gantt.groupAssignee')}</option>
          <option value="workstream">{t('gantt.groupWorkstream')}</option>
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

      {/* B2 — milestone strip: always-visible chips so a milestone dated far past
          the last bar is never invisible. Click scrolls the chart to it; an arrow
          marks chips whose diamond is currently off-screen. */}
      {milestones.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t('gantt.milestonesLabel')}</span>
          {milestones.map((m) => {
            const dir = offscreenDir(m.id)
            return (
              <button
                key={m.id}
                onClick={() => scrollToDay(toDayNum(m.date))}
                title={`${m.name} · ${fmtDate(m.date)}`}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-primary/40',
                  dir ? 'border-amber-500/50 text-foreground' : 'border-input text-muted-foreground',
                )}
              >
                <span className={cn('text-[10px]', m.done ? 'text-muted-foreground' : 'text-amber-500')} aria-hidden>◆</span>
                <span className={cn('max-w-[12rem] truncate', m.done && 'line-through')}>{m.name}</span>
                <span className="text-muted-foreground">{fmtDate(m.date)}</span>
                {dir === 'left' && <span aria-hidden>←</span>}
                {dir === 'right' && <span aria-hidden>→</span>}
              </button>
            )
          })}
        </div>
      )}

      {payload?.truncated && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
          {t('gantt.truncated')}
        </div>
      )}

      {!payload ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : filtered.length === 0 || (!interactive && scheduled.length === 0) ? (
        // TL4 — distinguish "filtered to nothing" from "nothing scheduled yet",
        // and offer a way out when it's the filters. When interactive, having
        // only unscheduled tickets still shows the chart: its ghost rows are how
        // you draw the first bar.
        <EmptyState
          icon={CalendarRange}
          message={hasFilters ? t('gantt.emptyFiltered') : t('gantt.empty')}
          cta={
            hasFilters ? (
              <button onClick={clearFilters} className="text-sm font-medium text-primary hover:underline">
                {t('gantt.clearFilters')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <GanttChart
          items={filtered}
          edges={payload.edges}
          ticketMeta={ticketMeta}
          milestones={payload.milestones}
          scale={scale}
          range={range}
          today={today}
          scrollRef={scrollRef}
          interactive={interactive}
          narrow={!interactive}
          groups={groups}
          memberName={memberName}
          onOpenTicket={openTicket}
          onReschedule={onReschedule}
          onScheduleFromTray={onScheduleFromTray}
          onDrawSchedule={onDrawSchedule}
          onCreateDependency={onCreateDependency}
          onRescheduleMilestone={onRescheduleMilestone}
          onDragActiveChange={(active) => (dragPaused.current = active)}
        />
      )}

      {/* Legend — status colors actually on the chart, plus the dependency
          markers when the project has any dependency links (B3). */}
      {payload && scheduled.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-muted-foreground">
          {ALL_STATUSES.filter((s) => scheduled.some((it) => it.status === s)).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: STATUS_COLOR[s] }} aria-hidden />
              {STATUS_LABEL[s]}
            </span>
          ))}
          {payload.edges.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>→</span> {t('gantt.legendDependsOn')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-destructive" aria-hidden /> {t('gantt.legendOffchart')}
              </span>
            </>
          )}
        </div>
      )}

      {/* Unscheduled tray — narrow/touch only; on desktop the chart's ghost rows
          replace it (draw a bar directly on an unscheduled ticket's row). */}
      {payload && !interactive && unscheduled.length > 0 && (
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
                  draggable={interactive}
                  onDragStart={(e) => e.dataTransfer.setData('text/ganttticket', it.id)}
                  className={cn(
                    'inline-flex max-w-xs items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs hover:border-primary/40',
                    interactive && 'cursor-grab active:cursor-grabbing',
                  )}
                >
                  {trayDepTitle.has(it.id) && (
                    <span
                      title={trayDepTitle.get(it.id)}
                      className="inline-block h-2 w-2 shrink-0 rounded-full bg-destructive"
                      aria-hidden
                    />
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground">{it.key}</span>
                  <span className="truncate text-foreground">{it.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {drawerTicket && orgId && (
        <TicketDrawer
          ticketId={drawerTicket.id}
          orgId={orgId}
          members={members.data?.members ?? []}
          onClose={closeDrawer}
          onChanged={() => qc.invalidateQueries({ queryKey: ['gantt', projectId] })}
        />
      )}
    </div>
  )
}
