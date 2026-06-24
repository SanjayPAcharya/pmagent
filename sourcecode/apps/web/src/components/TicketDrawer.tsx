import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, X } from 'lucide-react'
import { api, type Member, type Priority, type TicketStatus, type UpdateTicketInput } from '@/lib/api'
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
import { cn } from '@/lib/utils'

interface Props {
  ticketId: string
  members: Member[]
  onClose: () => void
  onChanged: () => void
}

export function TicketDrawer({ ticketId, members, onClose, onChanged }: Props) {
  const qc = useQueryClient()
  const ticketQ = useQuery({ queryKey: ['ticket', ticketId], queryFn: () => api.getTicket(ticketId) })
  const comments = useQuery({ queryKey: ['comments', ticketId], queryFn: () => api.listComments(ticketId) })
  const activity = useQuery({ queryKey: ['activity', ticketId], queryFn: () => api.listActivity(ticketId) })
  const ticket = ticketQ.data?.ticket

  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [ac, setAc] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (ticket) {
      setTitle(ticket.title)
      setDesc(ticket.description ?? '')
      setAc(ticket.acceptanceCriteria ?? '')
    }
  }, [ticket])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
    qc.invalidateQueries({ queryKey: ['activity', ticketId] })
    onChanged()
  }

  async function patch(input: UpdateTicketInput, ok = 'Saved') {
    try {
      await api.updateTicket(ticketId, input)
      refresh()
      toast.success(ok)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function submitComment() {
    const body = comment.trim()
    if (!body) return
    try {
      await api.addComment(ticketId, body)
      setComment('')
      qc.invalidateQueries({ queryKey: ['comments', ticketId] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const assignee = members.find((m) => m.userId === ticket?.assignedToId)
  const watchers = (ticket?.watcherIds ?? []).map((id) => members.find((m) => m.userId === id)).filter(Boolean) as Member[]
  const nonWatchers = members.filter((m) => !ticket?.watcherIds.includes(m.userId))

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl">
        {!ticket ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
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
                <Label>Assignee</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="mt-1 w-full justify-between">
                      {assignee?.name ?? 'Unassigned'} <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => patch({ assignedToId: null }, 'Unassigned')}>Unassigned</DropdownMenuItem>
                    {members.map((m) => (
                      <DropdownMenuItem key={m.userId} onClick={() => patch({ assignedToId: m.userId }, 'Assigned')}>
                        {m.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div>
                <Label>Story points</Label>
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
                <Label>Due date</Label>
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
            </div>

            {/* Watchers */}
            <div className="mt-4">
              <Label>Watchers / CC</Label>
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
                        + Add
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

            {/* Description */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <Label>Description</Label>
                <Button variant="ghost" size="sm" onClick={() => setEditingDesc((v) => !v)}>
                  {editingDesc ? 'Preview' : 'Edit'}
                </Button>
              </div>
              {editingDesc ? (
                <div className="mt-1 space-y-2">
                  <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={5} placeholder="Markdown supported…" />
                  <Textarea value={ac} onChange={(e) => setAc(e.target.value)} rows={3} placeholder="Acceptance criteria…" />
                  <Button
                    size="sm"
                    onClick={() => {
                      patch({ description: desc, acceptanceCriteria: ac })
                      setEditingDesc(false)
                    }}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div
                  className="prose prose-sm mt-1 max-w-none rounded-md border bg-muted/30 p-3 text-sm"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(desc || '_No description_') }}
                />
              )}
            </div>

            {/* Comments / Activity */}
            <Tabs defaultValue="comments" className="mt-6">
              <TabsList>
                <TabsTrigger value="comments">Comments</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="comments" className="space-y-3">
                <div className="flex gap-2">
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    placeholder="Add a comment… (@[userId] to mention)"
                  />
                  <Button size="sm" onClick={submitComment} disabled={!comment.trim()}>
                    Send
                  </Button>
                </div>
                {comments.data?.comments.map((c) => (
                  <div key={c.id} className="rounded-md border p-3">
                    <div className="mb-1 text-xs font-medium text-foreground">
                      {c.author?.name ?? 'System'} <span className="text-muted-foreground">· {new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.body) }} />
                  </div>
                ))}
                {comments.data?.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
              </TabsContent>

              <TabsContent value="activity" className="space-y-2">
                {activity.data?.activity.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{a.actor?.name ?? 'System'}</span>
                    <span>
                      {a.type.replace(/_/g, ' ').toLowerCase()}
                      {a.fromValue || a.toValue ? `: ${a.fromValue ?? '∅'} → ${a.toValue ?? '∅'}` : ''}
                    </span>
                    <span>· {new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                ))}
                {activity.data?.activity.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
