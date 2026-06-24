import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Eye } from 'lucide-react'
import type { Ticket } from '@/lib/api'
import { PRIORITY_CLASS } from '@/lib/board'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function TicketCard({ ticket, onOpen }: { ticket: Ticket; onOpen: (t: Ticket) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group rounded-lg border bg-card p-3 shadow-sm transition hover:shadow-md',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onOpen(ticket)}
          className="text-left text-sm font-medium leading-snug text-foreground hover:underline"
        >
          {ticket.title}
        </button>
        {/* drag handle = the rest of the card */}
        <span
          {...listeners}
          {...attributes}
          className="mt-0.5 cursor-grab select-none text-xs font-mono text-muted-foreground active:cursor-grabbing"
        >
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
