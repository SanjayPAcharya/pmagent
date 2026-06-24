import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'

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
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: () => api.createProject(orgId as string, name.trim()),
    onSuccess: () => {
      setName('')
      qc.invalidateQueries({ queryKey: ['projects', orgId] })
    },
  })

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        {t('projects.backToOrgs')}
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">{t('projects.title', { org: org.data?.org.name ?? slug })}</h2>
        <Link to={`/orgs/${slug}/members`} className="text-sm text-muted-foreground hover:underline">
          {t('projects.membersLink')}
        </Link>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && orgId) create.mutate()
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('projects.newProjectPlaceholder')}
          className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
        />
        <button
          disabled={!name.trim() || !orgId || create.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {t('common.create')}
        </button>
      </form>
      {create.isError && (
        <p className="mt-2 text-sm text-destructive">{(create.error as Error).message}</p>
      )}

      <ul className="mt-6 divide-y divide-border rounded-lg border bg-card">
        {projects.data?.projects.map((p) => (
          <li key={p.id} className="px-4 py-3 hover:bg-accent">
            <Link to={`/orgs/${slug}/projects/${p.slug}`} className="flex items-baseline gap-2">
              <span className="font-medium text-foreground">{p.name}</span>
              <span className="text-xs text-muted-foreground">/{p.slug}</span>
            </Link>
          </li>
        ))}
        {projects.data?.projects.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t('projects.empty')}</li>
        )}
      </ul>
    </div>
  )
}
