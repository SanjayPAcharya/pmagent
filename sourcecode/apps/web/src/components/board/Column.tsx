import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import type { Ticket, TicketStatus } from '@/lib/api'
import { STATUS_LABEL } from '@/lib/board'
import { TicketCard } from './TicketCard'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Props {
  status: TicketStatus
  tickets: Ticket[]
  onOpen: (t: Ticket) => void
  onQuickAdd: (status: TicketStatus, title: string) => void
  onStatusChange: (id: string, status: TicketStatus) => void
}

export function Column({ status, tickets, onOpen, onQuickAdd, onStatusChange }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const submit = () => {
    const t = title.trim()
    if (t) onQuickAdd(status, t)
    setTitle('')
    setAdding(false)
  }

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{STATUS_LABEL[status]}</h3>
          <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{tickets.length}</span>
        </div>
        <button onClick={() => setAdding((v) => !v)} className="text-muted-foreground hover:text-foreground" title="Add ticket">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border border-dashed border-transparent bg-muted/40 p-2 transition',
          isOver && 'border-primary/40 bg-accent',
        )}
      >
        {adding && (
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') {
                setTitle('')
                setAdding(false)
              }
            }}
            placeholder="Ticket title…"
            className="bg-background"
          />
        )}
        <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} onOpen={onOpen} onStatusChange={onStatusChange} />
          ))}
        </SortableContext>
        {tickets.length === 0 && !adding && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">No tickets</p>
        )}
      </div>
    </div>
  )
}
