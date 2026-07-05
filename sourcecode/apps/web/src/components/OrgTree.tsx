import { useEffect, useMemo } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, ChevronRight, PanelLeftClose, Users, Star, LayoutDashboard, FolderKanban, List, Rocket, Settings, UserCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, type Organization, type Project } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useLocalStorageState } from '@/lib/useLocalStorage'
import { useFavorites, useIsFavorite, toggleFavorite } from '@/lib/favorites'

// The persistent Org → Project navigation tree. Rendered in the desktop rail
// (Layout) and inside a Sheet on mobile. Driven by the same query keys the pages
// use (['orgs'], ['org', slug], ['projects', orgId]) so it shares their cache.

const leafClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
    isActive
      ? 'bg-accent font-medium text-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  )

export function OrgTree({ onNavigate, onCollapse }: { onNavigate?: () => void; onCollapse?: () => void }) {
  const { slug, projectSlug } = useParams()
  const { t } = useTranslation()
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: api.listOrgs })
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const [expandedOrgs, setExpandedOrgs] = useLocalStorageState<string[]>('agentpm-tree-orgs', [])

  // Auto-expand the org you're currently inside (still collapsible afterward).
  useEffect(() => {
    if (slug) setExpandedOrgs((p) => (p.includes(slug) ? p : [...p, slug]))
  }, [slug, setExpandedOrgs])

  const toggleOrg = (s: string) =>
    setExpandedOrgs((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))

  return (
    <nav className="flex h-full flex-col" aria-label={t('tree.title')}>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('tree.title')}</span>
        {onCollapse && (
          <button
            onClick={onCollapse}
            aria-label={t('tree.collapse')}
            title={t('tree.collapse')}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="scrollbar-slim flex-1 overflow-y-auto px-2 pb-4">
        <NavLink
          to="/my-work"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
              isActive ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )
          }
        >
          {me.data?.user.avatarUrl ? (
            <img src={me.data.user.avatarUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
          ) : (
            <UserCircle2 className="h-4 w-4" />
          )}
          {t('tree.myWork')}
        </NavLink>
        {orgs.isPending ? (
          <div className="space-y-1 px-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : orgs.data && orgs.data.organizations.length === 0 ? (
          <div className="px-2 py-2">
            <p className="mb-2 text-xs text-muted-foreground">{t('tree.noOrgs')}</p>
            <Link
              to="/"
              onClick={onNavigate}
              className="flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 px-2 py-1.5 text-sm font-medium text-primary hover:bg-primary/5"
            >
              + {t('tree.createFirstOrg')}
            </Link>
          </div>
        ) : (
          orgs.data?.organizations.map((o) => (
            <OrgNode
              key={o.id}
              org={o}
              expanded={expandedOrgs.includes(o.slug)}
              activeProjectSlug={slug === o.slug ? projectSlug : undefined}
              onToggle={() => toggleOrg(o.slug)}
              onNavigate={onNavigate}
            />
          ))
        )}
      </div>
    </nav>
  )
}

function OrgNode({
  org,
  expanded,
  activeProjectSlug,
  onToggle,
  onNavigate,
}: {
  org: Organization
  expanded: boolean
  activeProjectSlug?: string
  onToggle: () => void
  onNavigate?: () => void
}) {
  return (
    <div>
      <div className="group flex items-center gap-1 rounded-md pr-1 hover:bg-accent">
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm"
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
          />
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: org.accentColor ?? 'hsl(var(--primary))' }}
          />
          <span className="truncate font-medium text-foreground">{org.name}</span>
        </button>
        <Link
          to={`/orgs/${org.slug}`}
          onClick={onNavigate}
          className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          title={org.name}
        >
          {org.projectCount ?? ''}
        </Link>
      </div>
      {expanded && <ProjectsSubtree org={org} activeProjectSlug={activeProjectSlug} onNavigate={onNavigate} />}
    </div>
  )
}

