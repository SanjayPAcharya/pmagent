import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Plus, Hash, FolderKanban, Building2, LayoutDashboard } from 'lucide-react'
import { api } from '@/lib/api'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'

// Global ⌘K / Ctrl-K palette: quick-add a ticket, jump to a ticket by number/
// title, switch project/org. Context (org/project) is derived from the URL.
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const location = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const m = location.pathname.match(/^\/orgs\/([^/]+)(?:\/projects\/([^/]+))?/)
  const slug = m?.[1]
  const projectSlug = m?.[2]

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

  const go = (to: string) => {
    setOpen(false)
    setQuery('')
    navigate(to)
  }

  const createTicket = async () => {
    if (!projectId || !query.trim()) return
    try {
      const { ticket } = await api.createTicket({ projectId, title: query.trim() })
      qc.invalidateQueries({ queryKey: ['tickets', projectId] })
      toast.success(t('board.ticketCreated'))
      go(`/orgs/${slug}/projects/${projectSlug}/ticket/${ticket.number}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t('palette.placeholder')} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{t('palette.noResults')}</CommandEmpty>

        {projectId && query.trim() && (
          <CommandGroup heading={t('palette.actions')}>
            <CommandItem value={`create ${query}`} onSelect={createTicket}>
              <Plus className="h-4 w-4" />
              {t('palette.createTicket', { title: query.trim() })}
            </CommandItem>
          </CommandGroup>
        )}

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
      </CommandList>
    </CommandDialog>
  )
}
