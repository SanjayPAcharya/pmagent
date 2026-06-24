import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type Sprint } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function SprintRow({ sprint, onChanged }: { sprint: Sprint; onChanged: () => void }) {
  const detail = useQuery({ queryKey: ['sprint', sprint.id], queryFn: () => api.getSprint(sprint.id) })
  const counts = detail.data?.counts
  const pct = counts && counts.total ? Math.round((counts.done / counts.total) * 100) : 0

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      onChanged()
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {sprint.name}
          <Badge variant={sprint.status === 'ACTIVE' ? 'default' : 'secondary'}>{sprint.status}</Badge>
          {sprint.velocity != null && <span className="text-xs text-muted-foreground">velocity {sprint.velocity}</span>}
        </CardTitle>
        <div className="flex gap-2">
          {sprint.status === 'PLANNING' && (
            <Button size="sm" variant="outline" onClick={() => act(() => api.startSprint(sprint.id), 'Sprint started')}>
              Start
            </Button>
          )}
          {sprint.status === 'ACTIVE' && (
            <Button size="sm" variant="outline" onClick={() => act(() => api.completeSprint(sprint.id), 'Sprint completed')}>
              Complete
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {sprint.goal && <p className="mb-2 text-sm text-muted-foreground">{sprint.goal}</p>}
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>Completion</span>
          <span>
            {counts?.done ?? 0}/{counts?.total ?? 0} · {pct}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  )
}

export default function Sprints() {
  const { slug = '', projectSlug = '' } = useParams()
  const qc = useQueryClient()
  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const orgId = org.data?.org.id
  const projects = useQuery({ queryKey: ['projects', orgId], queryFn: () => api.listProjects(orgId!), enabled: Boolean(orgId) })
  const project = projects.data?.projects.find((p) => p.slug === projectSlug)
  const projectId = project?.id

  const sprints = useQuery({ queryKey: ['sprints', projectId], queryFn: () => api.listSprints(projectId!), enabled: Boolean(projectId) })

  const [name, setName] = useState('')
  const create = async () => {
    if (!projectId || !name.trim()) return
    try {
      await api.createSprint(projectId, name.trim())
      setName('')
      qc.invalidateQueries({ queryKey: ['sprints', projectId] })
      toast.success('Sprint created')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['sprints', projectId] })
    sprints.data?.sprints.forEach((s) => qc.invalidateQueries({ queryKey: ['sprint', s.id] }))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to={`/orgs/${slug}/projects/${projectSlug}`} className="text-sm text-muted-foreground hover:underline">
            ← Board
          </Link>
          <h2 className="text-xl font-semibold text-foreground">{project?.name ?? projectSlug} · Sprints</h2>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
        className="flex gap-2"
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New sprint name" className="max-w-xs" />
        <Button type="submit" disabled={!name.trim()}>
          Create sprint
        </Button>
      </form>

      <div className="space-y-3">
        {sprints.data?.sprints.map((s) => (
          <SprintRow key={s.id} sprint={s} onChanged={refresh} />
        ))}
        {sprints.data?.sprints.length === 0 && <p className="text-sm text-muted-foreground">No sprints yet.</p>}
      </div>
    </div>
  )
}
