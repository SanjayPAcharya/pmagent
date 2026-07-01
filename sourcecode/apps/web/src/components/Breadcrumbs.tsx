import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Home } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'

// Header breadcrumb derived from the route + cached query data
// (reuses ['orgs'], ['org', slug], ['projects', orgId]). Hidden below md.
export function Breadcrumbs() {
  const { slug, projectSlug } = useParams()
  const { pathname } = useLocation()
  const { t } = useTranslation()

  const orgs = useQuery({ queryKey: ['orgs'], queryFn: api.listOrgs })
  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug!), enabled: Boolean(slug) })
  const orgId = org.data?.org.id
  const projects = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.listProjects(orgId!),
    enabled: Boolean(orgId) && Boolean(projectSlug),
  })

  if (!slug) return null // nothing to show on the dashboard

  const orgName = orgs.data?.organizations.find((o) => o.slug === slug)?.name ?? org.data?.org.name ?? slug
  const projectName = projects.data?.projects.find((p) => p.slug === projectSlug)?.name ?? projectSlug
  const onSprints = pathname.endsWith('/sprints')
  const onMembers = pathname.endsWith('/members')

  const crumbs: { label: string; to?: string }[] = [{ label: orgName, to: `/orgs/${slug}` }]
  if (onMembers) crumbs.push({ label: t('nav.members') })
  if (projectSlug) {
    crumbs.push({ label: projectName ?? '', to: `/orgs/${slug}/projects/${projectSlug}` })
    if (onSprints) crumbs.push({ label: t('nav.sprints') })
  }

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground md:flex">
      <Link to="/" className="flex items-center gap-1 hover:text-foreground" aria-label={t('breadcrumb.home')}>
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={i} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
            {last || !c.to ? (
              <span className={last ? 'truncate font-medium text-foreground' : 'truncate'}>{c.label}</span>
            ) : (
              <Link to={c.to} className="truncate hover:text-foreground">
                {c.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
