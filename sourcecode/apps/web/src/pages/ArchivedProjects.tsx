import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Archive, RotateCcw, Trash2, Loader2 } from 'lucide-react'
import { api, type Project } from '../lib/api'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'

// Phase 3.7.3 B3 — per-org view of archived (soft-deleted) projects with restore
// + permanent delete. Reuses GET /api/projects?archivedOnly=true.
export default function ArchivedProjects() {
  const { slug = '' } = useParams()
  const { t } = useTranslation()
  const qc = useQueryClient()

  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const orgId = org.data?.org.id

  const archived = useQuery({
    queryKey: ['projects', orgId, 'archived'],
    queryFn: () => api.listProjects(orgId!, { archivedOnly: true }),
    enabled: Boolean(orgId),
  })

  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    if (!confirmId) return
    const id = setTimeout(() => setConfirmId(null), 4000)
    return () => clearTimeout(id)
  }, [confirmId])

  // Refresh both the archived list and every non-archived project listing/stat.
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['projects'] })
    void qc.invalidateQueries({ queryKey: ['orgs'] })
    void qc.invalidateQueries({ queryKey: ['orgStats'] })
  }

  const restore = async (p: Project) => {
    setBusyId(p.id)
    try {
      await api.restoreProject(p.id)
      toast.success(t('archived.projectRestored', { name: p.name }))
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (p: Project) => {
    setBusyId(p.id)
    try {
      await api.deleteProject(p.id)
      toast.success(t('archived.projectDeleted', { name: p.name }))
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusyId(null)
      setConfirmId(null)
    }
  }

  const items = archived.data?.projects ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link to={`/orgs/${slug}`} className="text-sm text-muted-foreground hover:underline">
          ← {t('archived.backToOrg')}
        </Link>
        <h2 className="text-xl font-semibold text-foreground">{t('archived.projectsTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('archived.projectsHint')}</p>
      </div>

      {archived.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : items.length === 0 ? (
        <EmptyState icon={Archive} message={t('archived.emptyProjects')} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border bg-card">
          {items.map((p) => {
            const busy = busyId === p.id
            const confirming = confirmId === p.id
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{p.key}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.name}</span>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void restore(p)} className="gap-1.5">
                  {busy && !confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  {t('archived.restore')}
                </Button>
                <Button
                  variant={confirming ? 'destructive' : 'ghost'}
                  size="sm"
                  disabled={busy}
                  onClick={() => (confirming ? void remove(p) : setConfirmId(p.id))}
                  onBlur={() => setConfirmId((c) => (c === p.id ? null : c))}
                  aria-label={t('archived.deleteForever')}
                  className="gap-1.5"
                >
                  {busy && confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {confirming && <span>{t('archived.deleteProjectConfirm')}</span>}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
