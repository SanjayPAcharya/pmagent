import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ChevronDown, X } from 'lucide-react'
import { api, type Member, type Priority, type Ticket, type TicketStatus, type UpdateTicketInput } from '@/lib/api'
import { ALL_STATUSES, PRIORITIES, PRIORITY_CLASS, STATUS_LABEL } from '@/lib/board'
import { renderMarkdown } from '@/lib/markdown'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ReadinessRing, ticketReadiness } from '@/components/ReadinessRing'
import { RelativeTime } from '@/components/RelativeTime'
import { fireConfetti } from '@/lib/confetti'
import { cn } from '@/lib/utils'

// C3 — slash command palette shown when the comment box starts with "/".
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
  onClose: () => void
  onChanged: () => void
}

export function TicketDrawer({ ticketId, orgId, members, onClose, onChanged }: Props) {
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
  // Mentions inserted via the picker: the editor shows "@Display Name", and we
  // remember name→userId so we can convert to the server token "@[uuid]" on send.
  const [mentions, setMentions] = useState<{ label: string; userId: string }[]>([])

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
  const renderCommentBody = (body: string) =>
    renderMarkdown(body.replace(/@\[([0-9a-f-]{36})\]/gi, (_m, id) => '@' + (members.find((x) => x.userId === id)?.name ?? 'user')))

  const SpecField = ({ label, body }: { label: string; body: string }) => (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
    </div>
  )

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
      <SheetContent className="w-full sm:max-w-xl">
        {!ticket ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">{ticket.key}</div>
              <SheetTitle>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => title.trim() && title !== ticket.title && patch({ title: title.trim() })}
                  className="border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                />
              </SheetTitle>
            </SheetHeader>

            <div className="mt-4 flex flex-wrap items-center gap-2">
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
            </div>

            {/* Metadata grid */}
            <div className="mt-4 grid grid-cols-2 gap-4">
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
                <Label>{t('drawer.dueDate')}</Label>
                <Input
                  type="date"
                  defaultValue={ticket.dueDate ? ticket.dueDate.slice(0, 10) : ''}
                  onBlur={(e) => {
                    const v = e.target.value ? new Date(e.target.value).toISOString() : null
                    patch({ dueDate: v })
                  }}
                  className="mt-1"
                />
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
            </div>

            {/* Watchers */}
            <div className="mt-4">
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

            {/* Spec — description + the agent-ready fields (goal/AC/constraints).
                The readiness ring (A1) reflects how much of the spec is filled. */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>{t('drawer.spec')}</Label>
                  <ReadinessRing ticket={ticket} size={18} />
                  <span className="text-xs text-muted-foreground">
                    {t('readiness.label', { ...ticketReadiness(ticket) })}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditingDesc((v) => !v)}>
                  {editingDesc ? t('common.preview') : t('common.edit')}
                </Button>
              </div>
              {editingDesc ? (
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
                  {ac.trim() && (
                    <SpecField label={t('drawer.acceptanceCriteria')} body={ac} />
                  )}
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
                  <div key={c.id} className="rounded-md border p-3">
                    <div className="mb-1 text-xs font-medium text-foreground">
                      {c.author?.name ?? 'System'}{' '}
                      <span className="text-muted-foreground">
                        · <RelativeTime date={c.createdAt} />
                      </span>
                    </div>
                    <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: renderCommentBody(c.body) }} />
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
                    <div key={item.id} className="rounded-md border p-3">
                      <div className="mb-1 text-xs font-medium text-foreground">
                        {item.comment.author?.name ?? 'System'}{' '}
                        <span className="text-muted-foreground">
                          · <RelativeTime date={item.comment.createdAt} />
                        </span>
                      </div>
                      <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: renderCommentBody(item.comment.body) }} />
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

            <div className="mt-8 border-t pt-4">
              <Button variant="destructive" size="sm" onClick={remove}>
                {t('drawer.deleteTicket')}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
