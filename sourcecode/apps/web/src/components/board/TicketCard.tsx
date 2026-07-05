import { useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { Ban, Eye, MoreHorizontal, ListPlus } from 'lucide-react'
import type { Member, Ticket, TicketStatus } from '@/lib/api'
import { ALL_STATUSES, BOARD_COLUMNS, PRIORITY_CLASS, STATUS_LABEL } from '@/lib/board'
import { staleBorderClass } from '@/lib/time'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ReadinessRing } from '@/components/ReadinessRing'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/** Pure visual — reused by the draggable card and the drag overlay. */
export function TicketCardBody({ ticket, dragging, viewers }: { ticket: Ticket; dragging?: boolean; viewers?: Member[] }) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'rounded-lg border border-l-2 bg-card p-3 transition-shadow',
        staleBorderClass(ticket.updatedAt),
        dragging ? 'rotate-1 shadow-xl ring-2 ring-primary/30' : 'shadow-sm hover:shadow-md',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug text-foreground">{ticket.title}</span>
        {/* Key hides on hover so the ⋯ status menu can take its place (no overlap). */}
        <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground transition-opacity group-hover:opacity-0">
          {ticket.key}
        </span>
      </div>

      {ticket.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {ticket.labels.map((l) => (
            <span
              key={l.id}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${l.color}22`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', PRIORITY_CLASS[ticket.priority])}>
            {ticket.priority}
          </span>
          {(ticket.blockedBy ?? 0) > 0 && (
            <span
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
              title={t('list.blockedHint', { count: ticket.blockedBy })}
            >
              <Ban className="h-3 w-3" /> {t('list.blocked')}
            </span>
          )}
          {/* E1 — live viewers currently on this ticket */}
          {viewers && viewers.length > 0 && (
            <div className="flex -space-x-1.5" title={viewers.map((v) => v.name).join(', ')}>
              {viewers.slice(0, 3).map((v) => (
                <Avatar key={v.userId} className="h-5 w-5 border border-background ring-1 ring-green-500 motion-safe:animate-pulse">
                  {v.avatarUrl && <AvatarImage src={v.avatarUrl} />}
                  <AvatarFallback className="text-[8px]">{v.initials}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ReadinessRing ticket={ticket} />
          {ticket.watcherIds.length > 0 && (
            <span className="flex items-center gap-0.5">
              <Eye className="h-3 w-3" /> {ticket.watcherIds.length}
            </span>
          )}
          {ticket.assignedTo && (
            <Avatar className="h-6 w-6">
              {ticket.assignedTo.avatarUrl && <AvatarImage src={ticket.assignedTo.avatarUrl} />}
              <AvatarFallback>{ticket.assignedTo.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  )
}

interface TicketCardProps {
  ticket: Ticket
  onOpen: (t: Ticket) => void
  onStatusChange: (id: string, status: TicketStatus) => void
  /** R9: open the drawer focused on the inline "new subtask" input. */
  onAddSubtask?: (t: Ticket) => void
  /** B4 focus mode: cards that aren't mine are dimmed (not hidden). */
  dimmed?: boolean
  /** E1: members currently viewing this ticket (minus me). */
  viewers?: Member[]
  /** 3.1 bulk: multi-select checkbox state. */
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

export function TicketCard({ ticket, onOpen, onStatusChange, onAddSubtask, dimmed, viewers, selected, onToggleSelect }: TicketCardProps) {
  const { t } = useTranslation()
  // useSortable gives within-column reordering (cards shift to make room) plus
  // cross-column moves. The 5px activation distance (set on the board) lets a
  // plain click through to onOpen; a real drag is mirrored by the DragOverlay.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ticket.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  // Stop the status menu from triggering a drag (pointerdown) or the drawer (click).
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  // B3 — swipe-to-advance on touch: a quick horizontal flick advances (right) or
  // retreats (left) the status. Composes with dnd-kit's touch listener (long
  // press still starts a drag); sets swipedRef so the trailing click won't open.
  const dnd = (listeners ?? {}) as Record<string, ((e: React.SyntheticEvent) => void) | undefined>
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null)
  const swipedRef = useRef(false)
  const onTouchStart = (e: React.TouchEvent) => {
    dnd.onTouchStart?.(e)
    const tt = e.touches[0]
    swipeStart.current = { x: tt.clientX, y: tt.clientY, t: Date.now() }
    swipedRef.current = false
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    dnd.onTouchEnd?.(e)
    const s = swipeStart.current
    if (!s) return
    const tt = e.changedTouches[0]
    const dx = tt.clientX - s.x
    const dy = tt.clientY - s.y
    if (Math.abs(dx) > 70 && Math.abs(dy) < 40 && Date.now() - s.t < 600) {
      const idx = BOARD_COLUMNS.indexOf(ticket.status)
      const target = idx >= 0 ? BOARD_COLUMNS[idx + (dx > 0 ? 1 : -1)] : undefined
      if (target) {
        swipedRef.current = true
        onStatusChange(ticket.id, target)
      }
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={() => {
        if (swipedRef.current) {
          swipedRef.current = false
          return
        }
        onOpen(ticket)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(ticket)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${ticket.key}: ${ticket.title}`}
      className={cn(
        'group relative cursor-grab outline-none ring-offset-background transition-opacity focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
        isDragging && 'opacity-40',
        dimmed && 'opacity-30 hover:opacity-100',
      )}
    >
      <TicketCardBody ticket={ticket} viewers={viewers} />
      {onToggleSelect && (
        <div
          className={cn(
            'absolute -left-1.5 -top-1.5 transition-opacity',
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
          onPointerDown={stop}
          onClick={stop}
        >
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelect(ticket.id)}
            aria-label={t('bulk.selectTicket', { key: ticket.key })}
            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
          />
        </div>
      )}
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" onPointerDown={stop} onClick={stop}>
        {onAddSubtask && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddSubtask(ticket)
            }}
            className="rounded bg-card p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t('relations.addSubtask')}
            aria-label={t('relations.addSubtask')}
          >
            <ListPlus className="h-4 w-4" />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded bg-card p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" title={t('board.changeStatus')}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {ALL_STATUSES.map((s) => (
              <DropdownMenuItem
                key={s}
                disabled={s === ticket.status}
                onClick={() => onStatusChange(ticket.id, s)}
              >
                {STATUS_LABEL[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
