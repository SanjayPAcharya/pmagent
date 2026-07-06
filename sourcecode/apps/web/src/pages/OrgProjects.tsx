import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Rocket, Star } from 'lucide-react'
import { api, type Project } from '../lib/api'
import { Skeleton } from '../components/ui/skeleton'
import { MetricChip } from '../components/MetricChip'
import { StatusBar } from '../components/StatusBar'
import { AvatarStack } from '../components/AvatarStack'
import { ActivityFeed } from '../components/ActivityFeed'
import { ProjectMenu } from '../components/ProjectMenu'
import { DensityToggle, type Density } from '../components/DensityToggle'
import { useLocalStorageState } from '../lib/useLocalStorage'
import { useFavorites, useIsFavorite, toggleFavorite } from '../lib/favorites'
import { formatRelative, daysUntil } from '../lib/time'
import { cn } from '../lib/utils'

const keyBadge = 'shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground'

function FavoriteButton({ id, className }: { id: string; className?: string }) {
  const fav = useIsFavorite(id)
  const { t } = useTranslation()
  return (
    <button
      onClick={() => toggleFavorite(id)}
      aria-label={fav ? t('tree.unfavorite') : t('tree.favorite')}
      className={cn('relative z-10 rounded p-1', className)}
    >
      <Star
        className={cn(
          'h-4 w-4',
          fav ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground opacity-0 group-hover:opacity-100',
        )}
      />
    </button>
  )
}

function SprintChip({ project }: { project: Project }) {
  const { t } = useTranslation()
  const s = project.activeSprint
  if (!s) {
    return (
      <div className="mt-3 rounded-lg border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">
        {t('projects.noActiveSprint')}
      </div>
    )
  }
  const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
  const dleft = daysUntil(s.endDate)
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
      <Rocket className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{s.name}</span>
      <span className="shrink-0">· {pct}%</span>
      {dleft !== null && (
        <span className="ml-auto shrink-0">{dleft >= 0 ? t('projects.daysLeft', { count: dleft }) : t('projects.overdue')}</span>
      )}
    </div>
  )
}

function ProjectCard({ orgSlug, project }: { orgSlug: string; project: Project }) {
  const { t } = useTranslation()
  return (
    <div className="group relative rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      {/* Overlay link makes the WHOLE card clickable. Content stays non-positioned
          so the overlay paints above it; only the star/menu lift over it (z-10). */}
      <Link to={`/orgs/${orgSlug}/projects/${project.slug}`} className="absolute inset-0" aria-label={project.name} />
      <div className="flex items-center gap-2">
        <span className={keyBadge}>{project.key}</span>
        <span className="truncate font-medium text-foreground">{project.name}</span>
        <div className="relative z-10 ml-auto flex items-center">
          <FavoriteButton id={project.id} />
          <ProjectMenu orgSlug={orgSlug} project={project} />
        </div>
      </div>
      {project.description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
      )}
      <StatusBar byStatus={project.byStatus} className="mt-3" />
      <SprintChip project={project} />
      {project.updatedAt && (
        <div className="mt-3 text-xs text-muted-foreground">
          {t('projects.updated', { time: formatRelative(project.updatedAt) })}
        </div>
      )}
    </div>
  )
}

function ProjectRow({ orgSlug, project }: { orgSlug: string; project: Project }) {
  const s = project.activeSprint
  const pct = s && s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
  return (
    <div className="group relative flex items-center gap-3 px-4 py-3 hover:bg-accent">
      <Link to={`/orgs/${orgSlug}/projects/${project.slug}`} className="absolute inset-0" aria-label={project.name} />
      <span className={keyBadge}>{project.key}</span>
      <span className="truncate font-medium text-foreground">{project.name}</span>
      <StatusBar byStatus={project.byStatus} showLegend={false} className="hidden w-24 shrink-0 sm:block" />
      <span className="ml-auto hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex">
        {s && (
          <span className="inline-flex items-center gap-1">
            <Rocket className="h-3 w-3" />
            {s.name} · {pct}%
          </span>
        )}
        <span>{project.openTicketCount ?? 0} open</span>
      </span>
      <div className="relative z-10 ml-auto flex items-center sm:ml-0">
        <FavoriteButton id={project.id} />
        <ProjectMenu orgSlug={orgSlug} project={project} />
      </div>
    </div>
  )
}

