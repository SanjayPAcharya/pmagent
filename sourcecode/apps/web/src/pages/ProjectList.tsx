import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowUp, ArrowDown, Columns3, Inbox, Filter } from 'lucide-react'
import { BlockedBadge } from '@/components/BlockedBadge'
import { EmptyState } from '@/components/EmptyState'
import { api, type Ticket, type TicketType } from '../lib/api'
import { MultiSelect } from '../components/MultiSelect'
import { ALL_STATUSES, PRIORITIES, PRIORITY_CLASS, STATUS_LABEL } from '../lib/board'
import { cn } from '../lib/utils'
import { formatRelative } from '../lib/time'
import { useLocalStorageState } from '../lib/useLocalStorage'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Skeleton } from '../components/ui/skeleton'
import { TicketDrawer } from '../components/TicketDrawer'
import ViewToggle from '../components/ViewToggle'
import { BulkBar } from '../components/BulkBar'
import { CsvTools } from '../components/CsvTools'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { useProjectSync } from '../lib/websocket'

const TYPES: TicketType[] = ['FEATURE', 'BUG', 'CHORE', 'SPIKE']
// Columns whose header toggles a server-side sort (field ↔ -field).
const SORTABLE: Record<string, string> = { key: 'number', priority: 'priority', updated: 'updatedAt' }

// 3.7 R13 — list columns. Select/Key/Title are always on; the rest are chooser-
// toggleable. Fixed canonical order; each has a default width (px, resizable).
type ColId = 'select' | 'key' | 'title' | 'status' | 'priority' | 'assignee' | 'sprint' | 'workstream' | 'start' | 'due' | 'points' | 'updated'
const COL_ORDER: ColId[] = ['select', 'key', 'title', 'status', 'priority', 'assignee', 'sprint', 'workstream', 'start', 'due', 'points', 'updated']
const ALWAYS: ColId[] = ['select', 'key', 'title']
const TOGGLEABLE: ColId[] = ['status', 'priority', 'assignee', 'sprint', 'workstream', 'start', 'due', 'points', 'updated']
const DEFAULT_VISIBLE: Record<string, boolean> = { status: true, priority: true, assignee: true, sprint: true, workstream: true, start: false, due: false, points: true, updated: true }
const DEFAULT_WIDTHS: Record<ColId, number> = { select: 40, key: 92, title: 340, status: 120, priority: 104, assignee: 168, sprint: 148, workstream: 124, start: 116, due: 116, points: 60, updated: 116 }
const COL_LABEL: Record<ColId, string> = {
  select: '', key: 'list.colKey', title: 'list.colTitle', status: 'list.colStatus', priority: 'list.colPriority',
  assignee: 'list.colAssignee', sprint: 'list.colSprint', workstream: 'list.colWorkstream',
  start: 'list.colStart', due: 'list.colDue', points: 'list.colPoints', updated: 'list.colUpdated',
}

