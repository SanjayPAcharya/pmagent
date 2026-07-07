import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Archive, RotateCcw, Trash2, Loader2 } from 'lucide-react'
import { api, type Ticket } from '../lib/api'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { formatRelative } from '../lib/time'

// Phase 3.7.3 A2 — dedicated per-project view of archived (soft-deleted) tickets
// with restore + permanent delete. Reuses GET /api/tickets?archivedOnly=true.
export default function ArchivedTickets() {
  const { slug = '', projectSlug = '' } = useParams()
  const { t } = useTranslation()
  const qc = useQueryClient()

  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const orgId = org.data?.org.id
  const projects = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.listProjects(orgId!),
    enabled: Boolean(orgId),
  })
  const project = projects.data?.projects.find((p) => p.slug === projectSlug)
  const projectId = project?.id

  const params = { archivedOnly: 'true', sort: '-updatedAt' }
  const archived = useQuery({
    queryKey: ['tickets', projectId, params],
    queryFn: () => api.listTickets(projectId!, params),
    enabled: Boolean(projectId),
  })

  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // Auto-disarm the delete confirm after a few seconds (product-wide pattern).
  useEffect(() => {
    if (!confirmId) return
    const id = setTimeout(() => setConfirmId(null), 4000)
    return () => clearTimeout(id)
  }, [confirmId])

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['tickets', projectId] })

  const restore = async (tk: Ticket) => {
    setBusyId(tk.id)
    try {
      await api.batchUpdateTickets([tk.id], { archived: false })
      toast.success(t('archived.restored', { key: tk.key }))
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (tk: Ticket) => {
    setBusyId(tk.id)
    try {
      await api.deleteTicketPermanent(tk.id)
      toast.success(t('archived.deleted', { key: tk.key }))
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusyId(null)
      setConfirmId(null)
    }
  }

  const base = `/orgs/${slug}/projects/${projectSlug}`
  const items = archived.data?.items ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link to={`${base}/list`} className="text-sm text-muted-foreground hover:underline">
          ← {t('archived.backToList')}
        </Link>
        <h2 className="text-xl font-semibold text-foreground">{t('archived.ticketsTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('archived.ticketsHint')}</p>
      </div>

      {archived.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : items.length === 0 ? (
        <EmptyState icon={Archive} message={t('archived.emptyTickets')} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border bg-card">
          {items.map((tk) => {
            const busy = busyId === tk.id
            const confirming = confirmId === tk.id
            return (
              <li key={tk.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{tk.key}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{tk.title}</span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {t('archived.archivedAgo', { rel: formatRelative(tk.updatedAt) })}
                </span>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void restore(tk)} className="gap-1.5">
                  {busy && !confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  {t('archived.restore')}
                </Button>
                <Button
                  variant={confirming ? 'destructive' : 'ghost'}
                  size="sm"
                  disabled={busy}
                  onClick={() => (confirming ? void remove(tk) : setConfirmId(tk.id))}
                  onBlur={() => setConfirmId((c) => (c === tk.id ? null : c))}
                  aria-label={t('archived.deleteForever')}
                  className="gap-1.5"
                >
                  {busy && confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {confirming && <span>{t('archived.deleteConfirm')}</span>}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
