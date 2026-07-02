import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import type { Member, Ticket, TicketStatus } from '@/lib/api'
import { STATUS_LABEL, WIP_LIMITS } from '@/lib/board'
import { TicketCard } from './TicketCard'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export interface GhostInfo {
  ticketId: string
  title: string
  initials: string
}

interface Props {
  status: TicketStatus
  tickets: Ticket[]
  onOpen: (t: Ticket) => void
  onQuickAdd: (status: TicketStatus, title: string) => void
  onStatusChange: (id: string, status: TicketStatus) => void
  /** B4 focus mode: when set, cards not assigned to this user are dimmed. */
  focusUserId?: string | null
  /** E1: userId→members viewing each ticket (minus me). */
  viewers?: Record<string, Member[]>
  /** B1: other viewers' in-flight drags landing in this column. */
  ghosts?: GhostInfo[]
  /** 3.1 bulk: multi-select state. */
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}

export function Column({ status, tickets, onOpen, onQuickAdd, onStatusChange, focusUserId, viewers, ghosts, selectedIds, onToggleSelect }: Props) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const wipLimit = WIP_LIMITS[status]
  const overWip = wipLimit != null && tickets.length > wipLimit

  const submit = () => {
    const t = title.trim()
    if (t) onQuickAdd(status, t)
    setTitle('')
    setAdding(false)
  }

  return (
    <div className="flex w-[85vw] shrink-0 snap-start flex-col sm:w-72">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{STATUS_LABEL[status]}</h3>
          <span
            className={cn(
              'rounded-full px-2 text-xs',
              overWip
                ? 'bg-amber-500/20 font-semibold text-amber-600 motion-safe:animate-pulse dark:text-amber-400'
                : 'bg-muted text-muted-foreground',
            )}
            title={wipLimit != null ? t('board.wipLimit', { count: tickets.length, limit: wipLimit }) : undefined}
          >
            {wipLimit != null ? `${tickets.length}/${wipLimit}` : tickets.length}
          </span>
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
            placeholder={t('board.addTicketTitle')}
            className="bg-background"
          />
        )}
        <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              onOpen={onOpen}
              onStatusChange={onStatusChange}
              dimmed={Boolean(focusUserId) && t.assignedToId !== focusUserId}
              viewers={viewers?.[t.id]}
              selected={selectedIds?.has(t.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </SortableContext>
        {/* B1 — ghost cards for other viewers' in-flight drags landing here */}
        {ghosts?.map((g) => (
          <div
            key={`ghost-${g.ticketId}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3 text-sm text-muted-foreground"
          >
            <span className="truncate italic">{g.title}</span>
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarFallback className="text-[9px]">{g.initials}</AvatarFallback>
            </Avatar>
          </div>
        ))}
        {tickets.length === 0 && !adding && (ghosts?.length ?? 0) === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">{t('board.noTickets')}</p>
        )}
      </div>
    </div>
  )
}
