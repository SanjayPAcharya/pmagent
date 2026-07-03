import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api, type Organization } from '../lib/api'
import { Skeleton } from '../components/ui/skeleton'
import { MetricChip } from '../components/MetricChip'
import { DensityToggle, type Density } from '../components/DensityToggle'
import { GettingStarted } from '../components/GettingStarted'
import { useLocalStorageState } from '../lib/useLocalStorage'
import { cn } from '../lib/utils'

function AccentDot({ color }: { color?: string | null }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color ?? 'hsl(var(--primary))' }} />
}

function RolePill({ role }: { role?: string }) {
  if (!role) return null
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{role.toLowerCase()}</span>
  )
}

function PlanPill({ plan }: { plan?: Organization['plan'] }) {
  if (!plan || plan === 'FREE') return null
  return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{plan}</span>
}

export default function Dashboard() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: api.listOrgs })
  const [name, setName] = useState('')
  const [density, setDensity] = useLocalStorageState<Density>('agentpm-density-orgs', 'grid')
  const create = useMutation({
    mutationFn: () => api.createOrg(name.trim()),
    onSuccess: () => {
      setName('')
      qc.invalidateQueries({ queryKey: ['orgs'] })
    },
  })

  const list = orgs.data?.organizations
  const hasOrgs = list && list.length > 0

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">{t('dashboard.title')}</h2>
        {hasOrgs && <DensityToggle value={density} onChange={setDensity} />}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) create.mutate()
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('dashboard.newOrgPlaceholder')}
          className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
        />
        <button
          disabled={!name.trim() || create.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {t('common.create')}
        </button>
      </form>
      {create.isError && <p className="mt-2 text-sm text-destructive">{(create.error as Error).message}</p>}

      {orgs.data && <GettingStarted orgs={orgs.data.organizations} />}

      {orgs.isPending ? (
        <div className={cn('mt-6', density === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-2')}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className={density === 'grid' ? 'h-32 rounded-xl' : 'h-14 rounded-lg'} />
          ))}
        </div>
      ) : !hasOrgs ? (
        <div className="mt-6 rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {t('dashboard.empty')}
        </div>
      ) : density === 'grid' ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((o) => (
            <Link
              key={o.id}
              to={`/orgs/${o.slug}`}
              className="group block rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <div className="flex items-center gap-2">
                <AccentDot color={o.accentColor} />
                <span className="truncate font-medium text-foreground">{o.name}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <PlanPill plan={o.plan} />
                  <RolePill role={o.role} />
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <MetricChip label={t('dashboard.metricProjects')} value={o.projectCount ?? 0} />
                <MetricChip label={t('dashboard.metricMembers')} value={o.memberCount ?? 0} />
                <MetricChip label={t('dashboard.metricOpen')} value={o.openTicketCount ?? 0} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border bg-card">
          {list.map((o) => (
            <li key={o.id}>
              <Link to={`/orgs/${o.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
                <AccentDot color={o.accentColor} />
                <span className="truncate font-medium text-foreground">{o.name}</span>
                <RolePill role={o.role} />
                <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {t('dashboard.countProjects', { count: o.projectCount ?? 0 })} ·{' '}
                  {t('dashboard.countMembers', { count: o.memberCount ?? 0 })} ·{' '}
                  {t('dashboard.countOpen', { count: o.openTicketCount ?? 0 })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
