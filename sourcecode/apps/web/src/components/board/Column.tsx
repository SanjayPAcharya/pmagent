import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { Plus, FilePlus2 } from 'lucide-react'
import type { Member, Sprint, Ticket, TicketStatus, TicketTemplate } from '@/lib/api'
import { STATUS_LABEL, WIP_LIMITS } from '@/lib/board'
import { parseQuickCreate, type ParsedQuickCreate } from '@/lib/parseQuickCreate'
import { BetaAIButton } from '@/components/BetaBadge'
import { TicketCard } from './TicketCard'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  onQuickAdd: (status: TicketStatus, parsed: ParsedQuickCreate) => void
  onStatusChange: (id: string, status: TicketStatus) => void
  /** R9 quick-add token resolution + template hook. */
  members?: Member[]
  sprints?: Sprint[]
  templates?: TicketTemplate[]
  onCreateFromTemplate?: (status: TicketStatus, tpl: TicketTemplate) => void
  onAddSubtask?: (t: Ticket) => void
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

export function Column({
  status,
  tickets,
  onOpen,
  onQuickAdd,
  onStatusChange,
  members = [],
  sprints = [],
  templates = [],
  onCreateFromTemplate,
  onAddSubtask,
  focusUserId,
  viewers,
  ghosts,
  selectedIds,
  onToggleSelect,
}: Props) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const wipLimit = WIP_LIMITS[status]
  const overWip = wipLimit != null && tickets.length > wipLimit

  // Live token parse — drives both the create payload and the preview chips.
  const parsed = parseQuickCreate(title, { members, sprints })
  const hasChips = Boolean(parsed.priority || parsed.assigneeName || parsed.sprintName)

  const submit = () => {
    if (parsed.title) onQuickAdd(status, parsed)
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
        <div className="flex items-center gap-0.5">
          {templates.length > 0 && onCreateFromTemplate && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground" title={t('board.fromTemplate')} aria-label={t('board.fromTemplate')}>
                  <FilePlus2 className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('board.fromTemplate')}</DropdownMenuLabel>
                {templates.map((tpl) => (
                  <DropdownMenuItem key={tpl.id} onClick={() => onCreateFromTemplate(status, tpl)}>
                    <span className="mr-2 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">{tpl.type}</span>
                    <span className="truncate">{tpl.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button onClick={() => setAdding((v) => !v)} className="text-muted-foreground hover:text-foreground" title={t('board.addTicket')}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border border-dashed border-transparent bg-muted/40 p-2 transition',
          isOver && 'border-primary/40 bg-accent',
        )}
      >
        {adding && (
          <div className="space-y-1.5">
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
              placeholder={t('board.quickAddHint')}
              className="bg-background"
            />
            {hasChips && (
              <div className="flex flex-wrap items-center gap-1 px-0.5">
                {parsed.priority && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{parsed.priority}</span>
                )}
                {parsed.assigneeName && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <Avatar className="h-3.5 w-3.5">
                      <AvatarFallback className="text-[7px]">{parsed.assigneeName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    {parsed.assigneeName}
                  </span>
                )}
                {parsed.sprintName && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">#{parsed.sprintName}</span>
                )}
              </div>
            )}
            <div className="flex px-0.5">
              <BetaAIButton label={t('beta.draftWithAI')} />
            </div>
          </div>
        )}
        <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              onOpen={onOpen}
              onStatusChange={onStatusChange}
              onAddSubtask={onAddSubtask}
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
