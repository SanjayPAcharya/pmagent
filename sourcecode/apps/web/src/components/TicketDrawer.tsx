import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Eye, Maximize2, Minimize2, Tag, X } from 'lucide-react'
import { api, type AIExpandDraft, type Comment as CommentType, type Member, type Priority, type Ticket, type TicketStatus, type TicketType as TicketKind, type UpdateTicketInput, type Workstream } from '@/lib/api'
import { ALL_STATUSES, PRIORITIES, PRIORITY_CLASS, STATUS_LABEL } from '@/lib/board'
import { useLocalStorageState } from '@/lib/useLocalStorage'
import { renderMarkdown } from '@/lib/markdown'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/components/ui/field-error'
import { BlockedBadge } from '@/components/BlockedBadge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ReadinessRing, ticketReadiness } from '@/components/ReadinessRing'
import { RelationsSection } from '@/components/RelationsSection'
import { AIButton } from '@/components/BetaBadge'
import { AIThinkingIndicator } from '@/components/AIThinkingIndicator'
import { aiErrorKey } from '@/lib/useAIHealth'
import { countSegments, prefersReducedMotion, sliceSequential } from '@/lib/aiReveal'
import {
  buildReviewFields,
  composeAccepted,
  defaultAccepts,
  setAllAccepts,
  type ExpandFieldKey,
  type ExpandValues,
} from '@/lib/aiExpandReview'
import { RelativeTime } from '@/components/RelativeTime'
import { parseChecklist, toggleChecklistItem } from '@/lib/checklist'
import { fireConfetti } from '@/lib/confetti'
import { cn } from '@/lib/utils'

// C3 — slash command palette shown when the comment box starts with "/".
const TICKET_TYPES: TicketKind[] = ['FEATURE', 'BUG', 'CHORE', 'SPIKE']

const SLASH_COMMANDS: { cmd: string; args: string }[] = [
  { cmd: 'status', args: 'done · in progress · blocked …' },
  { cmd: 'assign', args: 'name · none' },
  { cmd: 'sprint', args: 'name · none' },
  { cmd: 'due', args: 'today · tomorrow · YYYY-MM-DD' },
  { cmd: 'label', args: 'name' },
]

interface Props {
  ticketId: string
  orgId: string
  members: Member[]
  /** E1: other members currently viewing this ticket. */
  viewers?: Member[]
  onClose: () => void
  onChanged: () => void
}

