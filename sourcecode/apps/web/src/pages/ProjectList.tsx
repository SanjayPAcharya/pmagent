import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Ban, ArrowUp, ArrowDown } from 'lucide-react'
import { api, type Priority, type TicketStatus, type TicketType } from '../lib/api'
import { ALL_STATUSES, PRIORITIES, PRIORITY_CLASS, STATUS_LABEL } from '../lib/board'
import { cn } from '../lib/utils'
import { formatRelative } from '../lib/time'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Skeleton } from '../components/ui/skeleton'
import { TicketDrawer } from '../components/TicketDrawer'
import ViewToggle from '../components/ViewToggle'
import { BulkBar } from '../components/BulkBar'
import { CsvTools } from '../components/CsvTools'

const TYPES: TicketType[] = ['FEATURE', 'BUG', 'CHORE', 'SPIKE']
// Columns whose header toggles a server-side sort (field ↔ -field).
const SORTABLE: Record<string, string> = { key: 'number', priority: 'priority', updated: 'updatedAt' }

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

  // ── Filters (mirrors Board's A4 bar, plus status + label) ──
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [type, setType] = useState<TicketType | ''>('')
  const [assignedToId, setAssignedToId] = useState('')
  const [sprintFilter, setSprintFilter] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [sort, setSort] = useState('-updatedAt')
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 300)
    return () => clearTimeout(id)
  }, [q])
  const hasFilters = Boolean(qDebounced || status || priority || type || assignedToId || sprintFilter || labelFilter)
  const clearFilters = () => {
    setQ(''); setQDebounced(''); setStatus(''); setPriority(''); setType('')
    setAssignedToId(''); setSprintFilter(''); setLabelFilter('')
  }

  const params = useMemo(() => {
    const p: Record<string, string> = { sort }
    if (qDebounced) p.q = qDebounced
    if (status) p.status = status
    if (priority) p.priority = priority
    if (type) p.type = type
    if (assignedToId) p.assignedToId = assignedToId
    if (sprintFilter) p.sprintId = sprintFilter
    if (labelFilter) p.labelId = labelFilter
    return p
  }, [sort, qDebounced, status, priority, type, assignedToId, sprintFilter, labelFilter])

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
  const sortableTh = cn(th, 'cursor-pointer select-none hover:text-foreground')

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
        <select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus | '')} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">{t('list.allStatuses')}</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">{t('board.priorityAny')}</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as TicketType | '')} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">{t('board.typeAny')}</option>
          {TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
        </select>
        <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">{t('board.assigneeAny')}</option>
          {members.data?.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
        </select>
        <select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">{t('board.sprintAny')}</option>
          {sprints.data?.sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="">{t('list.allLabels')}</option>
          {labels.data?.labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="text-sm text-muted-foreground hover:text-foreground">
            {t('board.clearFilters')}
          </button>
        )}
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
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label={t('bulk.selectAll')}
                    className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                  />
                </th>
                <th className={sortableTh} onClick={() => toggleSort('key')}>{t('list.colKey')}{sortIcon('key')}</th>
                <th className={th}>{t('list.colTitle')}</th>
                <th className={th}>{t('list.colStatus')}</th>
                <th className={sortableTh} onClick={() => toggleSort('priority')}>{t('list.colPriority')}{sortIcon('priority')}</th>
                <th className={th}>{t('list.colAssignee')}</th>
                <th className={th}>{t('list.colSprint')}</th>
                <th className={cn(th, 'text-right')}>{t('list.colPoints')}</th>
                <th className={sortableTh} onClick={() => toggleSort('updated')}>{t('list.colUpdated')}{sortIcon('updated')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!tickets.data
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full max-w-24" /></td>
                      ))}
                    </tr>
                  ))
                : tickets.data.items.map((tk) => (
                    <tr
                      key={tk.id}
                      onClick={() => navigate(`${base}/list/ticket/${tk.number}`)}
                      className={cn('cursor-pointer hover:bg-accent', selectedIds.has(tk.id) && 'bg-accent/60')}
                    >
                      <td className="w-8 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(tk.id)}
                          onChange={() => toggleSelect(tk.id)}
                          aria-label={t('bulk.selectTicket', { key: tk.key })}
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{tk.key}</td>
                      <td className="max-w-[360px] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-foreground">{tk.title}</span>
                          {(tk.blockedBy ?? 0) > 0 && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                              <Ban className="h-3 w-3" />
                              {t('list.blocked')}
                            </span>
                          )}
                          {tk.labels.slice(0, 3).map((l) => (
                            <span key={l.id} className="hidden shrink-0 rounded-full px-1.5 py-0.5 text-[11px] sm:inline" style={{ backgroundColor: `${l.color}22`, color: l.color }}>
                              {l.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{STATUS_LABEL[tk.status]}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', PRIORITY_CLASS[tk.priority])}>{tk.priority}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {tk.assignedTo ? (
                          <span className="flex items-center gap-1.5">
                            <Avatar className="h-5 w-5">
                              {tk.assignedTo.avatarUrl && <AvatarImage src={tk.assignedTo.avatarUrl} />}
                              <AvatarFallback className="text-[10px]">{tk.assignedTo.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="hidden text-xs text-muted-foreground md:inline">{tk.assignedTo.name}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {sprints.data?.sprints.find((s) => s.id === tk.sprintId)?.name ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-muted-foreground">{tk.storyPoints ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{formatRelative(tk.updatedAt)}</td>
                    </tr>
                  ))}
              {tickets.data && tickets.data.items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {hasFilters ? t('list.emptyFiltered') : t('list.empty')}
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
