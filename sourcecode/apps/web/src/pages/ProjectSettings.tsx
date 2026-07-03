import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description ?? '')
      setBranch(project.defaultBranch ?? 'main')
    }
  }, [project])

  const save = async (body: { name?: string; description?: string; defaultBranch?: string }) => {
    if (!project) return
    try {
      await api.updateProject(project.id, body)
      qc.invalidateQueries({ queryKey: ['projects', orgId] })
      toast.success(t('settings.saved'))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const base = `/orgs/${slug}/projects/${projectSlug}`
  const dirty =
    project && (name.trim() !== project.name || description !== (project.description ?? '') || branch !== (project.defaultBranch ?? 'main'))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to={base} className="text-sm text-muted-foreground hover:underline">
          {t('settings.backToProject')}
        </Link>
        <h2 className="text-xl font-semibold text-foreground">{t('settings.projectTitle')}</h2>
      </div>

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
            disabled={!isAdmin || !dirty || !name.trim()}
            onClick={() => save({ name: name.trim(), description, defaultBranch: branch.trim() || 'main' })}
          >
            {t('common.save')}
          </Button>
        </CardContent>
      </Card>

      {isAdmin && project && (
        <DangerZone
          title={t('settings.dangerTitle')}
          description={t('settings.deleteProjectWarning')}
          confirmLabel={project.name}
          confirmHint={t('settings.typeToConfirm', { name: project.name })}
          actionLabel={t('settings.deleteProject')}
          onDelete={async () => {
            try {
              await api.deleteProject(project.id)
              qc.invalidateQueries({ queryKey: ['projects', orgId] })
              toast.success(t('settings.projectDeleted'))
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