export function TicketDrawer({ ticketId, orgId, members, viewers, onClose, onChanged }: Props) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const ticketQ = useQuery({ queryKey: ['ticket', ticketId], queryFn: () => api.getTicket(ticketId) })
  const comments = useQuery({ queryKey: ['comments', ticketId], queryFn: () => api.listComments(ticketId) })
  const activity = useQuery({ queryKey: ['activity', ticketId], queryFn: () => api.listActivity(ticketId) })
  const ticket = ticketQ.data?.ticket

  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [ac, setAc] = useState('')
  const [goal, setGoal] = useState('')
  const [constraints, setConstraints] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [comment, setComment] = useState('')
  // 3.8 B3 — AI auto-fill: an optional steer prompt + generate; on success the
  // editable spec fields are filled for the user to review and Save normally.
  const [autoFillOpen, setAutoFillOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [expanding, setExpanding] = useState(false)
  const [expandError, setExpandError] = useState<string | null>(null)
  // Inline date-range validation: block the patch when start > due and flag the
  // offending field. The server's DATE_RANGE 400 (3.7 R1) stays as backstop only.
  const [dateError, setDateError] = useState<'start' | 'due' | null>(null)
  // Mentions inserted via the picker: the editor shows "@Display Name", and we
  // remember name→userId so we can convert to the server token "@[uuid]" on send.
  const [mentions, setMentions] = useState<{ label: string; userId: string }[]>([])

  // Layout prefs — wide mode (two-column on lg) + per-section collapse, both persisted.
  const [wide, setWide] = useLocalStorageState('agentpm-drawer-wide', false)
  const [openSections, setOpenSections] = useLocalStorageState<Record<string, boolean>>('agentpm-drawer-sections', {})
  const sectionOpen = (id: string, dflt: boolean) => openSections[id] ?? dflt
  const toggleSection = (id: string, dflt: boolean) =>
    setOpenSections((p) => ({ ...p, [id]: !(p[id] ?? dflt) }))

  useEffect(() => {
    if (ticket) {
      setTitle(ticket.title)
      setDesc(ticket.description ?? '')
      setAc(ticket.acceptanceCriteria ?? '')
      setGoal(ticket.goal ?? '')
      setConstraints(ticket.constraints ?? '')
    }
  }, [ticket])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
    qc.invalidateQueries({ queryKey: ['activity', ticketId] })
    onChanged()
  }

  // 3.8.1 B4 — auto-fill generates first, then shows a per-field review
  // (current vs proposed) so the user accepts or keeps each field; nothing
  // overwrites blindly and nothing auto-saves. `review` holds the generated
  // draft until the user applies or discards it.
  const expandAbort = useRef<AbortController | null>(null)
  const [review, setReview] = useState<AIExpandDraft | null>(null)

  // Switching tickets must not carry the previous ticket's review across.
  useEffect(() => setReview(null), [ticketId])

  const runAutoFill = async () => {
    // No upfront overwrite confirm (B4) — generate, then review per field.
    expandAbort.current?.abort()
    const ctrl = new AbortController()
    expandAbort.current = ctrl
    setExpanding(true)
    setExpandError(null)
    setReview(null)
    try {
      const { draft } = await api.aiExpandTicket(ticketId, aiPrompt.trim() || undefined, ctrl.signal)
      setReview(draft)
      setAutoFillOpen(false)
      setAiPrompt('')
    } catch (e) {
      const key = aiErrorKey(e)
      // null = user cancelled — back to idle, no error shown.
      if (key) {
        setExpandError(t(key))
        if (key === 'ai.error.unavailable') qc.invalidateQueries({ queryKey: ['ai-health'] })
      }
    } finally {
      if (expandAbort.current === ctrl) {
        expandAbort.current = null
        setExpanding(false)
      }
    }
  }

  const cancelAutoFill = () => expandAbort.current?.abort()

  // Apply the reviewed values into the edit fields; the normal Save persists.
  const applyReview = (values: ExpandValues) => {
    setDesc(values.description)
    setGoal(values.goal)
    setAc(values.ac)
    setConstraints(values.constraints)
    setEditingDesc(true)
    setReview(null)
  }

  // E2 — build the inverse of an update so the success toast can offer Undo.
  // For labelIds (which has no scalar previous value) we restore the prior label set.
  function inverseInput(input: UpdateTicketInput, prevTicket: Ticket): UpdateTicketInput {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(input)) {
      if (k === 'labelIds') out.labelIds = prevTicket.labels.map((l) => l.id)
      else out[k] = (prevTicket as unknown as Record<string, unknown>)[k] ?? null
    }
    return out as UpdateTicketInput
  }

  async function patch(input: UpdateTicketInput, ok = t('drawer.saved'), opts: { undoable?: boolean } = {}) {
    const undoable = opts.undoable ?? true
    const key = ['ticket', ticketId]
    const prev = qc.getQueryData<{ ticket: Ticket }>(key)
    // Optimistically merge scalar fields for instant feedback (labels reconcile on
    // refetch since their shape differs from labelIds); roll back on error.
    if (prev?.ticket) {
      const { labelIds: _labelIds, ...scalar } = input
      qc.setQueryData(key, { ticket: { ...prev.ticket, ...scalar } })
    }
    try {
      await api.updateTicket(ticketId, input)
      refresh()
      if (input.status === 'DONE' && prev?.ticket && prev.ticket.status !== 'DONE') fireConfetti()
      const undo =
        undoable && prev?.ticket
          ? { label: t('common.undo'), onClick: () => patch(inverseInput(input, prev.ticket), t('drawer.reverted'), { undoable: false }) }
          : undefined
      toast.success(ok, undo ? { action: undo } : undefined)
    } catch (err) {
      if (prev) qc.setQueryData(key, prev)
      toast.error((err as Error).message)
    }
  }

  // R11 — server clears sprintId on ADHOC (R1 rule); refresh sprints so their
  // counts update. Non-undoable (the sprint clear makes a clean inverse ambiguous).
  async function changeWorkstream(w: Workstream) {
    if (!ticket || w === ticket.workstream) return
    await patch({ workstream: w }, t('drawer.saved'), { undoable: false })
    qc.invalidateQueries({ queryKey: ['sprints', ticket.projectId] })
  }

  async function remove() {
    if (!window.confirm(t('drawer.deleteConfirm'))) return
    try {
      await api.deleteTicket(ticketId)
      toast.success(t('drawer.ticketDeleted'))
      onChanged()
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  // C3 — slash commands in the comment box. "/status done", "/assign sanjay",
  // "/sprint sprint2", "/due tomorrow", "/label bug" run an update instead of
  // posting a comment. Unrecognized input falls through to a normal comment.
  async function runSlash(text: string): Promise<boolean> {
    const m = text.match(/^\/(\w+)\s+(.+)$/)
    if (!m) return false
    const [, cmd, raw] = m
    const arg = raw.trim()
    const argLc = arg.toLowerCase()
    const reset = () => {
      setComment('')
      setMentions([])
    }
    switch (cmd.toLowerCase()) {
      case 'status': {
        const s = ALL_STATUSES.find((x) => x.toLowerCase() === argLc.replace(/\s+/g, '_') || STATUS_LABEL[x].toLowerCase() === argLc)
        if (s) { patch({ status: s }); reset(); return true }
        break
      }
      case 'assign': {
        if (argLc === 'none') { patch({ assignedToId: null }, t('drawer.unassigned')); reset(); return true }
        const mem = members.find((x) => x.name.toLowerCase().replace(/\s+/g, '').includes(argLc.replace(/\s+/g, '')) || x.email.toLowerCase().startsWith(argLc))
        if (mem) { patch({ assignedToId: mem.userId }, t('drawer.assigned')); reset(); return true }
        break
      }
      case 'sprint': {
        if (argLc === 'none') { patch({ sprintId: null }, t('drawer.removedFromSprint')); reset(); return true }
        const sp = sprints.data?.sprints.find((x) => x.name.toLowerCase().replace(/\s+/g, '').includes(argLc.replace(/\s+/g, '')))
        if (sp) { patch({ sprintId: sp.id }, t('drawer.addedToSprint')); reset(); return true }
        break
      }
      case 'due': {
        const d = argLc === 'today' ? new Date() : argLc === 'tomorrow' ? new Date(Date.now() + 86_400_000) : new Date(arg)
        if (!Number.isNaN(d.getTime())) { patch({ dueDate: d.toISOString() }); reset(); return true }
        break
      }
      case 'label': {
        const lab = (labels.data?.labels ?? []).find((x) => x.name.toLowerCase().includes(argLc))
        if (lab && !labelIds.includes(lab.id)) { patch({ labelIds: [...labelIds, lab.id] }, t('drawer.labelsUpdated')); reset(); return true }
        break
      }
    }
    toast.error(t('drawer.slashUnknown', { cmd }))
    return true
  }

  async function submitComment() {
    const display = comment.trim()
    if (!display) return
    if (display.startsWith('/') && (await runSlash(display))) return
    // Convert each "@Display Name" back to the "@[uuid]" token the server resolves.
    // Longest labels first so one name can't partially match inside another.
    let body = display
    for (const { label, userId } of [...mentions].sort((a, b) => b.label.length - a.label.length)) {
      body = body.split(`@${label}`).join(`@[${userId}]`)
    }
    try {
      await api.addComment(ticketId, body)
      setComment('')
      setMentions([])
      qc.invalidateQueries({ queryKey: ['comments', ticketId] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const sprints = useQuery({
    queryKey: ['sprints', ticket?.projectId],
    queryFn: () => api.listSprints(ticket!.projectId),
    enabled: Boolean(ticket?.projectId),
  })
  const labels = useQuery({ queryKey: ['labels', orgId], queryFn: () => api.listLabels(orgId), enabled: Boolean(orgId) })

  const labelIds = (ticket?.labels ?? []).map((l) => l.id)
  const availableLabels = (labels.data?.labels ?? []).filter((l) => !labelIds.includes(l.id))
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('#64748b')
  const setLabels = (ids: string[]) => patch({ labelIds: ids }, t('drawer.labelsUpdated'))
  async function createAndAddLabel() {
    const name = newLabel.trim()
    if (!name) return
    try {
      const { label } = await api.createLabel(orgId, name, newColor)
      setNewLabel('')
      qc.invalidateQueries({ queryKey: ['labels', orgId] })
      await api.updateTicket(ticketId, { labelIds: [...labelIds, label.id] })
      refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // @mention: a trailing "@query" in the comment box opens a member picker; the
  // selection is stored as the server-resolved token `@[uuid]` and rendered back
  // as "@Name".
  // Slash-command suggestions while the comment is just "/word" (no arg yet).
  const slashMatch = comment.match(/^\/(\w*)$/)
  const slashCandidates = slashMatch ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(slashMatch[1].toLowerCase())) : []

  const mentionMatch = comment.match(/@([\w.]*)$/)
  const mentionCandidates = mentionMatch
    ? members
        .filter((m) => {
          const qy = mentionMatch[1].toLowerCase()
          return m.name.toLowerCase().includes(qy) || m.email.toLowerCase().includes(qy)
        })
        .slice(0, 6)
    : []
  const insertMention = (m: Member) => {
    setComment((prev) => prev.replace(/@([\w.]*)$/, `@${m.name} `))
    setMentions((prev) => [...prev.filter((x) => x.label !== m.name), { label: m.name, userId: m.userId }])
  }
  // Mentions render as highlighted chips: swap the `@[uuid]` token for a styled
  // <span> BEFORE markdown; DOMPurify keeps the span + class, strips anything else.
  const renderCommentBody = (body: string) =>
    renderMarkdown(
      body.replace(
        /@\[([0-9a-f-]{36})\]/gi,
        (_m, id) =>
          `<span class="rounded bg-primary/10 px-1 py-0.5 text-xs font-medium text-primary">@${
            members.find((x) => x.userId === id)?.name ?? 'user'
          }</span>`,
      ),
    )

  // 3.2 C3 — reaction chips under each comment. Fixed set; click toggles mine.
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const myId = me.data?.user.id
  const REACTION_EMOJI = ['👍', '🎉', '👀', '❤️']
  const CommentReactions = ({ c }: { c: CommentType }) => {
    const grouped = REACTION_EMOJI.map((emoji) => {
      const rows = (c.reactions ?? []).filter((r) => r.emoji === emoji)
      return { emoji, count: rows.length, mine: rows.some((r) => r.userId === myId) }
    })
    const toggle = async (emoji: string, mine: boolean) => {
      try {
        if (mine) await api.removeReaction(ticketId, c.id, emoji)
        else await api.addReaction(ticketId, c.id, emoji)
        qc.invalidateQueries({ queryKey: ['comments', ticketId] })
      } catch (e) {
        toast.error((e as Error).message)
      }
    }
    return (
      <div className="mt-2 flex items-center gap-1">
        {grouped
          .filter((g) => g.count > 0)
          .map((g) => (
            <button
              key={g.emoji}
              onClick={() => toggle(g.emoji, g.mine)}
              aria-pressed={g.mine}
              className={cn(
                'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
                g.mine ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent',
              )}
            >
              {g.emoji} {g.count}
            </button>
          ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t('drawer.addReaction')}
              className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground opacity-50 transition-opacity hover:bg-accent hover:opacity-100 group-hover/comment:opacity-100 focus-visible:opacity-100"
            >
              +🙂
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="flex gap-1 p-1">
              {grouped.map((g) => (
                <button
                  key={g.emoji}
                  onClick={() => toggle(g.emoji, g.mine)}
                  className={cn('rounded px-1.5 py-1 text-base hover:bg-accent', g.mine && 'bg-primary/10')}
                >
                  {g.emoji}
                </button>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  const SpecField = ({ label, body }: { label: string; body: string }) => (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
    </div>
  )

  // C2 — acceptance criteria: if the text has "- [ ]" task lines, render them as
  // interactive checkboxes (toggling rewrites the AC markdown); otherwise plain.
  const AcceptanceCriteria = () => {
    const { items, done, total } = parseChecklist(ac)
    if (total === 0) return <SpecField label={t('drawer.acceptanceCriteria')} body={ac} />
    const toggle = (line: number) => {
      const next = toggleChecklistItem(ac, line)
      setAc(next)
      patch({ acceptanceCriteria: next }, t('drawer.saved'), { undoable: false })
    }
    return (
      <div className="rounded-md border bg-muted/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('drawer.acceptanceCriteria')}</span>
          <span className={cn('text-xs', done === total ? 'font-medium text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
            {t('drawer.acProgress', { done, total })}
          </span>
        </div>
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.line}>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" checked={it.checked} onChange={() => toggle(it.line)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary" />
                <span className={it.checked ? 'text-muted-foreground line-through' : 'text-foreground'}>{it.text}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const assignee = members.find((m) => m.userId === ticket?.assignedToId)
  const currentSprint = sprints.data?.sprints.find((s) => s.id === ticket?.sprintId)
  const watchers = (ticket?.watcherIds ?? []).map((id) => members.find((m) => m.userId === id)).filter(Boolean) as Member[]
  const nonWatchers = members.filter((m) => !ticket?.watcherIds.includes(m.userId))

  // C1 — unified "story": comments + activity interleaved chronologically.
  const storyItems = [
    ...(comments.data?.comments ?? []).map((c) => ({ id: `c-${c.id}`, at: c.createdAt, comment: c, activity: null as null })),
    ...(activity.data?.activity ?? []).map((a) => ({ id: `a-${a.id}`, at: a.createdAt, comment: null as null, activity: a })),
  ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime())

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className={cn('w-full p-0 [&>button]:hidden', wide ? 'sm:max-w-[min(72rem,92vw)]' : 'sm:max-w-xl')}>
        {!ticket ? (
          <p className="p-6 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <>
            {/* Sticky header — key, title, status / priority / type stay visible while scrolling */}
            <div className="sticky top-0 z-20 border-b bg-background px-6 pb-3 pt-4">
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                {ticket.key}
                {/* E1 — others currently viewing this ticket */}
                {viewers && viewers.length > 0 && (
                  <span className="flex -space-x-1.5" title={t('drawer.alsoViewing', { names: viewers.map((v) => v.name).join(', ') })}>
                    {viewers.slice(0, 4).map((v) => (
                      <Avatar key={v.userId} className="h-5 w-5 border border-background ring-1 ring-green-500 motion-safe:animate-pulse">
                        {v.avatarUrl && <AvatarImage src={v.avatarUrl} />}
                        <AvatarFallback className="text-[8px]">{v.initials}</AvatarFallback>
                      </Avatar>
                    ))}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => setWide((w) => !w)}
                    aria-pressed={wide}
                    title={wide ? t('drawer.narrowDrawer') : t('drawer.widenDrawer')}
                    className="hidden rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground sm:inline-flex"
                  >
                    {wide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={onClose}
                    aria-label={t('common.back')}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              </div>
              <SheetTitle>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => title.trim() && title !== ticket.title && patch({ title: title.trim() })}
                  className="border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                />
              </SheetTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {/* Status */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {STATUS_LABEL[ticket.status]} <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {ALL_STATUSES.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => s !== ticket.status && patch({ status: s as TicketStatus })}>
                        {STATUS_LABEL[s]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Priority */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className={cn(PRIORITY_CLASS[ticket.priority], 'border-none')}>
                      {ticket.priority} <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {PRIORITIES.map((p) => (
                      <DropdownMenuItem key={p} onClick={() => p !== ticket.priority && patch({ priority: p as Priority })}>
                        {p}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Type */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {ticket.type} <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {TICKET_TYPES.map((ty) => (
                      <DropdownMenuItem key={ty} onClick={() => ty !== ticket.type && patch({ type: ty })}>
                        {ty}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Body — in wide mode: main (spec + conversation) left, meta sidebar right */}
            <div className="px-6 py-4">
              <div className={cn(wide && 'lg:flex lg:flex-row-reverse lg:gap-6')}>
                <div className={cn('space-y-3', wide && 'lg:w-[300px] lg:shrink-0')}>

            {/* Details — assignee / points / due / sprint */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => toggleSection('details', true)}
                aria-expanded={sectionOpen('details', true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', sectionOpen('details', true) && 'rotate-90')} />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('drawer.details')}</span>
                {!sectionOpen('details', true) && (
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {assignee?.name ?? t('drawer.unassigned')}
                    {currentSprint ? ` · ${currentSprint.name}` : ''}
                  </span>
                )}
              </button>
              {sectionOpen('details', true) && (
                <div className="border-t px-3 pb-3 pt-2">
                  <div className={cn('grid gap-4', wide ? 'grid-cols-1' : 'grid-cols-2')}>
              <div>
                <Label>{t('drawer.assignee')}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="mt-1 w-full justify-between">
                      {assignee?.name ?? t('drawer.unassigned')} <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => patch({ assignedToId: null }, t('drawer.unassigned'))}>{t('drawer.unassigned')}</DropdownMenuItem>
                    {members.map((m) => (
                      <DropdownMenuItem key={m.userId} onClick={() => patch({ assignedToId: m.userId }, t('drawer.assigned'))}>
                        {m.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div>
                <Label>{t('drawer.storyPoints')}</Label>
                <Input
                  type="number"
                  min={0}
                  defaultValue={ticket.storyPoints ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value)
                    if (v !== ticket.storyPoints) patch({ storyPoints: v })
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{t('drawer.startDate')}</Label>
                <Input
                  type="date"
                  defaultValue={ticket.startDate ? ticket.startDate.slice(0, 10) : ''}
                  aria-invalid={dateError === 'start'}
                  onBlur={(e) => {
                    const raw = e.target.value
                    const due = ticket.dueDate ? ticket.dueDate.slice(0, 10) : ''
                    if (raw && due && raw > due) {
                      setDateError('start')
                      return
                    }
                    setDateError(null)
                    patch({ startDate: raw ? new Date(raw).toISOString() : null })
                  }}
                  className="mt-1"
                />
                {dateError === 'start' && <FieldError>{t('drawer.dateRangeError')}</FieldError>}
              </div>
              <div>
                <Label>{t('drawer.dueDate')}</Label>
                <Input
                  type="date"
                  defaultValue={ticket.dueDate ? ticket.dueDate.slice(0, 10) : ''}
                  aria-invalid={dateError === 'due'}
                  onBlur={(e) => {
                    const raw = e.target.value
                    const start = ticket.startDate ? ticket.startDate.slice(0, 10) : ''
                    if (raw && start && start > raw) {
                      setDateError('due')
                      return
                    }
                    setDateError(null)
                    patch({ dueDate: raw ? new Date(raw).toISOString() : null })
                  }}
                  className="mt-1"
                />
                {dateError === 'due' && <FieldError>{t('drawer.dateRangeError')}</FieldError>}
              </div>
              <div>
                <Label>{t('drawer.sprint')}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="mt-1 w-full justify-between">
                      {currentSprint?.name ?? (ticket.sprintId ? '…' : t('drawer.noSprint'))} <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => ticket.sprintId && patch({ sprintId: null }, t('drawer.removedFromSprint'))}>
                      {t('drawer.noSprint')}
                    </DropdownMenuItem>
                    {sprints.data?.sprints.map((s) => (
                      <DropdownMenuItem key={s.id} onClick={() => s.id !== ticket.sprintId && patch({ sprintId: s.id }, t('drawer.addedToSprint'))}>
                        {s.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div>
                <Label>{t('drawer.workstream')}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="mt-1 w-full justify-between">
                      {ticket.workstream === 'ADHOC' ? t('drawer.workstreamAdhoc') : t('drawer.workstreamSprint')} <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => changeWorkstream('SPRINT')}>{t('drawer.workstreamSprint')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changeWorkstream('ADHOC')}>{t('drawer.workstreamAdhoc')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {ticket.workstream === 'SPRINT' && ticket.sprintId && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{t('drawer.adhocClearsSprint')}</p>
                )}
              </div>
            </div>

                </div>
              )}
            </div>

            {/* People & labels — watchers + labels grouped */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => toggleSection('people', false)}
                aria-expanded={sectionOpen('people', false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', sectionOpen('people', false) && 'rotate-90')} />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('drawer.peopleLabels')}</span>
                {!sectionOpen('people', false) && (
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {watchers.length}</span>
                    <span className="flex items-center gap-0.5"><Tag className="h-3 w-3" /> {ticket.labels.length}</span>
                  </span>
                )}
              </button>
              {sectionOpen('people', false) && (
                <div className="border-t px-3 pb-3 pt-2">
            <div>
              <Label>{t('drawer.watchers')}</Label>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {watchers.map((w) => (
                  <Badge key={w.userId} variant="secondary" className="gap-1">
                    {w.name}
                    <button
                      onClick={async () => {
                        await api.removeWatcher(ticketId, w.userId).catch((e) => toast.error((e as Error).message))
                        refresh()
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {nonWatchers.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        + {t('common.add')}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {nonWatchers.map((m) => (
                        <DropdownMenuItem
                          key={m.userId}
                          onClick={async () => {
                            await api.addWatcher(ticketId, m.userId).catch((e) => toast.error((e as Error).message))
                            refresh()
                          }}
                        >
                          {m.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Labels */}
            <div className="mt-4">
              <Label>{t('drawer.labels')}</Label>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {(ticket.labels ?? []).map((l) => (
                  <span
                    key={l.id}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${l.color}22`, color: l.color }}
                  >
                    {l.name}
                    <button onClick={() => setLabels(labelIds.filter((id) => id !== l.id))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {availableLabels.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        + {t('common.add')}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {availableLabels.map((l) => (
                        <DropdownMenuItem key={l.id} onClick={() => setLabels([...labelIds, l.id])}>
                          <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                          {l.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  title={t('drawer.labels')}
                />
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createAndAddLabel()}
                  placeholder={t('drawer.newLabelPlaceholder')}
                  className="h-8 flex-1"
                />
                <Button size="sm" variant="outline" onClick={createAndAddLabel} disabled={!newLabel.trim()}>
                  {t('common.create')}
                </Button>
              </div>
            </div>

                </div>
              )}
            </div>

            {/* Relationships — parent / subtasks / blocked-by / blocks (3.1) */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => toggleSection('relations', false)}
                aria-expanded={sectionOpen('relations', false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', sectionOpen('relations', false) && 'rotate-90')} />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('drawer.relationships')}</span>
                {(ticket.blockedBy ?? 0) > 0 && !sectionOpen('relations', false) && (
                  <BlockedBadge showIcon={false} className="ml-auto" />
                )}
              </button>
              {sectionOpen('relations', false) && (
                <div className="border-t px-3 pb-3 pt-0 [&>div]:mt-3">
                  <RelationsSection ticketId={ticketId} projectId={ticket.projectId} parentWorkstream={ticket.workstream} />
                </div>
              )}
            </div>
                </div>

                {/* Main column — spec + conversation */}
                <div className={cn('mt-4', wide && 'lg:mt-0 lg:min-w-0 lg:flex-1')}>

            {/* Spec — description + the agent-ready fields (goal/AC/constraints).
                The readiness ring (A1) reflects how much of the spec is filled. */}
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>{t('drawer.spec')}</Label>
                  <ReadinessRing ticket={ticket} size={18} />
                  <span className="text-xs text-muted-foreground">
                    {t('readiness.label', { ...ticketReadiness(ticket) })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <AIButton label={t('ai.autoFill')} onClick={() => setAutoFillOpen((v) => !v)} busy={expanding} />
                  <Button variant="ghost" size="sm" onClick={() => setEditingDesc((v) => !v)}>
                    {editingDesc ? t('common.preview') : t('common.edit')}
                  </Button>
                </div>
              </div>
              {autoFillOpen && !expanding && !review && (
                <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={2}
                    placeholder={t('ai.promptPlaceholder')}
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={runAutoFill}>
                      {t('ai.autoFill')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setAutoFillOpen(false)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                  {expandError && (
                    <div className="flex items-center gap-2 text-[11px] text-destructive">
                      <span>{expandError}</span>
                      <button type="button" onClick={runAutoFill} className="underline hover:no-underline">
                        {t('ai.retry')}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {review ? (
                <div
                  className="mt-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setReview(null)
                    }
                  }}
                >
                  <AutoFillReview
                    current={{ description: desc, goal, ac, constraints }}
                    draft={review}
                    onApply={applyReview}
                    onDiscard={() => setReview(null)}
                  />
                </div>
              ) : expanding ? (
                <div
                  className="mt-2"
                  onKeyDown={(e) => {
                    // Esc cancels the in-flight generation.
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      cancelAutoFill()
                    }
                  }}
                >
                  {/* Announce start only — the staged word is not live. */}
                  <span className="sr-only" aria-live="polite">
                    {t('ai.generating')}
                  </span>
                  <AIThinkingIndicator active onCancel={cancelAutoFill} />
                </div>
              ) : editingDesc ? (
                <div className="mt-1 space-y-2">
                  <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} placeholder={t('drawer.descriptionPlaceholder')} />
                  <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder={t('drawer.goalPlaceholder')} />
                  <Textarea value={ac} onChange={(e) => setAc(e.target.value)} rows={3} placeholder={t('drawer.acPlaceholder')} />
                  <Textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} rows={2} placeholder={t('drawer.constraintsPlaceholder')} />
                  <Button
                    size="sm"
                    onClick={() => {
                      patch({ description: desc, acceptanceCriteria: ac, goal, constraints })
                      setEditingDesc(false)
                    }}
                  >
                    {t('common.save')}
                  </Button>
                </div>
              ) : (
                <div className="mt-1 space-y-2">
                  <div
                    className="prose prose-sm max-w-none rounded-md border bg-muted/30 p-3 text-sm"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(desc || `_${t('drawer.noDescription')}_`) }}
                  />
                  {goal.trim() && (
                    <SpecField label={t('drawer.goal')} body={goal} />
                  )}
                  {ac.trim() && <AcceptanceCriteria />}
                  {constraints.trim() && (
                    <SpecField label={t('drawer.constraints')} body={constraints} />
                  )}
                </div>
              )}
            </div>

            {/* Comments / Activity */}
            <Tabs defaultValue="comments" className="mt-6">
              <TabsList>
                <TabsTrigger value="comments">{t('drawer.comments')}</TabsTrigger>
                <TabsTrigger value="activity">{t('drawer.activity')}</TabsTrigger>
                <TabsTrigger value="story">{t('drawer.story')}</TabsTrigger>
              </TabsList>

              <TabsContent value="comments" className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      placeholder={t('drawer.commentPlaceholder')}
                    />
                    {slashCandidates.length > 0 && (
                      <div className="absolute bottom-full left-0 z-10 mb-1 w-72 overflow-hidden rounded-md border bg-popover p-1 shadow-md">
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('drawer.slashCommands')}
                        </div>
                        {slashCandidates.map((c) => (
                          <button
                            key={c.cmd}
                            type="button"
                            onClick={() => setComment(`/${c.cmd} `)}
                            className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                          >
                            <span className="font-mono text-sm text-foreground">/{c.cmd}</span>
                            <span className="truncate text-xs text-muted-foreground">{c.args}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {mentionCandidates.length > 0 && (
                      <div className="absolute left-0 top-full z-10 mt-1 w-72 overflow-hidden rounded-md border bg-popover p-1 shadow-md">
                        {mentionCandidates.map((m) => (
                          <button
                            key={m.userId}
                            type="button"
                            onClick={() => insertMention(m)}
                            className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-accent"
                          >
                            <span className="w-full truncate text-sm font-medium text-foreground">{m.name}</span>
                            <span className="w-full truncate text-xs text-muted-foreground">{m.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button size="sm" onClick={submitComment} disabled={!comment.trim()}>
                    {t('common.send')}
                  </Button>
                </div>
                {comments.data?.comments.map((c) => (
                  <div key={c.id} className="group/comment rounded-md border p-3">
                    <div className="mb-1 text-xs font-medium text-foreground">
                      {c.author?.name ?? 'System'}{' '}
                      <span className="text-muted-foreground">
                        · <RelativeTime date={c.createdAt} />
                      </span>
                    </div>
                    <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: renderCommentBody(c.body) }} />
                    <CommentReactions c={c} />
                  </div>
                ))}
                {comments.data?.comments.length === 0 && <p className="text-sm text-muted-foreground">{t('drawer.noComments')}</p>}
              </TabsContent>

              <TabsContent value="activity" className="space-y-2">
                {activity.data?.activity.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{a.actor?.name ?? 'System'}</span>
                    <span>
                      {a.type.replace(/_/g, ' ').toLowerCase()}
                      {a.fromValue || a.toValue ? `: ${a.fromValue ?? '∅'} → ${a.toValue ?? '∅'}` : ''}
                    </span>
                    <span>· <RelativeTime date={a.createdAt} /></span>
                  </div>
                ))}
                {activity.data?.activity.length === 0 && <p className="text-sm text-muted-foreground">{t('drawer.noActivity')}</p>}
              </TabsContent>

              {/* C1 — interleaved story (comments + activity) */}
              <TabsContent value="story" className="space-y-2">
                {storyItems.map((item) =>
                  item.comment ? (
                    <div key={item.id} className="group/comment rounded-md border p-3">
                      <div className="mb-1 text-xs font-medium text-foreground">
                        {item.comment.author?.name ?? 'System'}{' '}
                        <span className="text-muted-foreground">
                          · <RelativeTime date={item.comment.createdAt} />
                        </span>
                      </div>
                      <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: renderCommentBody(item.comment.body) }} />
                      <CommentReactions c={item.comment} />
                    </div>
                  ) : (
                    <div key={item.id} className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{item.activity!.actor?.name ?? 'System'}</span>
                      <span>
                        {item.activity!.type.replace(/_/g, ' ').toLowerCase()}
                        {item.activity!.fromValue || item.activity!.toValue ? `: ${item.activity!.fromValue ?? '∅'} → ${item.activity!.toValue ?? '∅'}` : ''}
                      </span>
                      <span>· <RelativeTime date={item.activity!.createdAt} /></span>
                    </div>
                  ),
                )}
                {storyItems.length === 0 && <p className="text-sm text-muted-foreground">{t('drawer.noActivity')}</p>}
              </TabsContent>
            </Tabs>
                </div>
              </div>

              <div className="mt-8 border-t pt-4">
                <Button variant="destructive" size="sm" onClick={remove}>
                  {t('drawer.deleteTicket')}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

const EMPTY_VALUES: ExpandValues = { description: '', goal: '', ac: '', constraints: '' }

// 3.8.1 B4 — auto-fill per-field review. Generation already returned the full
// draft; this shows current-vs-proposed per field with accept toggles (empty
// fields pre-accepted, conflicts default to keep-current), streams the proposed
// text in for the same "typing" feel, and applies only on the user's confirm.
function AutoFillReview({
  current,
  draft,
  onApply,
  onDiscard,
}: {
  current: ExpandValues
  draft: AIExpandDraft
  onApply: (values: ExpandValues) => void
  onDiscard: () => void
}) {
  const { t } = useTranslation()
  const fields = useMemo(() => buildReviewFields(current, draft), [current, draft])
  const [accepted, setAccepted] = useState<Record<ExpandFieldKey, boolean>>(() => defaultAccepts(fields))
  const ref = useRef<HTMLDivElement>(null)
  // Focus the review block on arrival so keyboard users land on the decision.
  useEffect(() => ref.current?.focus(), [])

  // Stream the proposed values in sequentially (description → … ) for the same
  // typing feel as the draft preview; the full text is already in hand. Keyed on
  // `draft` only (which fields appear + their order is current-independent) so a
  // parent re-render mid-stream — e.g. a websocket ticket sync — can't restart it.
  const proposedTexts = useMemo(() => buildReviewFields(EMPTY_VALUES, draft).map((f) => f.proposed), [draft])
  const [shown, setShown] = useState<string[]>(() => (prefersReducedMotion() ? proposedTexts : proposedTexts.map(() => '')))
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(proposedTexts)
      return
    }
    setShown(proposedTexts.map(() => ''))
    const total = countSegments(proposedTexts)
    let n = 0
    const id = setInterval(() => {
      n += 6
      setShown(sliceSequential(proposedTexts, n))
      if (n >= total) clearInterval(id)
    }, 40)
    return () => clearInterval(id)
  }, [proposedTexts])

  if (fields.length === 0) {
    return (
      <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        <p>{t('ai.review.empty')}</p>
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          {t('common.close')}
        </Button>
      </div>
    )
  }

  const allAccepted = fields.every((f) => accepted[f.key])

  return (
    <div ref={ref} tabIndex={-1} className="space-y-3 rounded-md border bg-muted/30 p-3 outline-none">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ai.review.title')}</p>
        <button
          type="button"
          onClick={() => setAccepted(setAllAccepts(fields, !allAccepted))}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          {allAccepted ? t('ai.review.keepAll') : t('ai.review.acceptAll')}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {t('ai.review.ready')}
      </span>
      {fields.map((f, i) => (
        <div key={f.key} className="space-y-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={accepted[f.key]}
              onChange={() => setAccepted((a) => ({ ...a, [f.key]: !a[f.key] }))}
              className={cn('mt-px', f.conflict ? 'accent-destructive' : 'accent-primary')}
            />
            <span className="text-xs font-medium text-foreground">{t(f.labelKey)}</span>
            {f.conflict && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                {t('ai.review.overwrite')}
              </span>
            )}
          </label>
          {f.conflict && (
            <div className="rounded border bg-background/60 p-2 text-xs text-muted-foreground">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground/70">{t('ai.review.current')}</span>
              <span className="whitespace-pre-wrap">{f.current}</span>
            </div>
          )}
          <div
            className={cn(
              'rounded border p-2 text-xs whitespace-pre-wrap',
              accepted[f.key] ? 'border-primary/40 bg-primary/5 text-foreground' : 'bg-background/60 text-muted-foreground',
            )}
          >
            <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground/70">{t('ai.review.proposed')}</span>
            {shown[i]}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={() => onApply(composeAccepted(current, draft, accepted))}>
          {t('ai.review.apply')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          {t('ai.discard')}
        </Button>
      </div>
    </div>
  )
}
