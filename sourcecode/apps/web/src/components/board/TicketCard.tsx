import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { Eye, MoreHorizontal } from 'lucide-react'
import type { Ticket, TicketStatus } from '@/lib/api'
import { ALL_STATUSES, PRIORITY_CLASS, STATUS_LABEL } from '@/lib/board'
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
export function TicketCardBody({ ticket, dragging }: { ticket: Ticket; dragging?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 transition-shadow',
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
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', PRIORITY_CLASS[ticket.priority])}>
          {ticket.priority}
        </span>
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
  /** B4 focus mode: cards that aren't mine are dimmed (not hidden). */
  dimmed?: boolean
}

export function TicketCard({ ticket, onOpen, onStatusChange, dimmed }: TicketCardProps) {
  const { t } = useTranslation()
  // useSortable gives within-column reordering (cards shift to make room) plus
  // cross-column moves. The 5px activation distance (set on the board) lets a
  // plain click through to onOpen; a real drag is mirrored by the DragOverlay.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ticket.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  // Stop the status menu from triggering a drag (pointerdown) or the drawer (click).
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(ticket)}
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
      <TicketCardBody ticket={ticket} />
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100" onPointerDown={stop} onClick={stop}>
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
