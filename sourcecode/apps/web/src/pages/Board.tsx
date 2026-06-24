import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { toast } from 'sonner'
import { api, type Priority, type Ticket, type TicketStatus, type TicketType } from '@/lib/api'
import { BOARD_COLUMNS, PRIORITIES } from '@/lib/board'
import { useProjectWebSocket } from '@/lib/websocket'
import { Column } from '@/components/board/Column'
import { TicketCardBody } from '@/components/board/TicketCard'
import { TicketDrawer } from '@/components/TicketDrawer'
import { NotificationBell } from '@/components/NotificationBell'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'

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

  useProjectWebSocket(
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
    },
    { currentUserId: me.data?.user.id, onReconnect: () => qc.invalidateQueries({ queryKey: ticketsPrefix }) },
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const byStatus = useMemo(() => {
    const groups: Record<string, Ticket[]> = {}
    for (const s of BOARD_COLUMNS) groups[s] = []
    for (const t of tickets.data?.items ?? []) (groups[t.status] ??= []).push(t)
    for (const s of BOARD_COLUMNS) groups[s].sort((a, b) => a.position - b.position || a.number - b.number)
    return groups
  }, [tickets.data])

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

  async function applyMove(id: string, target: TicketStatus, position: number) {
    qc.setQueryData(ticketsKey, (old: typeof tickets.data) =>
      old ? { ...old, items: old.items.map((t) => (t.id === id ? { ...t, status: target, position } : t)) } : old,
    )
    try {
      await api.updateTicket(id, { status: target, position })
    } catch (err) {
      toast.error(`Move failed: ${(err as Error).message}`)
      qc.invalidateQueries({ queryKey: ticketsPrefix })
    }
  }

  async function quickAdd(status: TicketStatus, title: string) {
    if (!projectId) return
    try {
      await api.createTicket({ projectId, title, status })
      qc.invalidateQueries({ queryKey: ticketsPrefix })
      toast.success('Ticket created')
    } catch (err) {
      toast.error(`Create failed: ${(err as Error).message}`)
    }
  }

  const activeTicket = activeId ? tickets.data?.items.find((t) => t.id === activeId) : undefined
  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const openTicket = (t: Ticket) => navigate(`/orgs/${slug}/projects/${projectSlug}/ticket/${t.number}`)
  const closeDrawer = () => navigate(`/orgs/${slug}/projects/${projectSlug}`)
  const drawerTicket = number ? tickets.data?.items.find((t) => t.number === Number(number)) : undefined

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
          <Link
            to={`/orgs/${slug}/projects/${projectSlug}/sprints`}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Sprints
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
          <span>Project completion</span>
          <span>
            {counts.done}/{counts.total} done · {pct}%
          </span>
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
          placeholder="Search title or #number…"
          className="h-8 w-56 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">Priority: any</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as TicketType | '')} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">Type: any</option>
          {(['FEATURE', 'BUG', 'CHORE', 'SPIKE'] as TicketType[]).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">Assignee: any</option>
          {members.data?.members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
        <select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">Sprint: any</option>
          {sprints.data?.sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="position">Sort: manual</option>
          <option value="-updatedAt">Recently updated</option>
          <option value="priority">Priority ↑</option>
          <option value="-priority">Priority ↓</option>
          <option value="number">Oldest</option>
          <option value="-number">Newest</option>
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="h-8 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground">
            Clear
          </button>
        )}
      </div>

      {tickets.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load tickets: {(tickets.error as Error).message}
        </div>
      ) : tickets.isLoading ? (
        <div className="flex gap-4">
          {BOARD_COLUMNS.map((s) => (
            <Skeleton key={s} className="h-64 w-72" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {BOARD_COLUMNS.map((s) => (
              <Column
                key={s}
                status={s}
                tickets={byStatus[s]}
                onOpen={openTicket}
                onQuickAdd={quickAdd}
                onStatusChange={moveTicket}
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
          onClose={closeDrawer}
          onChanged={() => qc.invalidateQueries({ queryKey: ticketsPrefix })}
        />
      )}
    </div>
  )
}