export default function ProjectList() {
  const { slug = '', projectSlug = '', number } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()

  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const orgId = org.data?.org.id
  const projects = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.listProjects(orgId!),
    enabled: Boolean(orgId),
  })
  const project = projects.data?.projects.find((p) => p.slug === projectSlug)
  const projectId = project?.id
  const members = useQuery({
    queryKey: ['members', slug],
    queryFn: () => api.listMembers(slug),
    enabled: Boolean(slug),
  })
  const sprints = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => api.listSprints(projectId!),
    enabled: Boolean(projectId),
  })
  const labels = useQuery({
    queryKey: ['labels', orgId],
    queryFn: () => api.listLabels(orgId!),
    enabled: Boolean(orgId),
  })
  // 3.7 R3 — live sync: refetch tickets on any project change.
  useProjectSync(projectId, [['tickets', projectId]])

  // ── Filters (mirrors Board's A4 bar, plus status + label) ──
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [status, setStatus] = useState<string[]>([])
  const [priority, setPriority] = useState<string[]>([])
  const [type, setType] = useState<string[]>([])
  const [assignedToId, setAssignedToId] = useState<string[]>([])
  const [sprintFilter, setSprintFilter] = useState<string[]>([])
  const [labelFilter, setLabelFilter] = useState<string[]>([])
  const [workstreamFilter, setWorkstreamFilter] = useState<string[]>([])
  const [sort, setSort] = useState('-updatedAt')
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 300)
    return () => clearTimeout(id)
  }, [q])
  const hasFilters = Boolean(
    qDebounced || status.length || priority.length || type.length || assignedToId.length || sprintFilter.length || labelFilter.length || workstreamFilter.length,
  )
  const clearFilters = () => {
    setQ(''); setQDebounced(''); setStatus([]); setPriority([]); setType([])
    setAssignedToId([]); setSprintFilter([]); setLabelFilter([]); setWorkstreamFilter([])
  }

  const params = useMemo(() => {
    const p: Record<string, string> = { sort }
    if (qDebounced) p.q = qDebounced
    if (status.length) p.status = status.join(',')
    if (priority.length) p.priority = priority.join(',')
    if (type.length) p.type = type.join(',')
    if (assignedToId.length) p.assignedToId = assignedToId.join(',')
    if (sprintFilter.length) p.sprintId = sprintFilter.join(',')
    if (labelFilter.length) p.labelId = labelFilter.join(',')
    if (workstreamFilter.length) p.workstream = workstreamFilter.join(',')
    return p
  }, [sort, qDebounced, status, priority, type, assignedToId, sprintFilter, labelFilter, workstreamFilter])

  const ticketsKey = ['tickets', projectId, params] as const
  const tickets = useQuery({
    queryKey: ticketsKey,
    queryFn: () => api.listTickets(projectId!, params),
    enabled: Boolean(projectId),
  })

  const toggleSort = (col: keyof typeof SORTABLE) => {
    const field = SORTABLE[col]
    setSort((s) => (s === field ? `-${field}` : field))
  }
  const sortIcon = (col: keyof typeof SORTABLE) => {
    const field = SORTABLE[col]
    if (sort === field) return <ArrowUp className="ml-1 inline h-3 w-3" />
    if (sort === `-${field}`) return <ArrowDown className="ml-1 inline h-3 w-3" />
    return null
  }

  // 3.1 bulk — multi-select; cleared when project or filters change the visible set.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  useEffect(() => setSelectedIds(new Set()), [projectId])
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const visibleIds = tickets.data?.items.map((tk) => tk.id) ?? []
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(visibleIds))

  const drawerTicket = number ? tickets.data?.items.find((tk) => tk.number === Number(number)) : undefined
  const base = `/orgs/${slug}/projects/${projectSlug}`
  const closeDrawer = () => navigate(`${base}/list`)

  const th = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground'

  // R13 — column visibility + resizable widths, both persisted.
  const [colVisible, setColVisible] = useLocalStorageState<Record<string, boolean>>('agentpm-list-columns', DEFAULT_VISIBLE)
  const [colWidths, setColWidths] = useLocalStorageState<Record<ColId, number>>('agentpm-list-colwidths', DEFAULT_WIDTHS)
  const shownCols = COL_ORDER.filter((c) => ALWAYS.includes(c) || colVisible[c])
  const widthOf = (c: ColId) => colWidths[c] ?? DEFAULT_WIDTHS[c]
  const tableWidth = shownCols.reduce((s, c) => s + widthOf(c), 0)

  const resizing = useRef<{ col: ColId; startX: number; startW: number } | null>(null)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = resizing.current
      if (!r) return
      setColWidths((w) => ({ ...w, [r.col]: Math.max(48, r.startW + (e.clientX - r.startX)) }))
    }
    const onUp = () => (resizing.current = null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [setColWidths])
  const startResize = (col: ColId) => (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    resizing.current = { col, startX: e.clientX, startW: widthOf(col) }
  }

  // Header + cell renderers keyed by column id (Key/Title always shown).
  const renderHeader = (c: ColId) => {
    if (c === 'select')
      return (
        <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t('bulk.selectAll')} className="h-4 w-4 cursor-pointer rounded border-input accent-primary" />
      )
    const sortKey = c === 'key' ? 'key' : c === 'priority' ? 'priority' : c === 'updated' ? 'updated' : null
    const label = t(COL_LABEL[c])
    if (sortKey) return (<span className="inline-flex cursor-pointer select-none items-center hover:text-foreground" onClick={() => toggleSort(sortKey)}>{label}{sortIcon(sortKey)}</span>)
    return label
  }
  const renderCell = (c: ColId, tk: Ticket) => {
    switch (c) {
      case 'select':
        return <input type="checkbox" checked={selectedIds.has(tk.id)} onChange={() => toggleSelect(tk.id)} aria-label={t('bulk.selectTicket', { key: tk.key })} className="h-4 w-4 cursor-pointer rounded border-input accent-primary" />
      case 'key':
        return <span className="font-mono text-xs text-muted-foreground">{tk.key}</span>
      case 'title':
        return (
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">{tk.title}</span>
            {(tk.blockedBy ?? 0) > 0 && <BlockedBadge />}
            {tk.labels.slice(0, 3).map((l) => (
              <span key={l.id} className="hidden shrink-0 rounded-full px-1.5 py-0.5 text-[11px] sm:inline" style={{ backgroundColor: `${l.color}22`, color: l.color }}>{l.name}</span>
            ))}
            {/* U3 — never hide labels silently: a +N chip reveals the rest on hover. */}
            {tk.labels.length > 3 && (
              <span
                className="hidden shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline"
                title={tk.labels.slice(3).map((l) => l.name).join(', ')}
              >
                +{tk.labels.length - 3}
              </span>
            )}
          </div>
        )
      case 'status':
        return <span className="text-muted-foreground">{STATUS_LABEL[tk.status]}</span>
      case 'priority':
        return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', PRIORITY_CLASS[tk.priority])}>{tk.priority}</span>
      case 'assignee':
        return tk.assignedTo ? (
          <span className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              {tk.assignedTo.avatarUrl && <AvatarImage src={tk.assignedTo.avatarUrl} />}
              <AvatarFallback className="text-[10px]">{tk.assignedTo.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="truncate text-xs text-muted-foreground">{tk.assignedTo.name}</span>
          </span>
        ) : (<span className="text-xs text-muted-foreground">—</span>)
      case 'sprint':
        return <span className="text-xs text-muted-foreground">{sprints.data?.sprints.find((s) => s.id === tk.sprintId)?.name ?? '—'}</span>
      case 'workstream':
        return <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{tk.workstream === 'ADHOC' ? t('drawer.workstreamAdhoc') : t('drawer.workstreamSprint')}</span>
      case 'start':
        return <span className="text-xs text-muted-foreground">{tk.startDate?.slice(0, 10) ?? '—'}</span>
      case 'due':
        return <span className="text-xs text-muted-foreground">{tk.dueDate?.slice(0, 10) ?? '—'}</span>
      case 'points':
        return <span className="text-xs text-muted-foreground">{tk.storyPoints ?? '—'}</span>
      case 'updated':
        return <span className="text-xs text-muted-foreground">{formatRelative(tk.updatedAt)}</span>
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link to={`/orgs/${slug}`} className="text-sm text-muted-foreground hover:underline">
            ← {org.data?.org.name ?? slug}
          </Link>
          <h2 className="text-xl font-semibold text-foreground">{project?.name ?? projectSlug}</h2>
        </div>
        <div className="flex items-center gap-4">
          <ViewToggle slug={slug} projectSlug={projectSlug} active="list" />
          <Link to={`${base}/sprints`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            {t('board.sprints')}
          </Link>
          <Link to={`${base}/archived`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            {t('archived.link')}
          </Link>
        </div>
      </div>

      {/* filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('board.search')}
          className="h-8 w-48 rounded-md border border-input bg-transparent px-2 text-sm"
        />
        <MultiSelect
          placeholder={t('list.allStatuses')}
          selected={status}
          onChange={setStatus}
          options={ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />
        <MultiSelect
          placeholder={t('board.priorityAny')}
          selected={priority}
          onChange={setPriority}
          options={PRIORITIES.map((p) => ({ value: p, label: p }))}
        />
        <MultiSelect
          placeholder={t('board.typeAny')}
          selected={type}
          onChange={setType}
          options={TYPES.map((tp) => ({ value: tp, label: tp }))}
        />
        <MultiSelect
          placeholder={t('board.assigneeAny')}
          selected={assignedToId}
          onChange={setAssignedToId}
          options={(members.data?.members ?? []).map((m) => ({ value: m.userId, label: m.name }))}
        />
        <MultiSelect
          placeholder={t('board.sprintAny')}
          selected={sprintFilter}
          onChange={setSprintFilter}
          options={(sprints.data?.sprints ?? []).map((s) => ({ value: s.id, label: s.name }))}
        />
        <MultiSelect
          placeholder={t('list.allLabels')}
          selected={labelFilter}
          onChange={setLabelFilter}
          options={(labels.data?.labels ?? []).map((l) => ({ value: l.id, label: l.name }))}
        />
        <MultiSelect
          placeholder={t('gantt.allWorkstreams')}
          selected={workstreamFilter}
          onChange={setWorkstreamFilter}
          options={[
            { value: 'SPRINT', label: t('drawer.workstreamSprint') },
            { value: 'ADHOC', label: t('drawer.workstreamAdhoc') },
          ]}
        />
        {hasFilters && (
          <button onClick={clearFilters} className="text-sm text-muted-foreground hover:text-foreground">
            {t('board.clearFilters')}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2 text-sm text-muted-foreground hover:text-foreground" title={t('list.columns')}>
              <Columns3 className="h-4 w-4" />
              <span className="hidden sm:inline">{t('list.columns')}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('list.columns')}</DropdownMenuLabel>
            {TOGGLEABLE.map((c) => (
              <DropdownMenuCheckboxItem
                key={c}
                checked={colVisible[c] ?? false}
                onCheckedChange={() => setColVisible((v) => ({ ...v, [c]: !v[c] }))}
                onSelect={(e) => e.preventDefault()}
              >
                {t(COL_LABEL[c])}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Note: CSV export always includes ALL columns regardless of what's shown here. */}
        {projectId && project && (
          <CsvTools
            projectId={projectId}
            projectKey={project.key}
            items={tickets.data?.items ?? []}
            sprints={sprints.data?.sprints ?? []}
          />
        )}
      </div>

      {tickets.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {t('board.loadError', { message: (tickets.error as Error).message })}
        </div>
      ) : (
        <div className="scrollbar-slim overflow-x-auto rounded-lg border bg-card">
          <table className="table-fixed text-sm" style={{ width: tableWidth }}>
            <colgroup>
              {shownCols.map((c) => <col key={c} style={{ width: widthOf(c) }} />)}
            </colgroup>
            <thead className="border-b bg-muted/40">
              <tr>
                {shownCols.map((c) => (
                  <th key={c} className={cn(th, 'relative', c === 'points' && 'text-right')}>
                    {renderHeader(c)}
                    {/* drag the right edge to resize (Key/Title/etc.) */}
                    <span
                      onPointerDown={startResize(c)}
                      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize select-none hover:bg-primary/30"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!tickets.data
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {shownCols.map((c) => (
                        <td key={c} className="px-3 py-3"><Skeleton className="h-4 w-full max-w-24" /></td>
                      ))}
                    </tr>
                  ))
                : tickets.data.items.map((tk) => (
                    <tr
                      key={tk.id}
                      onClick={() => navigate(`${base}/list/ticket/${tk.number}`)}
                      className={cn('cursor-pointer hover:bg-accent', selectedIds.has(tk.id) && 'bg-accent/60')}
                    >
                      {shownCols.map((c) => (
                        <td
                          key={c}
                          onClick={c === 'select' ? (e) => e.stopPropagation() : undefined}
                          className={cn('overflow-hidden px-3 py-2', c !== 'title' && 'whitespace-nowrap', c === 'points' && 'text-right')}
                        >
                          {renderCell(c, tk)}
                        </td>
                      ))}
                    </tr>
                  ))}
              {tickets.data && tickets.data.items.length === 0 && (
                <tr>
                  <td colSpan={shownCols.length} className="px-3 py-8">
                    <EmptyState
                      icon={hasFilters ? Filter : Inbox}
                      message={hasFilters ? t('list.emptyFiltered') : t('list.empty')}
                      className="border-0 bg-transparent py-6"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {drawerTicket && orgId && (
        <TicketDrawer
          ticketId={drawerTicket.id}
          orgId={orgId}
          members={members.data?.members ?? []}
          onClose={closeDrawer}
          onChanged={() => qc.invalidateQueries({ queryKey: ['tickets', projectId] })}
        />
      )}

      {selectedIds.size > 0 && projectId && (
        <BulkBar
          selectedIds={[...selectedIds]}
          projectId={projectId}
          members={members.data?.members ?? []}
          sprints={sprints.data?.sprints ?? []}
          labels={labels.data?.labels ?? []}
          onClear={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  )
}