function ProjectsSubtree({
  org,
  activeProjectSlug,
  onNavigate,
}: {
  org: Organization
  activeProjectSlug?: string
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const projects = useQuery({ queryKey: ['projects', org.id], queryFn: () => api.listProjects(org.id) })
  const favorites = useFavorites()
  const [expandedProjects, setExpandedProjects] = useLocalStorageState<string[]>('agentpm-tree-projects', [])

  useEffect(() => {
    if (activeProjectSlug) {
      const k = `${org.slug}:${activeProjectSlug}`
      setExpandedProjects((p) => (p.includes(k) ? p : [...p, k]))
    }
  }, [activeProjectSlug, org.slug, setExpandedProjects])

  const sorted = useMemo(() => {
    const list = projects.data?.projects ?? []
    return [...list].sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)))
  }, [projects.data, favorites])

  const toggleProject = (key: string) =>
    setExpandedProjects((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]))

  return (
    <div className="ml-3 border-l border-border pl-1">
      {projects.isPending ? (
        <div className="space-y-1 py-1">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('tree.noProjects')}</p>
      ) : (
        sorted.map((p) => (
          <ProjectNode
            key={p.id}
            orgSlug={org.slug}
            project={p}
            expanded={expandedProjects.includes(`${org.slug}:${p.slug}`)}
            onToggle={() => toggleProject(`${org.slug}:${p.slug}`)}
            onNavigate={onNavigate}
          />
        ))
      )}
      <NavLink to={`/orgs/${org.slug}/members`} onClick={onNavigate} className={leafClass}>
        <Users className="h-3.5 w-3.5 shrink-0" />
        {t('nav.members')}
      </NavLink>
      <NavLink to={`/orgs/${org.slug}/settings`} onClick={onNavigate} className={leafClass}>
        <Settings className="h-3.5 w-3.5 shrink-0" />
        {t('nav.settings')}
      </NavLink>
    </div>
  )
}

function ProjectNode({
  orgSlug,
  project,
  expanded,
  onToggle,
  onNavigate,
}: {
  orgSlug: string
  project: Project
  expanded: boolean
  onToggle: () => void
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const fav = useIsFavorite(project.id)

  return (
    <div>
      <div className="group flex items-center gap-1 rounded-md pr-1 hover:bg-accent">
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm"
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
          />
          <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">{project.key}</span>
          <span className="truncate text-foreground">{project.name}</span>
        </button>
        <button
          onClick={() => toggleFavorite(project.id)}
          aria-label={fav ? t('tree.unfavorite') : t('tree.favorite')}
          className="shrink-0 rounded p-1"
        >
          <Star
            className={cn(
              'h-3.5 w-3.5',
              fav ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground opacity-0 group-hover:opacity-100',
            )}
          />
        </button>
        {project.openTicketCount ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
            {project.openTicketCount}
          </span>
        ) : null}
      </div>
      {expanded && (
        <div className="ml-4 border-l border-border pl-1">
          <NavLink to={`/orgs/${orgSlug}/projects/${project.slug}`} end onClick={onNavigate} className={leafClass}>
            <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
            {t('nav.overview')}
          </NavLink>
          <NavLink to={`/orgs/${orgSlug}/projects/${project.slug}/board`} onClick={onNavigate} className={leafClass}>
            <FolderKanban className="h-3.5 w-3.5 shrink-0" />
            {t('nav.board')}
          </NavLink>
          <NavLink to={`/orgs/${orgSlug}/projects/${project.slug}/list`} onClick={onNavigate} className={leafClass}>
            <List className="h-3.5 w-3.5 shrink-0" />
            {t('nav.list')}
          </NavLink>
          <NavLink to={`/orgs/${orgSlug}/projects/${project.slug}/sprints`} onClick={onNavigate} className={leafClass}>
            <Rocket className="h-3.5 w-3.5 shrink-0" />
            {t('nav.sprints')}
          </NavLink>
          <NavLink to={`/orgs/${orgSlug}/projects/${project.slug}/reports`} onClick={onNavigate} className={leafClass}>
            <BarChart3 className="h-3.5 w-3.5 shrink-0" />
            {t('nav.reports')}
          </NavLink>
          <NavLink to={`/orgs/${orgSlug}/projects/${project.slug}/settings`} onClick={onNavigate} className={leafClass}>
            <Settings className="h-3.5 w-3.5 shrink-0" />
            {t('nav.settings')}
          </NavLink>
        </div>
      )}
    </div>
  )
}
