import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { api, type Ticket, type TicketStatus } from '@/lib/api'
import { BOARD_COLUMNS } from '@/lib/board'
import { useProjectWebSocket } from '@/lib/websocket'
import { Column } from '@/components/board/Column'
import { TicketDrawer } from '@/components/TicketDrawer'
import { NotificationBell } from '@/components/NotificationBell'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'

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

  const ticketsKey = ['tickets', projectId]
  const tickets = useQuery({
    queryKey: ticketsKey,
    queryFn: () => api.listTickets(projectId!, { sort: 'position' }),
    enabled: Boolean(projectId),
  })

  const [viewers, setViewers] = useState<string[]>([])

  useProjectWebSocket(
    projectId,
    {
      'ticket.created': () => qc.invalidateQueries({ queryKey: ticketsKey }),
      'ticket.updated': () => qc.invalidateQueries({ queryKey: ticketsKey }),
      'ticket.deleted': () => qc.invalidateQueries({ queryKey: ticketsKey }),
      'notification.new': () => {
        qc.invalidateQueries({ queryKey: ['notifications'] })
        qc.invalidateQueries({ queryKey: ['unreadCount'] })
      },
      'presence.state': (p: { viewers: string[] }) => setViewers(p.viewers ?? []),
    },
    { currentUserId: me.data?.user.id, onReconnect: () => qc.invalidateQueries({ queryKey: ticketsKey }) },
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

  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id)
    const target = e.over?.id as TicketStatus | undefined
    if (!target || !projectId) return
    const current = tickets.data?.items.find((t) => t.id === id)
    if (!current || current.status === target) return

    const endPos = Math.max(0, ...byStatus[target].map((t) => t.position)) + 1000
    // optimistic
    qc.setQueryData(ticketsKey, (old: typeof tickets.data) =>
      old ? { ...old, items: old.items.map((t) => (t.id === id ? { ...t, status: target, position: endPos } : t)) } : old,
    )
    try {
      await api.updateTicket(id, { status: target, position: endPos })
    } catch (err) {
      toast.error(`Move failed: ${(err as Error).message}`)
      qc.invalidateQueries({ queryKey: ticketsKey })
    }
  }

  async function quickAdd(status: TicketStatus, title: string) {
    if (!projectId) return
    try {
      await api.createTicket({ projectId, title, status })
      qc.invalidateQueries({ queryKey: ticketsKey })
      toast.success('Ticket created')
    } catch (err) {
      toast.error(`Create failed: ${(err as Error).message}`)
    }
  }

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
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {BOARD_COLUMNS.map((s) => (
              <Column key={s} status={s} tickets={byStatus[s]} onOpen={openTicket} onQuickAdd={quickAdd} />
            ))}
          </div>
        </DndContext>
      )}

      {drawerTicket && (
        <TicketDrawer
          ticketId={drawerTicket.id}
          members={members.data?.members ?? []}
          onClose={closeDrawer}
          onChanged={() => qc.invalidateQueries({ queryKey: ticketsKey })}
        />
      )}
    </div>
  )
}
