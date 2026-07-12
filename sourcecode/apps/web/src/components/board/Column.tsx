import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { Plus, FilePlus2 } from 'lucide-react'
import { api, type AITicketDraft, type Member, type Sprint, type Ticket, type TicketStatus, type TicketTemplate } from '@/lib/api'
import { PRIORITIES, STATUS_LABEL, WIP_LIMITS } from '@/lib/board'
import { parseQuickCreate, type ParsedQuickCreate } from '@/lib/parseQuickCreate'
import { AIButton } from '@/components/BetaBadge'
import { aiErrorKey } from '@/lib/useAIHealth'
import { useListReveal, useStagedHint, useTextReveal } from '@/lib/aiReveal'
import { composeEditedDraft, isDraftEdited, type DraftEdits } from '@/lib/aiDraftEdit'
import { TicketCard } from './TicketCard'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
  /** 3.8 B2 — project context for the AI draft call + the create handler for an accepted draft. */
  projectId?: string
  onCreateDraft?: (status: TicketStatus, draft: AITicketDraft) => Promise<void> | void
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
  projectId,
  onCreateDraft,
  onAddSubtask,
  focusUserId,
  viewers,
  ghosts,
  selectedIds,
  onToggleSelect,
}: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { setNodeRef, isOver } = useDroppable({ id: status })
  // Wraps the quick-add composer so onBlur can tell "clicked away" (submit the
  // raw title) from "clicked another composer control" like Draft with AI — the
  // latter must NOT submit, or it tears the composer down before runDraft runs.
  const composerRef = useRef<HTMLDivElement>(null)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  // 3.8 B2 — AI draft state: generate from the composer text, preview, then create.
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<AITicketDraft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [creatingDraft, setCreatingDraft] = useState(false)
  const draftAbort = useRef<AbortController | null>(null)
  const stageKey = useStagedHint(drafting)

  const runDraft = async () => {
    const notes = title.trim()
    if (!projectId || !notes) return
    draftAbort.current?.abort()
    const ctrl = new AbortController()
    draftAbort.current = ctrl
    setDrafting(true)
    setDraftError(null)
    try {
      const { draft: d } = await api.aiDraftTicket(projectId, notes, ctrl.signal)
      setDraft(d)
    } catch (e) {
      const key = aiErrorKey(e)
      // null = user cancelled — return to idle with no error shown.
      if (key) {
        setDraftError(t(key))
        // Re-gate the AI buttons immediately when the server reports it's down,
        // rather than waiting out the 60s health staleTime.
        if (key === 'ai.error.unavailable') qc.invalidateQueries({ queryKey: ['ai-health'] })
      }
    } finally {
      if (draftAbort.current === ctrl) {
        draftAbort.current = null
        setDrafting(false)
      }
    }
  }

  const cancelDraft = () => draftAbort.current?.abort()

  // B3 — the preview is editable; Create receives the edited draft (unchecked
  // AC already dropped), not the raw generation.
  const acceptDraft = async (edited: AITicketDraft) => {
    if (!onCreateDraft) return
    setCreatingDraft(true)
    try {
      await onCreateDraft(status, edited)
      setDraft(null)
      setTitle('')
      setAdding(false)
    } finally {
      setCreatingDraft(false)
    }
  }

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
          <div ref={composerRef} className="space-y-1.5">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              // Only "click away" submits the raw title; moving focus to another
              // composer control (Draft with AI, preview buttons) must not.
              onBlur={(e) => {
                if (!composerRef.current?.contains(e.relatedTarget as Node | null)) submit()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') {
                  // While a generation is in flight, Esc cancels it (composer stays).
                  if (drafting) {
                    cancelDraft()
                    return
                  }
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
            {onCreateDraft && projectId && (
              <div className="px-0.5">
                {/* Announce start + done only — the staged hint line is NOT live
                    (it would announce every stage change). */}
                <span className="sr-only" aria-live="polite">
                  {drafting ? t('ai.generating') : draft ? t('ai.readyAnnounce') : ''}
                </span>
                {!draft && (
                  <div className="flex flex-col gap-1">
                    <AIButton
                      label={t('ai.draftWithAI')}
                      onClick={runDraft}
                      busy={drafting}
                      disabled={!title.trim()}
                    />
                    {drafting && (
                      <div aria-busy="true" className="mt-1 space-y-2 rounded-md border bg-background p-2">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-3 w-14" />
                          <Skeleton className="h-4 w-12" />
                        </div>
                        <Skeleton className="h-4 w-3/4" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-5/6" />
                          <Skeleton className="h-3 w-2/3" />
                        </div>
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-[10px] text-muted-foreground">{stageKey && t(stageKey)}</span>
                          <button
                            type="button"
                            onClick={cancelDraft}
                            className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    )}
                    {draftError && (
                      <div className="flex items-center gap-2 text-[11px] text-destructive">
                        <span>{draftError}</span>
                        <button type="button" onClick={runDraft} className="underline hover:no-underline">
                          {t('ai.retry')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {draft && (
                  <DraftPreview
                    draft={draft}
                    creating={creatingDraft}
                    regenerating={drafting}
                    onCreate={acceptDraft}
                    onDiscard={() => setDraft(null)}
                    onRegenerate={runDraft}
                  />
                )}
              </div>
            )}
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

// 3.8.1 B2+B3 — draft preview: streams in first (title word-by-word, then the
// description, then AC bullets one by one — pure presentation, the validated
// draft is already complete), then becomes editable: title/description/priority
// plus per-AC-bullet checkboxes. What you edit is what Create submits;
// Regenerate confirms only when the working copy is dirty.
function DraftPreview({
  draft,
  creating,
  regenerating,
  onCreate,
  onDiscard,
  onRegenerate,
}: {
  draft: AITicketDraft
  creating: boolean
  regenerating: boolean
  onCreate: (edited: AITicketDraft) => void
  onDiscard: () => void
  onRegenerate: () => void
}) {
  const { t } = useTranslation()
  const [edits, setEdits] = useState<DraftEdits>({ title: draft.title, description: draft.description, priority: draft.priority })
  const [checks, setChecks] = useState<boolean[]>(draft.acceptanceCriteria.map(() => true))
  // A regenerate swaps the draft — reset the working copy and replay the reveal.
  useEffect(() => {
    setEdits({ title: draft.title, description: draft.description, priority: draft.priority })
    setChecks(draft.acceptanceCriteria.map(() => true))
  }, [draft])

  const titleReveal = useTextReveal(draft.title)
  const descReveal = useTextReveal(draft.description, { enabled: titleReveal.done })
  const acVisible = useListReveal(draft.acceptanceCriteria.length, descReveal.done)
  const revealing = !descReveal.done || acVisible < draft.acceptanceCriteria.length
  const stageKey = useStagedHint(regenerating)
  const busy = creating || regenerating

  const regenerate = () => {
    if (isDraftEdited(draft, edits, checks) && !window.confirm(t('ai.regenerateConfirm'))) return
    onRegenerate()
  }

  return (
    <div className="mt-1 space-y-2 rounded-md border bg-background p-2 text-xs" aria-busy={regenerating ? 'true' : undefined}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('ai.draftPreview')}</span>
        {revealing ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{draft.priority}</span>
        ) : (
          <select
            value={edits.priority}
            onChange={(e) => setEdits((v) => ({ ...v, priority: e.target.value as AITicketDraft['priority'] }))}
            disabled={busy}
            aria-label={t('ai.editPriority')}
            className="rounded border bg-muted px-1 py-0.5 text-[10px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>
      {revealing ? (
        <>
          <p className="font-medium text-foreground">{titleReveal.shown}</p>
          {draft.description && descReveal.shown && <p className="line-clamp-3 text-muted-foreground">{descReveal.shown}</p>}
          {acVisible > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {draft.acceptanceCriteria.slice(0, acVisible).map((ac, i) => (
                <li key={i} className="motion-safe:animate-in motion-safe:fade-in">
                  {ac}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <Input
            value={edits.title}
            onChange={(e) => setEdits((v) => ({ ...v, title: e.target.value }))}
            disabled={busy}
            aria-label={t('ai.editTitle')}
            className="h-7 bg-background text-xs font-medium"
          />
          <Textarea
            value={edits.description}
            onChange={(e) => setEdits((v) => ({ ...v, description: e.target.value }))}
            disabled={busy}
            aria-label={t('ai.editDescription')}
            rows={3}
            className="bg-background text-xs"
          />
          {draft.acceptanceCriteria.length > 0 && (
            <ul className="space-y-1">
              {draft.acceptanceCriteria.map((ac, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-1.5">
                    <input
                      type="checkbox"
                      checked={checks[i] ?? true}
                      onChange={() => setChecks((cs) => cs.map((c, j) => (j === i ? !c : c)))}
                      disabled={busy}
                      className="mt-0.5 accent-primary"
                    />
                    <span className={checks[i] ?? true ? 'text-muted-foreground' : 'text-muted-foreground/50 line-through'}>{ac}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => onCreate(composeEditedDraft(draft, edits, checks))}
          disabled={busy}
          className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
        >
          {creating ? t('common.loading') : t('ai.create')}
        </button>
        <button
          type="button"
          onClick={regenerate}
          disabled={busy}
          className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-70"
        >
          {regenerating ? t('ai.generating') : t('ai.regenerate')}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {t('ai.discard')}
        </button>
        {regenerating && stageKey && <span className="text-[10px] text-muted-foreground">{t(stageKey)}</span>}
      </div>
    </div>
  )
}
