import { useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Pencil, Check, X, Rocket } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { api, type Sprint, type Ticket, type TicketStatus } from '@/lib/api'
import { ALL_STATUSES, PRIORITY_CLASS, STATUS_LABEL } from '@/lib/board'
import { useProjectSync } from '@/lib/websocket'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { BurndownSparkline } from '@/components/BurndownSparkline'
import { AIButton } from '@/components/BetaBadge'
import { AIThinkingIndicator } from '@/components/AIThinkingIndicator'
import { useAIHealth, aiButtonState, aiErrorKey } from '@/lib/useAIHealth'
import { prefersReducedMotion, segmentText } from '@/lib/aiReveal'
import { cn } from '@/lib/utils'

const selectCls = 'h-8 shrink-0 rounded-md border border-input bg-transparent px-2 text-xs'

// F2 — a draggable ticket chip (backlog → sprint, or between sprints).
function TicketChip({ ticket }: { ticket: Ticket }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn(
        'cursor-grab rounded-md border bg-card px-2 py-1 text-xs active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <span className="font-mono text-muted-foreground">{ticket.key}</span> {ticket.title}
    </div>
  )
}

function SprintRow({
  sprint,
  projectId,
  allSprints,
  slug,
  projectSlug,
  onChanged,
}: {
  sprint: Sprint
  projectId: string
  allSprints: Sprint[]
  slug: string
  projectSlug: string
  onChanged: () => void
}) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState(sprint.goal ?? '')
  // 3.8.3 S1 — draft the goal with AI, streamed into the (readOnly-while-streaming) field.
  const aiReady = aiButtonState(useAIHealth().data).ready
  const [goalBusy, setGoalBusy] = useState(false)
  const [goalStreaming, setGoalStreaming] = useState(false)
  const [goalErr, setGoalErr] = useState<string | null>(null)
  const goalAbort = useRef<AbortController | null>(null)
  const goalTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const cancelGoal = () => goalAbort.current?.abort()
  const runDraftGoal = async () => {
    goalAbort.current?.abort()
    const ctrl = new AbortController()
    goalAbort.current = ctrl
    setGoalBusy(true)
    setGoalErr(null)
    try {
      const { goal } = await api.aiSprintGoal(sprint.id, ctrl.signal)
      if (prefersReducedMotion()) {
        setGoalDraft(goal)
      } else {
        const segs = segmentText(goal)
        let n = 0
        setGoalDraft('')
        setGoalStreaming(true)
        if (goalTimer.current) clearInterval(goalTimer.current)
        goalTimer.current = setInterval(() => {
          n += 4
          setGoalDraft(segs.slice(0, n).join(''))
          if (n >= segs.length) {
            if (goalTimer.current) clearInterval(goalTimer.current)
            goalTimer.current = null
            setGoalStreaming(false)
          }
        }, 40)
      }
    } catch (e) {
      const key = aiErrorKey(e)
      if (key) {
        setGoalErr(t(key))
        if (key === 'ai.error.unavailable') qc.invalidateQueries({ queryKey: ['ai-health'] })
      }
    } finally {
      if (goalAbort.current === ctrl) {
        goalAbort.current = null
        setGoalBusy(false)
      }
    }
  }
  const [fAssignee, setFAssignee] = useState('')
  const [fStatus, setFStatus] = useState('')
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: sprint.id })
  const detail = useQuery({ queryKey: ['sprint', sprint.id], queryFn: () => api.getSprint(sprint.id) })
  const members = useQuery({ queryKey: ['members', slug], queryFn: () => api.listMembers(slug), enabled: expanded })
  // Candidate tickets to add = project tickets not already in this sprint.
  const allTickets = useQuery({
    queryKey: ['tickets', projectId, { sort: 'number' }],
    queryFn: () => api.listTickets(projectId, { sort: 'number' }),
    enabled: expanded,
  })
  const counts = detail.data?.counts
  const pct = counts && counts.total ? Math.round((counts.done / counts.total) * 100) : 0
  const candidates = (allTickets.data?.items ?? []).filter((t) => t.sprintId !== sprint.id)

  // F3 — velocity-aware capacity: committed points vs the most recent completed
  // sprint's velocity. Flags overcommitment while planning.
  const committedPts = (detail.data?.tickets ?? []).reduce((s, tk) => s + (tk.storyPoints ?? 0), 0)
  const lastVelocity = allSprints.filter((s) => s.status === 'COMPLETED' && s.velocity != null).map((s) => s.velocity!).at(-1) ?? null
  const showCapacity = (sprint.status === 'PLANNING' || sprint.status === 'ACTIVE') && committedPts > 0
  const overcommitted = lastVelocity != null && committedPts > lastVelocity
  const capacityPct = lastVelocity ? Math.min(100, Math.round((committedPts / lastVelocity) * 100)) : 100

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['sprint', sprint.id] })
    qc.invalidateQueries({ queryKey: ['tickets', projectId] })
    onChanged()
  }
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      refresh()
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const saveGoal = async () => {
    await act(() => api.updateSprint(sprint.id, { goal: goalDraft.trim() || null }), t('sprints.goalSaved'))
    setEditingGoal(false)
  }
  const assign = (tk: Ticket, userId: string | null) =>
    act(() => api.updateTicket(tk.id, { assignedToId: userId }), t('sprints.reassigned'))

  // R12 — per-sprint mini filter (client-side over the expanded list).
  const sprintTickets = (detail.data?.tickets ?? []).filter(
    (tk) => (!fAssignee || tk.assignedToId === fAssignee) && (!fStatus || tk.status === fStatus),
  )

  return (
    <Card ref={setDropRef} className={cn(isOver && 'ring-2 ring-primary/50')}>
      <CardHeader className="space-y-1 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {sprint.name}
            <Badge variant={sprint.status === 'ACTIVE' ? 'default' : 'secondary'}>{sprint.status}</Badge>
            {sprint.velocity != null && <span className="text-xs text-muted-foreground">{t('sprints.velocity', { n: sprint.velocity })}</span>}
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? t('sprints.hideTickets') : t('sprints.ticketsCount', { n: counts?.total ?? 0 })}
            </Button>
            {sprint.status === 'PLANNING' && (
              <Button size="sm" variant="outline" onClick={() => act(() => api.startSprint(sprint.id), t('sprints.started'))}>
                {t('sprints.start')}
              </Button>
            )}
            {sprint.status === 'ACTIVE' && (
              <Button size="sm" variant="outline" onClick={() => act(() => api.completeSprint(sprint.id), t('sprints.completed'))}>
                {t('sprints.complete')}
              </Button>
            )}
          </div>
        </div>
        {/* R12 — editable sprint goal; 3.8.3 S1 — optional AI draft */}
        {editingGoal ? (
          goalBusy ? (
            <div>
              <span className="sr-only" aria-live="polite">{t('ai.generating')}</span>
              <AIThinkingIndicator active onCancel={cancelGoal} />
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Input
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  readOnly={goalStreaming}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !goalStreaming) void saveGoal()
                    if (e.key === 'Escape') { setEditingGoal(false); setGoalDraft(sprint.goal ?? '') }
                  }}
                  autoFocus
                  placeholder={t('sprints.goalPlaceholder')}
                  className="h-7 text-sm"
                />
                <button onClick={() => void saveGoal()} disabled={goalStreaming} className="text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label={t('common.save')}><Check className="h-4 w-4" /></button>
                <button onClick={() => { setEditingGoal(false); setGoalDraft(sprint.goal ?? '') }} className="text-muted-foreground hover:text-foreground" aria-label={t('common.cancel')}><X className="h-4 w-4" /></button>
              </div>
              {aiReady && !goalStreaming && (
                <AIButton label={t('ai.draftGoal')} onClick={runDraftGoal} busy={false} />
              )}
              {goalErr && (
                <div className="flex items-center gap-2 text-[11px] text-destructive">
                  <span>{goalErr}</span>
                  <button type="button" onClick={runDraftGoal} className="underline hover:no-underline">{t('ai.retry')}</button>
                </div>
              )}
            </div>
          )
        ) : (
          <button
            onClick={() => { setGoalDraft(sprint.goal ?? ''); setEditingGoal(true) }}
            className="group flex items-center gap-1 text-left"
          >
            <span className={cn('text-sm text-muted-foreground', !sprint.goal && 'italic')}>{sprint.goal || t('sprints.noGoal')}</span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>{t('sprints.completion')}</span>
          <span>
            {counts?.done ?? 0}/{counts?.total ?? 0} · {pct}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>

        {showCapacity && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-muted-foreground">{t('sprints.capacity')}</span>
              <span className={overcommitted ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
                {lastVelocity != null
                  ? t('sprints.capacitySummary', { committed: committedPts, velocity: lastVelocity })
                  : t('sprints.capacityNoVelocity', { committed: committedPts })}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={overcommitted ? 'h-full bg-amber-500 transition-all' : 'h-full bg-emerald-500 transition-all'}
                style={{ width: `${capacityPct}%` }}
              />
            </div>
            {overcommitted && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t('sprints.overcommitted')}</p>}
          </div>
        )}

        {(sprint.status === 'ACTIVE' || sprint.status === 'COMPLETED') && <BurndownSparkline sprintId={sprint.id} />}

        {expanded && (
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('sprints.inThisSprint')}</div>
                <div className="flex items-center gap-1.5">
                  <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} className={selectCls}>
                    <option value="">{t('board.assigneeAny')}</option>
                    {members.data?.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                  </select>
                  <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={selectCls}>
                    <option value="">{t('list.allStatuses')}</option>
                    {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>
              <ul className="divide-y rounded-md border">
                {sprintTickets.map((tk) => (
                  <li key={tk.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <button
                      onClick={() => navigate(`/orgs/${slug}/projects/${projectSlug}/board/ticket/${tk.number}`)}
                      className="min-w-0 flex-1 truncate text-left hover:underline"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{tk.key}</span> {tk.title}
                    </button>
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', PRIORITY_CLASS[tk.priority])}>{tk.priority}</span>
                    <select
                      value={tk.status}
                      onChange={(e) => act(() => api.updateTicketStatus(tk.id, e.target.value as TicketStatus), t('sprints.statusChanged'))}
                      className={selectCls}
                    >
                      {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="shrink-0" title={tk.assignedTo?.name ?? t('drawer.unassigned')}>
                          <Avatar className="h-6 w-6">
                            {tk.assignedTo?.avatarUrl && <AvatarImage src={tk.assignedTo.avatarUrl} />}
                            <AvatarFallback className="text-[9px]">
                              {tk.assignedTo ? tk.assignedTo.name.slice(0, 2).toUpperCase() : '—'}
                            </AvatarFallback>
                          </Avatar>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => assign(tk, null)}>{t('drawer.unassigned')}</DropdownMenuItem>
                        {members.data?.members.map((m) => (
                          <DropdownMenuItem key={m.userId} onClick={() => assign(tk, m.userId)}>{m.name}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {tk.storyPoints != null && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t('sprints.pts', { n: tk.storyPoints })}</span>
                    )}
                    {/* Move this ticket to another sprint, or back to the backlog. */}
                    <select
                      className={selectCls}
                      value={sprint.id}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === sprint.id) return
                        if (v === '__backlog__') act(() => api.removeFromSprint(sprint.id, tk.id), t('sprints.movedToBacklog'))
                        else act(() => api.addToSprint(v, [tk.id]), t('sprints.movedToSprint'))
                      }}
                    >
                      {allSprints.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id === sprint.id ? t('sprints.current', { name: s.name }) : t('sprints.moveTo', { name: s.name })}
                        </option>
                      ))}
                      <option value="__backlog__">{t('sprints.moveToBacklog')}</option>
                    </select>
                  </li>
                ))}
                {sprintTickets.length === 0 && (
                  <li className="px-3 py-3 text-center text-xs text-muted-foreground">{t('sprints.noTicketsInSprint')}</li>
                )}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('sprints.addTickets')}</div>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value=""
                onChange={(e) => e.target.value && act(() => api.addToSprint(sprint.id, [e.target.value]), t('sprints.added'))}
              >
                <option value="">{t('sprints.selectTicket')}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.key} — {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function Sprints() {
  const { slug = '', projectSlug = '' } = useParams()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const orgId = org.data?.org.id
  const projects = useQuery({ queryKey: ['projects', orgId], queryFn: () => api.listProjects(orgId!), enabled: Boolean(orgId) })
  const project = projects.data?.projects.find((p) => p.slug === projectSlug)
  const projectId = project?.id

  const sprints = useQuery({ queryKey: ['sprints', projectId], queryFn: () => api.listSprints(projectId!), enabled: Boolean(projectId) })
  const allTickets = useQuery({
    queryKey: ['tickets', projectId, { sort: 'number' }],
    queryFn: () => api.listTickets(projectId!, { sort: 'number' }),
    enabled: Boolean(projectId),
  })
  // 3.7 R3 — live sync: refetch sprints + tickets on any project change.
  // 3.7.1 F3 — also the bare ['sprint'] prefix so foreign events refresh any
  // expanded sprint's detail (['sprint', id]); local mutations already do this.
  useProjectSync(projectId, [['sprints', projectId], ['tickets', projectId], ['sprint']])
  const backlog = (allTickets.data?.items ?? []).filter((tk) => !tk.sprintId)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )
  const [dragId, setDragId] = useState<string | null>(null)
  const activeTicket = dragId ? allTickets.data?.items.find((tk) => tk.id === dragId) : undefined

  const move = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      qc.invalidateQueries({ queryKey: ['tickets', projectId] })
      qc.invalidateQueries({ queryKey: ['sprints', projectId] })
      sprints.data?.sprints.forEach((s) => qc.invalidateQueries({ queryKey: ['sprint', s.id] }))
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  // F2 — drop a ticket onto a sprint card (add) or the backlog zone (remove).
  async function onDragEnd(e: DragEndEvent) {
    setDragId(null)
    if (!e.over) return
    const ticketId = String(e.active.id)
    const over = String(e.over.id)
    const tk = allTickets.data?.items.find((x) => x.id === ticketId)
    if (!tk) return
    if (over === 'backlog') {
      if (tk.sprintId) await move(() => api.removeFromSprint(tk.sprintId!, ticketId), t('sprints.movedToBacklog'))
    } else if (over !== tk.sprintId) {
      await move(() => api.addToSprint(over, [ticketId]), t('sprints.movedToSprint'))
    }
  }

  const [name, setName] = useState('')
  const create = async () => {
    if (!projectId || !name.trim()) return
    try {
      await api.createSprint(projectId, name.trim())
      setName('')
      qc.invalidateQueries({ queryKey: ['sprints', projectId] })
      toast.success(t('sprints.created'))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['sprints', projectId] })
    sprints.data?.sprints.forEach((s) => qc.invalidateQueries({ queryKey: ['sprint', s.id] }))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to={`/orgs/${slug}/projects/${projectSlug}`} className="text-sm text-muted-foreground hover:underline">
            {t('sprints.backToBoard')}
          </Link>
          <h2 className="text-xl font-semibold text-foreground">{t('sprints.title', { project: project?.name ?? projectSlug })}</h2>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
        className="flex gap-2"
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('sprints.newSprintPlaceholder')} className="max-w-xs" />
        <Button type="submit" disabled={!name.trim()}>
          {t('sprints.createSprint')}
        </Button>
      </form>

      <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
        <BacklogZone tickets={backlog} />

        <div className="space-y-3">
          {projectId &&
            sprints.data?.sprints.map((s) => (
              <SprintRow key={s.id} sprint={s} projectId={projectId} allSprints={sprints.data!.sprints} slug={slug} projectSlug={projectSlug} onChanged={refresh} />
            ))}
          {sprints.data?.sprints.length === 0 && <EmptyState icon={Rocket} message={t('sprints.empty')} />}
        </div>

        <DragOverlay>{activeTicket ? <TicketChip ticket={activeTicket} /> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}

// F2 — droppable backlog strip of unsprinted tickets to drag into sprints.
function BacklogZone({ tickets }: { tickets: Ticket[] }) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: 'backlog' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border border-dashed p-3 transition-colors',
        isOver ? 'border-primary/50 bg-accent' : 'border-input',
      )}
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('sprints.backlog')}</div>
      {tickets.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('sprints.backlogEmpty')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tickets.map((tk) => (
            <TicketChip key={tk.id} ticket={tk} />
          ))}
        </div>
      )}
    </div>
  )
}
