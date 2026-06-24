import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export default function OrgProjects() {
  const { slug = '' } = useParams()
  const qc = useQueryClient()
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
      <Link to="/" className="text-sm text-slate-500 hover:underline">
        ← organizations
      </Link>
      <h2 className="mt-2 text-xl font-semibold text-slate-900">
        {org.data?.org.name ?? slug} · projects
      </h2>

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
          placeholder="New project name"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          disabled={!name.trim() || !orgId || create.isPending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Create
        </button>
      </form>
      {create.isError && (
        <p className="mt-2 text-sm text-rose-600">{(create.error as Error).message}</p>
      )}

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {projects.data?.projects.map((p) => (
          <li key={p.id} className="px-4 py-3 hover:bg-slate-50">
            <Link to={`/orgs/${slug}/projects/${p.slug}`} className="flex items-baseline gap-2">
              <span className="font-medium text-slate-800">{p.name}</span>
              <span className="text-xs text-slate-400">/{p.slug}</span>
            </Link>
          </li>
        ))}
        {projects.data?.projects.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-400">No projects yet.</li>
        )}
      </ul>
    </div>
  )
}
