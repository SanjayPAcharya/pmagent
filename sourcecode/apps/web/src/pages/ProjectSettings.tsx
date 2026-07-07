import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DangerZone } from '@/components/DangerZone'

export default function ProjectSettings() {
  const { slug = '', projectSlug = '' } = useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const orgId = org.data?.org.id
  const isAdmin = org.data?.org.role === 'OWNER' || org.data?.org.role === 'ADMIN'
  const projects = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.listProjects(orgId!),
    enabled: Boolean(orgId),
  })
  const project = projects.data?.projects.find((p) => p.slug === projectSlug)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description ?? '')
      setBranch(project.defaultBranch ?? 'main')
    }
  }, [project])

  const save = async (body: { name?: string; description?: string; defaultBranch?: string }) => {
    if (!project) return
    setBusy(true)
    try {
      await api.updateProject(project.id, body)
      qc.invalidateQueries({ queryKey: ['projects', orgId] })
      toast.success(t('settings.saved'))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const base = `/orgs/${slug}/projects/${projectSlug}`
  const dirty =
    project && (name.trim() !== project.name || description !== (project.description ?? '') || branch !== (project.defaultBranch ?? 'main'))

  const header = (
    <div>
      <Link to={base} className="text-sm text-muted-foreground hover:underline">
        {t('settings.backToProject')}
      </Link>
      <h2 className="text-xl font-semibold text-foreground">{t('settings.projectTitle')}</h2>
    </div>
  )

  if (org.isPending || projects.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {header}
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {header}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('settings.general')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="font-mono">{project?.key}</Badge>
            <span className="text-xs text-muted-foreground">{t('settings.keyImmutable')}</span>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('settings.projectName')}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('settings.description')}</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!isAdmin} rows={3} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('settings.defaultBranch')}</label>
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} disabled={!isAdmin} className="mt-1 max-w-xs" />
          </div>
          <Button
            size="sm"
            disabled={!isAdmin || !dirty || !name.trim() || busy}
            onClick={() => save({ name: name.trim(), description, defaultBranch: branch.trim() || 'main' })}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </CardContent>
      </Card>

      {isAdmin && project && (
        <DangerZone
          title={t('settings.archiveTitle')}
          description={t('settings.archiveProjectWarning')}
          confirmLabel={project.name}
          confirmHint={t('settings.typeToConfirm', { name: project.name })}
          actionLabel={t('settings.archiveProject')}
          onDelete={async () => {
            try {
              await api.archiveProject(project.id)
              qc.invalidateQueries({ queryKey: ['projects', orgId] })
              toast.success(t('settings.projectArchived'))
              navigate(`/orgs/${slug}`)
            } catch (e) {
              toast.error((e as Error).message)
            }
          }}
        />
      )}
    </div>
  )
}
