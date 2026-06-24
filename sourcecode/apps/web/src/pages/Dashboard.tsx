import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export default function Dashboard() {
  const qc = useQueryClient()
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: api.listOrgs })
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: () => api.createOrg(name.trim()),
    onSuccess: () => {
      setName('')
      qc.invalidateQueries({ queryKey: ['orgs'] })
    },
  })

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="text-xl font-semibold text-foreground">Your organizations</h2>

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
          placeholder="New organization name"
          className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
        />
        <button
          disabled={!name.trim() || create.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Create
        </button>
      </form>
      {create.isError && <p className="mt-2 text-sm text-destructive">{(create.error as Error).message}</p>}

      <ul className="mt-6 divide-y divide-border rounded-lg border bg-card">
        {orgs.data?.organizations.map((o) => (
          <li key={o.id}>
            <Link to={`/orgs/${o.slug}`} className="flex items-center justify-between px-4 py-3 hover:bg-accent">
              <span className="font-medium text-foreground">{o.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{o.role}</span>
            </Link>
          </li>
        ))}
        {orgs.data?.organizations.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            No organizations yet — create one above.
          </li>
        )}
      </ul>
    </div>
  )
}
