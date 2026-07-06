import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { api, type TicketRef, type Workstream } from '@/lib/api'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

// Relationships panel for the ticket drawer: parent, subtasks, blocked-by and
// blocks. All edits go through the 3.1 endpoints; every mutation refreshes the
// relations query plus the ticket lists (so board/list blocked badges update).
interface Props {
  ticketId: string
  projectId: string
  /** R9: new subtasks inherit the parent's workstream. */
  parentWorkstream?: Workstream
}

const DONE = new Set(['DONE', 'CANCELLED'])

export function RelationsSection({ ticketId, projectId, parentWorkstream }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { slug = '', projectSlug = '' } = useParams()
  const location = useLocation()
  const { pathname } = location
  const [newSubtask, setNewSubtask] = useState('')
  const subtaskInputRef = useRef<HTMLInputElement>(null)

  const rel = useQuery({ queryKey: ['relations', ticketId], queryFn: () => api.getRelations(ticketId) })
  const candidates = useQuery({
    queryKey: ['tickets', projectId, { sort: '-number', forRelations: true }],
    queryFn: () => api.listTickets(projectId, { sort: '-number' }),
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['relations'] })
    void qc.invalidateQueries({ queryKey: ['tickets', projectId] })
    void qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
  }
  const run = (p: Promise<unknown>) => p.then(refresh).catch((e) => toast.error((e as Error).message))

  // R9 — inline subtask create: fast Enter-Enter batch entry without leaving the drawer.
  const createSubtask = async () => {
    const title = newSubtask.trim()
    if (!title) return
    try {
      await api.createTicket({ projectId, title, parentId: ticketId, workstream: parentWorkstream })
      setNewSubtask('')
      refresh()
      toast.success(t('relations.subtaskCreated'))
      subtaskInputRef.current?.focus()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // Card "+ subtask" affordance deep-links here with focusSubtask state.
  const relLoaded = Boolean(rel.data)
  useEffect(() => {
    if (relLoaded && (location.state as { focusSubtask?: boolean } | null)?.focusSubtask) subtaskInputRef.current?.focus()
  }, [relLoaded, location.state])

  // Stay in the current view (board vs list) when jumping to a related ticket.
  const base = `/orgs/${slug}/projects/${projectSlug}`
  const goTo = (ref: TicketRef) =>
    navigate(pathname.includes('/list') ? `${base}/list/ticket/${ref.number}` : `${base}/ticket/${ref.number}`)

  const relations = rel.data?.relations
  const linkedIds = new Set<string>([
    ticketId,
    ...(relations ? [...relations.subtasks, ...relations.blockedBy, ...relations.blocks].map((r) => r.id) : []),
    ...(relations?.parent ? [relations.parent.id] : []),
  ])

  const refBadge = (r: TicketRef, onRemove: () => void) => (
    <Badge key={r.id} variant="secondary" className="max-w-full gap-1">
      <button onClick={() => goTo(r)} className={cn('truncate hover:underline', DONE.has(r.status) && 'line-through opacity-60')}>
        <span className="font-mono text-[10px]">{r.key}</span> {r.title}
      </button>
      <button onClick={onRemove} aria-label={t('common.remove')}>
        <X className="h-3 w-3" />
      </button>
    </Badge>
  )

  const AddPicker = ({ onPick, label }: { onPick: (ref: TicketRef) => void; label: string }) => {
    const [filter, setFilter] = useState('')
    const options = (candidates.data?.items ?? [])
      .filter((c) => !linkedIds.has(c.id))
      .filter((c) => !filter || c.title.toLowerCase().includes(filter.toLowerCase()) || c.key.toLowerCase().includes(filter.toLowerCase()))
      .slice(0, 15)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">+ {label}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          <div className="p-1">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('relations.searchTickets')}
              className="h-7 text-xs"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="scrollbar-slim max-h-56 overflow-y-auto">
            {options.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => onPick(c)}>
                <span className="mr-2 font-mono text-[10px] text-muted-foreground">{c.key}</span>
                <span className="truncate">{c.title}</span>
              </DropdownMenuItem>
            ))}
            {options.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('relations.noMatches')}</p>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (!relations) return null

  return (
    <div className="mt-4 space-y-3">
      <div>
        <Label>{t('relations.parent')}</Label>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {relations.parent ? (
            refBadge(relations.parent, () => run(api.updateTicket(ticketId, { parentId: null })))
          ) : (
            <AddPicker label={t('relations.setParent')} onPick={(c) => run(api.updateTicket(ticketId, { parentId: c.id }))} />
          )}
        </div>
      </div>

      <div>
        <Label>
          {t('relations.subtasks')}
          {relations.subtasks.length > 0 && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({relations.subtasks.filter((s) => DONE.has(s.status)).length}/{relations.subtasks.length})
            </span>
          )}
        </Label>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {relations.subtasks.map((s) => refBadge(s, () => run(api.updateTicket(s.id, { parentId: null }))))}
          <AddPicker label={t('relations.linkExisting')} onPick={(c) => run(api.updateTicket(c.id, { parentId: ticketId }))} />
        </div>
        <Input
          ref={subtaskInputRef}
          value={newSubtask}
          onChange={(e) => setNewSubtask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void createSubtask()
            }
          }}
          placeholder={t('relations.newSubtaskPlaceholder')}
          className="mt-1.5 h-8 text-sm"
        />
      </div>

      <div>
        <Label>{t('relations.blockedBy')}</Label>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {relations.blockedBy.map((b) => refBadge(b, () => run(api.removeDependency(ticketId, b.id))))}
          <AddPicker label={t('common.add')} onPick={(c) => run(api.addDependency(ticketId, c.id))} />
        </div>
      </div>

      <div>
        <Label>{t('relations.blocks')}</Label>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {relations.blocks.map((b) => refBadge(b, () => run(api.removeDependency(b.id, ticketId))))}
          <AddPicker label={t('common.add')} onPick={(c) => run(api.addDependency(c.id, ticketId))} />
        </div>
      </div>
    </div>
  )
}