export default function OrgProjects() {
  const { slug = '' } = useParams()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const orgId = org.data?.org.id
  const projects = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.listProjects(orgId as string),
    enabled: Boolean(orgId),
  })
  const activity = useQuery({
    queryKey: ['org-activity', slug],
    queryFn: () => api.orgActivity(slug),
    enabled: Boolean(slug),
  })
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [density, setDensity] = useLocalStorageState<Density>('agentpm-density-projects', 'grid')
  const favorites = useFavorites()
  const create = useMutation({
    mutationFn: () =>
      api.createProject(orgId as string, name.trim(), {
        key: key.trim() || undefined,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      setName('')
      setKey('')
      setDescription('')
      qc.invalidateQueries({ queryKey: ['projects', orgId] })
    },
  })

  const stats = org.data?.org.stats
  const membersPreview = org.data?.org.membersPreview ?? []
  const pendingInvites = org.data?.org.pendingInviteCount ?? 0
  const ticketsByStatus = stats?.ticketsByStatus ?? {}
  const openTotal = Object.entries(ticketsByStatus).reduce(
    (n, [k, v]) => n + (k === 'DONE' || k === 'CANCELLED' ? 0 : (v ?? 0)),
    0,
  )

  const sorted = useMemo(() => {
    const l = projects.data?.projects ?? []
    return [...l].sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)))
  }, [projects.data, favorites])
  const hasProjects = sorted.length > 0

  return (
    <div className="mx-auto max-w-6xl">
      {/* Org overview */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate text-xl font-semibold text-foreground">{org.data?.org.name ?? slug}</h2>
        {hasProjects && <DensityToggle value={density} onChange={setDensity} />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricChip label={t('projects.metricProjects')} value={stats?.projectCount ?? '—'} />
        <MetricChip label={t('projects.metricMembers')} value={stats?.memberCount ?? '—'} />
        <MetricChip label={t('projects.metricOpen')} value={stats ? openTotal : '—'} />
        <MetricChip label={t('projects.metricSprints')} value={stats?.activeSprintCount ?? '—'} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {membersPreview.length > 0 && (
          <AvatarStack users={membersPreview.map((m) => ({ name: m.name, avatarUrl: m.avatarUrl, initials: m.initials }))} />
        )}
        {pendingInvites > 0 && (
          <span className="text-xs text-muted-foreground">{t('projects.pendingInvites', { count: pendingInvites })}</span>
        )}
        <Link to={`/orgs/${slug}/members`} className="ml-auto text-sm text-muted-foreground hover:underline">
          {t('projects.membersLink')}
        </Link>
        <Link to={`/orgs/${slug}/settings`} className="text-sm text-muted-foreground hover:underline">
          {t('projects.settingsLink')}
        </Link>
      </div>

      {/* Create */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && orgId) create.mutate()
        }}
        className="mt-6"
      >
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('projects.newProjectPlaceholder')}
            className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
          />
          <input
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder={t('projects.keyPlaceholder')}
            maxLength={10}
            className="w-20 rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm sm:w-24"
          />
          <button
            disabled={!name.trim() || !orgId || create.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {t('common.create')}
          </button>
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('projects.descriptionPlaceholder')}
          className="mt-2 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
        />
      </form>
      {create.isError && <p className="mt-2 text-sm text-destructive">{(create.error as Error).message}</p>}

      {/* Projects */}
      {projects.isPending ? (
        <div className={cn('mt-6', density === 'grid' ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-2')}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className={density === 'grid' ? 'h-44 rounded-xl' : 'h-14 rounded-lg'} />
          ))}
        </div>
      ) : !hasProjects ? (
        <div className="mt-6 rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {t('projects.empty')}
        </div>
      ) : density === 'grid' ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((p) => (
            <ProjectCard key={p.id} orgSlug={slug} project={p} />
          ))}
        </div>
      ) : (
        <div className="mt-6 divide-y divide-border overflow-hidden rounded-lg border bg-card">
          {sorted.map((p) => (
            <ProjectRow key={p.id} orgSlug={slug} project={p} />
          ))}
        </div>
      )}

      {activity.data && <ActivityFeed orgSlug={slug} items={activity.data.activity} />}
    </div>
  )
}
