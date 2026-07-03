import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Plus,
  Hash,
  FolderKanban,
  Building2,
  LayoutDashboard,
  ChevronLeft,
  CircleDot,
  UserPlus,
  Rocket,
  Tag,
  SunMoon,
  Clock,
  Search,
} from 'lucide-react'
import { api } from '@/lib/api'
import { ALL_STATUSES, STATUS_LABEL } from '@/lib/board'
import { useTheme } from '@/lib/theme'
import { getRecent } from '@/lib/frecency'
import { parseQuickCreate } from '@/lib/parseQuickCreate'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { ONBOARD_PALETTE_KEY } from '@/components/GettingStarted'

// Global ⌘K / Ctrl-K palette.
// D1: full action surface — when a ticket is open, change status / assign /
//     move to sprint / add label (via cmdk sub-pages); toggle theme anywhere.
// D2: recent (frecency) tickets + projects surfaced before you type.
// D3: natural quick-create — "Fix bug !high @sanjay #sprint2".
type Page = 'root' | 'status' | 'assign' | 'sprint' | 'label'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<Page>('root')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { cycle: cycleTheme } = useTheme()
  const location = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        localStorage.setItem(ONBOARD_PALETTE_KEY, '1')
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const reset = (o: boolean) => {
    setOpen(o)
    if (!o) {
      setQuery('')
      setPage('root')
    }
  }

  // Global search (3.1): debounce the root query and hit /api/search across orgs.
  const [searchDebounced, setSearchDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(page === 'root' ? query.trim() : ''), 250)
    return () => clearTimeout(id)
  }, [query, page])
  const globalHits = useQuery({
    queryKey: ['global-search', searchDebounced],
    queryFn: () => api.searchTickets(searchDebounced),
    enabled: open && page === 'root' && searchDebounced.length >= 2,
  })

  const m = location.pathname.match(/^\/orgs\/([^/]+)(?:\/projects\/([^/]+))?/)
  const slug = m?.[1]
  const projectSlug = m?.[2]
  const openNumber = location.pathname.match(/\/ticket\/(\d+)/)?.[1]

  const orgs = useQuery({ queryKey: ['orgs'], queryFn: api.listOrgs, enabled: open })
  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug!), enabled: open && Boolean(slug) })
  const orgId = org.data?.org.id
  const projects = useQuery({ queryKey: ['projects', orgId], queryFn: () => api.listProjects(orgId!), enabled: open && Boolean(orgId) })
  const projectId = projects.data?.projects.find((p) => p.slug === projectSlug)?.id
  const tickets = useQuery({
    queryKey: ['tickets', projectId, { sort: 'number' }],
    queryFn: () => api.listTickets(projectId!, { sort: '-number' }),
    enabled: open && Boolean(projectId),
  })
  const members = useQuery({ queryKey: ['members', slug], queryFn: () => api.listMembers(slug!), enabled: open && Boolean(slug) })
  const sprints = useQuery({ queryKey: ['sprints', projectId], queryFn: () => api.listSprints(projectId!), enabled: open && Boolean(projectId) })
  const labels = useQuery({ queryKey: ['labels', orgId], queryFn: () => api.listLabels(orgId!), enabled: open && Boolean(orgId) })

  const openTicket = openNumber ? tickets.data?.items.find((tk) => tk.number === Number(openNumber)) : undefined

  const go = (to: string) => {
    reset(false)
    navigate(to)
  }

  const goPage = (p: Page) => {
    setPage(p)
    setQuery('')
  }

  // D1 — mutate the currently-open ticket, then refresh + close.
  const patchOpen = async (input: Parameters<typeof api.updateTicket>[1], ok: string) => {
    if (!openTicket) return
    try {
      await api.updateTicket(openTicket.id, input)
      qc.invalidateQueries({ queryKey: ['tickets', projectId] })
      qc.invalidateQueries({ queryKey: ['ticket', openTicket.id] })
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    }
    reset(false)
  }

  // D3 — parse the query and create with the resolved fields.
  const parsed = parseQuickCreate(query, { members: members.data?.members ?? [], sprints: sprints.data?.sprints ?? [] })
  const createTicket = async () => {
    if (!projectId || !parsed.title) return
    try {
      const { ticket } = await api.createTicket({
        projectId,
        title: parsed.title,
        priority: parsed.priority,
        assignedToId: parsed.assignedToId,
        sprintId: parsed.sprintId,
      })
      qc.invalidateQueries({ queryKey: ['tickets', projectId] })
      toast.success(t('board.ticketCreated'))
      go(`/orgs/${slug}/projects/${projectSlug}/ticket/${ticket.number}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const recentTickets = open && page === 'root' && !query.trim() ? getRecent('ticket') : []

  // Backspace on an empty input steps back out of a sub-page.
  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && query === '' && page !== 'root') {
      e.preventDefault()
      goPage('root')
    }
  }

  const placeholder =
    page === 'status'
      ? t('palette.pickStatus')
      : page === 'assign'
        ? t('palette.pickAssignee')
        : page === 'sprint'
          ? t('palette.pickSprint')
          : page === 'label'
            ? t('palette.pickLabel')
            : t('palette.placeholder')

  const availableLabels = (labels.data?.labels ?? []).filter((l) => !(openTicket?.labels ?? []).some((x) => x.id === l.id))

  return (
    <CommandDialog open={open} onOpenChange={reset}>
      <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} onKeyDown={onInputKeyDown} />
      <CommandList>
        <CommandEmpty>{t('palette.noResults')}</CommandEmpty>

        {/* ── Sub-pages (D1) ── */}
        {page !== 'root' && (
          <CommandGroup>
            <CommandItem value="back" onSelect={() => goPage('root')}>
              <ChevronLeft className="h-4 w-4" />
              {t('common.back')}
            </CommandItem>
          </CommandGroup>
        )}

        {page === 'status' && openTicket && (
          <CommandGroup heading={t('palette.setStatus')}>
            {ALL_STATUSES.map((s) => (
              <CommandItem
                key={s}
                value={`status ${STATUS_LABEL[s]}`}
                disabled={s === openTicket.status}
                onSelect={() => patchOpen({ status: s }, t('drawer.saved'))}
              >
                <CircleDot className="h-4 w-4" />
                {STATUS_LABEL[s]}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {page === 'assign' && openTicket && (
          <CommandGroup heading={t('palette.assignTo')}>
            <CommandItem value="unassigned" onSelect={() => patchOpen({ assignedToId: null }, t('drawer.unassigned'))}>
              {t('drawer.unassigned')}
            </CommandItem>
            {members.data?.members.map((mem) => (
              <CommandItem key={mem.userId} value={`assign ${mem.name}`} onSelect={() => patchOpen({ assignedToId: mem.userId }, t('drawer.assigned'))}>
                {mem.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {page === 'sprint' && openTicket && (
          <CommandGroup heading={t('palette.moveToSprint')}>
            <CommandItem value="no sprint" onSelect={() => patchOpen({ sprintId: null }, t('drawer.removedFromSprint'))}>
              {t('drawer.noSprint')}
            </CommandItem>
            {sprints.data?.sprints.map((s) => (
              <CommandItem key={s.id} value={`sprint ${s.name}`} onSelect={() => patchOpen({ sprintId: s.id }, t('drawer.addedToSprint'))}>
                {s.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {page === 'label' && openTicket && (
          <CommandGroup heading={t('palette.addLabel')}>
            {availableLabels.length === 0 && <CommandItem disabled value="no labels">{t('palette.noLabels')}</CommandItem>}
            {availableLabels.map((l) => (
              <CommandItem
                key={l.id}
                value={`label ${l.name}`}
                onSelect={() => patchOpen({ labelIds: [...(openTicket.labels ?? []).map((x) => x.id), l.id] }, t('drawer.labelsUpdated'))}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                {l.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* ── Root ── */}
        {page === 'root' && (
          <>
            {projectId && query.trim() && parsed.title && (
              <CommandGroup heading={t('palette.actions')}>
                <CommandItem value={`create ${query}`} onSelect={createTicket}>
                  <Plus className="h-4 w-4" />
                  <span className="truncate">{t('palette.createTicket', { title: parsed.title })}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {parsed.priority && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{parsed.priority}</span>}
                    {parsed.assigneeName && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">@{parsed.assigneeName}</span>}
                    {parsed.sprintName && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">#{parsed.sprintName}</span>}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {openTicket && (
              <CommandGroup heading={t('palette.ticketActions', { key: openTicket.key })}>
                <CommandItem value="change status" onSelect={() => goPage('status')}>
                  <CircleDot className="h-4 w-4" />
                  {t('palette.changeStatus')}
                </CommandItem>
                <CommandItem value="assign" onSelect={() => goPage('assign')}>
                  <UserPlus className="h-4 w-4" />
                  {t('palette.assign')}
                </CommandItem>
                <CommandItem value="move to sprint" onSelect={() => goPage('sprint')}>
                  <Rocket className="h-4 w-4" />
                  {t('palette.moveSprint')}
                </CommandItem>
                <CommandItem value="add label" onSelect={() => goPage('label')}>
                  <Tag className="h-4 w-4" />
                  {t('palette.addLabelAction')}
                </CommandItem>
              </CommandGroup>
            )}

            {recentTickets.length > 0 && (
              <CommandGroup heading={t('palette.recent')}>
                {recentTickets.map((e) => (
                  <CommandItem key={e.key} value={`recent ${e.label} ${e.meta ?? ''}`} onSelect={() => go(e.href)}>
                    <Clock className="h-4 w-4" />
                    {e.meta && <span className="font-mono text-xs text-muted-foreground">{e.meta}</span>}
                    <span className="truncate">{e.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading={t('palette.general')}>
              <CommandItem value="toggle theme" onSelect={() => { cycleTheme(); reset(false) }}>
                <SunMoon className="h-4 w-4" />
                {t('palette.toggleTheme')}
              </CommandItem>
            </CommandGroup>

            {projectId && (tickets.data?.items.length ?? 0) > 0 && (
              <CommandGroup heading={t('palette.tickets')}>
                {tickets.data!.items.map((tk) => (
                  <CommandItem
                    key={tk.id}
                    value={`${tk.key} ${tk.title}`}
                    onSelect={() => go(`/orgs/${slug}/projects/${projectSlug}/ticket/${tk.number}`)}
                  >
                    <Hash className="h-4 w-4" />
                    <span className="font-mono text-xs text-muted-foreground">{tk.key}</span>
                    <span className="truncate">{tk.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {searchDebounced.length >= 2 && (globalHits.data?.items.length ?? 0) > 0 && (
              <CommandGroup heading={t('palette.everywhere')}>
                {globalHits.data!.items
                  .filter((hit) => !tickets.data?.items.some((tk) => tk.id === hit.id))
                  .slice(0, 8)
                  .map((hit) => (
                    <CommandItem
                      key={hit.id}
                      value={`global ${hit.key} ${hit.title}`}
                      onSelect={() => go(`/orgs/${hit.orgSlug}/projects/${hit.projectSlug}/ticket/${hit.number}`)}
                    >
                      <Search className="h-4 w-4" />
                      <span className="font-mono text-xs text-muted-foreground">{hit.key}</span>
                      <span className="truncate">{hit.title}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">{hit.projectSlug}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}

            {orgId && (projects.data?.projects.length ?? 0) > 0 && (
              <CommandGroup heading={t('palette.projects')}>
                {projects.data!.projects.map((p) => (
                  <CommandItem key={p.id} value={`project ${p.name}`} onSelect={() => go(`/orgs/${slug}/projects/${p.slug}`)}>
                    <FolderKanban className="h-4 w-4" />
                    {p.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading={t('palette.organizations')}>
              <CommandItem value="dashboard home" onSelect={() => go('/')}>
                <LayoutDashboard className="h-4 w-4" />
                {t('palette.dashboard')}
              </CommandItem>
              {orgs.data?.organizations.map((o) => (
                <CommandItem key={o.id} value={`org ${o.name}`} onSelect={() => go(`/orgs/${o.slug}`)}>
                  <Building2 className="h-4 w-4" />
                  {o.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
