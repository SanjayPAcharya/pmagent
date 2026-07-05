import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
import { api, type Sprint, type Ticket } from '@/lib/api'
import { useProjectSync } from '@/lib/websocket'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BurndownSparkline } from '@/components/BurndownSparkline'
import { cn } from '@/lib/utils'

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
  onChanged,
}: {
  sprint: Sprint
  projectId: string
  allSprints: Sprint[]
  onChanged: () => void
}) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: sprint.id })
  const detail = useQuery({ queryKey: ['sprint', sprint.id], queryFn: () => api.getSprint(sprint.id) })
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

  return (
    <Card ref={setDropRef} className={cn(isOver && 'ring-2 ring-primary/50')}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
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
      </CardHeader>
      <CardContent>
        {sprint.goal && <p className="mb-2 text-sm text-muted-foreground">{sprint.goal}</p>}
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
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('sprints.inThisSprint')}</div>
              <ul className="divide-y rounded-md border">
                {detail.data?.tickets.map((tk) => (
                  <li key={tk.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="truncate">
                      <span className="font-mono text-xs text-muted-foreground">{tk.key}</span> {tk.title}
                    </span>
                    {/* Move this ticket to another sprint, or back to the backlog. */}
                    <select
                      className="h-8 shrink-0 rounded-md border border-input bg-transparent px-2 text-xs"
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
                {detail.data?.tickets.length === 0 && (
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
  useProjectSync(projectId, [['sprints', projectId], ['tickets', projectId]])
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
              <SprintRow key={s.id} sprint={s} projectId={projectId} allSprints={sprints.data!.sprints} onChanged={refresh} />
            ))}
          {sprints.data?.sprints.length === 0 && <p className="text-sm text-muted-foreground">{t('sprints.empty')}</p>}
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
