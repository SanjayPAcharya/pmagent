import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { toast } from 'sonner'
import { api, type Member, type Priority, type Ticket, type TicketStatus, type TicketType } from '@/lib/api'
import { BOARD_COLUMNS, PRIORITIES, STATUS_LABEL } from '@/lib/board'
import { useProjectWebSocket } from '@/lib/websocket'
import { Column } from '@/components/board/Column'
import { TicketCardBody } from '@/components/board/TicketCard'
import { BoardSkeleton } from '@/components/board/BoardSkeleton'
import { TicketDrawer } from '@/components/TicketDrawer'
import { NotificationBell } from '@/components/NotificationBell'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { fireConfetti } from '@/lib/confetti'
import { recordVisit } from '@/lib/frecency'
import { cn } from '@/lib/utils'

// A fractional position between two neighbours (board uses Float positions), so
// reordering only ever rewrites the one moved card.
function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before == null && after == null) return 1000
  if (before == null) return after! - 1000
  if (after == null) return before + 1000
  return (before + after) / 2
}

export default function Board() {
  const { slug = '', projectSlug = '', number } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()

  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const orgId = org.data?.org.id
  const projects = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.listProjects(orgId!),
    enabled: Boolean(orgId),
  })
  const project = projects.data?.projects.find((p) => p.slug === projectSlug)
  const projectId = project?.id

  const members = useQuery({
    queryKey: ['members', slug],
    queryFn: () => api.listMembers(slug),
    enabled: Boolean(slug),
  })
  const sprints = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => api.listSprints(projectId!),
    enabled: Boolean(projectId),
  })

  // ── Filters (A4) ──
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [type, setType] = useState<TicketType | ''>('')
  const [assignedToId, setAssignedToId] = useState('')
  const [sprintFilter, setSprintFilter] = useState('')
  const [sort, setSort] = useState('position')
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 300)
    return () => clearTimeout(id)
  }, [q])
  const hasFilters = Boolean(qDebounced || priority || type || assignedToId || sprintFilter || sort !== 'position')
  const clearFilters = () => {
    setQ('')
    setQDebounced('')
    setPriority('')
    setType('')
    setAssignedToId('')
    setSprintFilter('')
    setSort('position')
  }

  const params = useMemo(() => {
    const p: Record<string, string> = { sort }
    if (qDebounced) p.q = qDebounced
    if (priority) p.priority = priority
    if (type) p.type = type
    if (assignedToId) p.assignedToId = assignedToId
    if (sprintFilter) p.sprintId = sprintFilter
    return p
  }, [sort, qDebounced, priority, type, assignedToId, sprintFilter])

  const ticketsPrefix = useMemo(() => ['tickets', projectId], [projectId])
  const ticketsKey = useMemo(() => ['tickets', projectId, params], [projectId, params])
  const tickets = useQuery({
    queryKey: ticketsKey,
    queryFn: () => api.listTickets(projectId!, params),
    enabled: Boolean(projectId),
  })

  const [viewers, setViewers] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [focusMine, setFocusMine] = useState(false)
  // E1 — userIds viewing each ticket; B1 — other viewers' in-flight drags.
  const [ticketViewers, setTicketViewers] = useState<Record<string, string[]>>({})
  const [ghosts, setGhosts] = useState<Record<string, { actorId: string; status: TicketStatus }>>({})
  const myId = me.data?.user.id

  // B4 — press "f" to dim everything that isn't assigned to me ("what's mine").
  // Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'f' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      e.preventDefault()
      setFocusMine((v) => !v)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const { send } = useProjectWebSocket(
    projectId,
    {
      'ticket.created': () => qc.invalidateQueries({ queryKey: ticketsPrefix }),
      'ticket.updated': () => qc.invalidateQueries({ queryKey: ticketsPrefix }),
      'ticket.deleted': () => qc.invalidateQueries({ queryKey: ticketsPrefix }),
      'notification.new': () => {
        qc.invalidateQueries({ queryKey: ['notifications'] })
        qc.invalidateQueries({ queryKey: ['unreadCount'] })
      },
      'presence.state': (p: { viewers: string[] }) => setViewers(p.viewers ?? []),
      'ticket.presence': (p: { byTicket: Record<string, string[]> }) => setTicketViewers(p.byTicket ?? {}),
      // self-echo (actorId === me) is already dropped by the hook.
      'ticket.drag': (p: { actorId: string; ticketId: string | null; status: TicketStatus | null }) =>
        setGhosts((g) => {
          if (!p.ticketId) return g
          const next = { ...g }
          if (p.status == null) delete next[p.ticketId]
          else next[p.ticketId] = { actorId: p.actorId, status: p.status }
          return next
        }),
    },
    { currentUserId: me.data?.user.id, onReconnect: () => qc.invalidateQueries({ queryKey: ticketsPrefix }) },
  )

  // Mouse: drag after 5px. Touch: long-press (220ms) so the board still scrolls
  // with a normal swipe on mobile. Keyboard: a11y reordering.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const byStatus = useMemo(() => {
    const groups: Record<string, Ticket[]> = {}
    for (const s of BOARD_COLUMNS) groups[s] = []
    for (const t of tickets.data?.items ?? []) (groups[t.status] ??= []).push(t)
    // Only impose the manual (position) order under the default sort; for any
    // other sort, keep the server's order so the chosen sort is actually visible.
    if (sort === 'position') for (const s of BOARD_COLUMNS) groups[s].sort((a, b) => a.position - b.position || a.number - b.number)
    return groups
  }, [tickets.data, sort])

  const counts = useMemo(() => {
    const items = tickets.data?.items ?? []
    const done = items.filter((t) => t.status === 'DONE').length
    return { total: items.length, done }
  }, [tickets.data])

  // Drag end: figure out the target column + drop index (over a card = insert
  // before it; over the column = append) and place the card there with a
  // fractional position between its new neighbours.
  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    clearGhost(String(e.active.id)) // B1 — drag finished
    if (!e.over || !projectId) return
    const id = String(e.active.id)
    const overId = String(e.over.id)
    const active = tickets.data?.items.find((t) => t.id === id)
    if (!active) return

    const overTicket = tickets.data?.items.find((t) => t.id === overId)
    const target = overTicket?.status ?? (BOARD_COLUMNS.includes(overId as TicketStatus) ? (overId as TicketStatus) : undefined)
    if (!target) return

    const colList = byStatus[target].filter((t) => t.id !== id) // neighbours, active removed
    const index = overTicket ? Math.max(0, colList.findIndex((t) => t.id === overId)) : colList.length
    const newPos = positionBetween(colList[index - 1]?.position, colList[index]?.position)
    if (active.status === target && active.position === newPos) return
    await applyMove(id, target, newPos)
  }

  // Shared by the per-card status dropdown: move a ticket to the end of a column.
  async function moveTicket(id: string, target: TicketStatus) {
    if (!projectId) return
    const current = tickets.data?.items.find((t) => t.id === id)
    if (!current || current.status === target) return
    const endPos = positionBetween(Math.max(0, ...byStatus[target].map((t) => t.position)), undefined)
    await applyMove(id, target, endPos)
  }

  async function applyMove(id: string, target: TicketStatus, position: number, opts: { announce?: boolean } = {}) {
    const announce = opts.announce ?? true
    const prev = tickets.data?.items.find((t) => t.id === id)
    const fromStatus = prev?.status
    const fromPos = prev?.position
    qc.setQueryData(ticketsKey, (old: typeof tickets.data) =>
      old ? { ...old, items: old.items.map((t) => (t.id === id ? { ...t, status: target, position } : t)) } : old,
    )
    try {
      await api.updateTicket(id, { status: target, position })
      // Only narrate (with undo) when the column actually changed — silent on
      // pure within-column reorders so dragging doesn't spam toasts.
      if (announce && fromStatus && fromStatus !== target) {
        if (target === 'DONE') fireConfetti()
        toast.success(t('board.movedTo', { status: STATUS_LABEL[target] }), {
          action: {
            label: t('common.undo'),
            onClick: () => applyMove(id, fromStatus, fromPos ?? position, { announce: false }),
          },
        })
      }
    } catch (err) {
      toast.error(t('board.moveFailed', { message: (err as Error).message }))
      qc.invalidateQueries({ queryKey: ticketsPrefix })
    }
  }

  async function quickAdd(status: TicketStatus, title: string) {
    if (!projectId) return
    try {
      await api.createTicket({ projectId, title, status })
      qc.invalidateQueries({ queryKey: ticketsPrefix })
      toast.success(t('board.ticketCreated'))
    } catch (err) {
      toast.error(t('board.createFailed', { message: (err as Error).message }))
    }
  }

  // H1 — guided first ticket: create in Backlog and open the drawer so the
  // author lands on the goal/AC fields (the agent-ready pattern).
  const [firstTitle, setFirstTitle] = useState('')
  async function createFirstTicket() {
    const title = firstTitle.trim()
    if (!projectId || !title) return
    try {
      const { ticket } = await api.createTicket({ projectId, title, status: 'BACKLOG' })
      setFirstTitle('')
      qc.invalidateQueries({ queryKey: ticketsPrefix })
      navigate(`/orgs/${slug}/projects/${projectSlug}/ticket/${ticket.number}`)
    } catch (err) {
      toast.error(t('board.createFailed', { message: (err as Error).message }))
    }
  }

  const activeTicket = activeId ? tickets.data?.items.find((t) => t.id === activeId) : undefined

  // Resolve a drop target id (a ticket or a column) to its column status.
  const targetColumn = (overId: string): TicketStatus | undefined => {
    const overTicket = tickets.data?.items.find((t) => t.id === overId)
    return overTicket?.status ?? (BOARD_COLUMNS.includes(overId as TicketStatus) ? (overId as TicketStatus) : undefined)
  }

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id)
    setActiveId(id)
    const tk = tickets.data?.items.find((t) => t.id === id)
    if (tk) send({ type: 'ticket.drag', ticketId: id, status: tk.status }) // B1
  }
  // B1 — broadcast the live target column as the card moves over the board.
  const onDragOver = (e: DragOverEvent) => {
    if (!e.over || !activeId) return
    const target = targetColumn(String(e.over.id))
    if (target) send({ type: 'ticket.drag', ticketId: activeId, status: target })
  }
  const clearGhost = (id: string) => send({ type: 'ticket.drag', ticketId: id, status: null })

  const openTicket = (t: Ticket) => navigate(`/orgs/${slug}/projects/${projectSlug}/ticket/${t.number}`)
  const closeDrawer = () => navigate(`/orgs/${slug}/projects/${projectSlug}`)
  const drawerTicket = number ? tickets.data?.items.find((t) => t.number === Number(number)) : undefined

  // D2 frecency — record project + opened-ticket visits for the palette's Recent.
  useEffect(() => {
    if (project) recordVisit('project', { key: project.id, label: project.name, href: `/orgs/${slug}/projects/${project.slug}` })
  }, [project?.id])
  useEffect(() => {
    if (drawerTicket)
      recordVisit('ticket', {
        key: drawerTicket.id,
        label: drawerTicket.title,
        href: `/orgs/${slug}/projects/${projectSlug}/ticket/${drawerTicket.number}`,
        meta: drawerTicket.key,
      })
  }, [drawerTicket?.id])

  // E1 — tell the room which ticket I'm viewing (null when the drawer is closed).
  useEffect(() => {
    send({ type: 'ticket.viewing', ticketId: drawerTicket?.id ?? null })
  }, [drawerTicket?.id, send])

  // E1 — resolve viewer userIds (minus me) to members, per ticket.
  const viewersByTicket = useMemo(() => {
    const out: Record<string, Member[]> = {}
    for (const [tid, ids] of Object.entries(ticketViewers)) {
      const others = ids
        .filter((id) => id !== myId)
        .map((id) => members.data?.members.find((m) => m.userId === id))
        .filter(Boolean) as Member[]
      if (others.length) out[tid] = others
    }
    return out
  }, [ticketViewers, members.data, myId])

  // B1 — group other viewers' in-flight drags by their target column.
  const ghostsByStatus = useMemo(() => {
    const out: Record<string, { ticketId: string; title: string; initials: string }[]> = {}
    for (const [tid, g] of Object.entries(ghosts)) {
      const tk = tickets.data?.items.find((t) => t.id === tid)
      const actor = members.data?.members.find((m) => m.userId === g.actorId)
      ;(out[g.status] ??= []).push({ ticketId: tid, title: tk?.title ?? '…', initials: actor?.initials ?? '?' })
    }
    return out
  }, [ghosts, tickets.data, members.data])

  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link to={`/orgs/${slug}`} className="text-sm text-muted-foreground hover:underline">
            ← {org.data?.org.name ?? slug}
          </Link>
          <h2 className="text-xl font-semibold text-foreground">{project?.name ?? projectSlug}</h2>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setFocusMine((v) => !v)}
            aria-pressed={focusMine}
            title={t('board.focusHint')}
            className={cn(
              'rounded-md px-2 py-1 text-sm transition-colors',
              focusMine ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('board.focusMine')}
          </button>
          <Link
            to={`/orgs/${slug}/projects/${projectSlug}/sprints`}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {t('board.sprints')}
          </Link>
          {viewers.length > 0 && (
            <div className="flex -space-x-2">
              {viewers.slice(0, 5).map((uid) => {
                const m = members.data?.members.find((x) => x.userId === uid)
                return (
                  <Avatar key={uid} className="h-7 w-7 border-2 border-background">
                    <AvatarFallback>{m?.initials ?? '?'}</AvatarFallback>
                  </Avatar>
                )
              })}
            </div>
          )}
          <NotificationBell slug={slug} projectSlug={projectSlug} />
        </div>
      </div>

      {/* completion bar */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>{t('board.completion')}</span>
          <span>{t('board.completionSummary', { done: counts.done, total: counts.total, pct })}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* filter / sort bar (A4) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('board.search')}
          className="h-8 w-56 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">{t('board.priorityAny')}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as TicketType | '')} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">{t('board.typeAny')}</option>
          {(['FEATURE', 'BUG', 'CHORE', 'SPIKE'] as TicketType[]).map((ty) => (
            <option key={ty} value={ty}>
              {ty}
            </option>
          ))}
        </select>
        <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">{t('board.assigneeAny')}</option>
          {members.data?.members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
        <select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">{t('board.sprintAny')}</option>
          {sprints.data?.sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="position">{t('board.sortManual')}</option>
          <option value="-updatedAt">{t('board.sortUpdated')}</option>
          <option value="priority">{t('board.sortPriorityAsc')}</option>
          <option value="-priority">{t('board.sortPriorityDesc')}</option>
          <option value="number">{t('board.sortOldest')}</option>
          <option value="-number">{t('board.sortNewest')}</option>
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="h-8 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground">
            {t('board.clear')}
          </button>
        )}
      </div>

      {tickets.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {t('board.loadError', { message: (tickets.error as Error).message })}
        </div>
      ) : tickets.isLoading ? (
        <BoardSkeleton />
      ) : counts.total === 0 ? (
        <div className="mx-auto mt-8 max-w-md rounded-xl border bg-card p-6 text-center">
          <h3 className="text-base font-semibold text-foreground">{t('board.firstTicketTitle')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('board.firstTicketHint')}</p>
          <ol className="mx-auto mt-4 max-w-xs list-decimal space-y-1 pl-5 text-left text-sm text-muted-foreground">
            <li>{t('board.firstStep1')}</li>
            <li>{t('board.firstStep2')}</li>
            <li>{t('board.firstStep3')}</li>
          </ol>
          <div className="mt-4 flex gap-2">
            <input
              autoFocus
              value={firstTitle}
              onChange={(e) => setFirstTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFirstTicket()}
              placeholder={t('board.firstTicketPlaceholder')}
              className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <button
              onClick={createFirstTicket}
              disabled={!firstTitle.trim()}
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {t('common.create')}
            </button>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            if (activeId) clearGhost(activeId)
            setActiveId(null)
          }}
        >
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:snap-none">
            {BOARD_COLUMNS.map((s) => (
              <Column
                key={s}
                status={s}
                tickets={byStatus[s]}
                onOpen={openTicket}
                onQuickAdd={quickAdd}
                onStatusChange={moveTicket}
                focusUserId={focusMine ? myId : null}
                viewers={viewersByTicket}
                ghosts={ghostsByStatus[s] ?? []}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
            {activeTicket ? (
              <div className="w-64">
                <TicketCardBody ticket={activeTicket} dragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {drawerTicket && (
        <TicketDrawer
          ticketId={drawerTicket.id}
          orgId={orgId ?? ''}
          members={members.data?.members ?? []}
          viewers={viewersByTicket[drawerTicket.id]}
          onClose={closeDrawer}
          onChanged={() => qc.invalidateQueries({ queryKey: ticketsPrefix })}
        />
      )}
    </div>
  )
}
