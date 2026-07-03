import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DangerZone } from '@/components/DangerZone'

const ACCENT_PRESETS = ['#6d28d9', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777']

export default function OrgSettings() {
  const { slug = '' } = useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const org = useQuery({ queryKey: ['org', slug], queryFn: () => api.getOrg(slug) })
  const data = org.data?.org

  const [name, setName] = useState('')
  useEffect(() => {
    if (data) setName(data.name)
  }, [data])

  const isOwner = data?.role === 'OWNER'
  const isAdmin = isOwner || data?.role === 'ADMIN'

  const saveName = async () => {
    const v = name.trim()
    if (!v || v === data?.name) return
    try {
      await api.updateOrg(slug, { name: v })
      qc.invalidateQueries({ queryKey: ['org', slug] })
      qc.invalidateQueries({ queryKey: ['orgs'] })
      toast.success(t('settings.saved'))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const setAccent = async (accentColor: string | null) => {
    try {
      await api.updateOrg(slug, { accentColor })
      qc.invalidateQueries({ queryKey: ['org', slug] })
      toast.success(t('members.accentSaved'))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to={`/orgs/${slug}`} className="text-sm text-muted-foreground hover:underline">
          {t('settings.backToOrg')}
        </Link>
        <h2 className="text-xl font-semibold text-foreground">{t('settings.orgTitle')}</h2>
      </div>

      {/* General */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('settings.general')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">{t('settings.orgName')}</label>
            <div className="mt-1 flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} />
              <Button size="sm" onClick={saveName} disabled={!isAdmin || !name.trim() || name === data?.name}>
                {t('common.save')}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('settings.plan')}</span>
            <Badge variant="secondary">{data?.plan ?? 'FREE'}</Badge>
            <span className="text-xs text-muted-foreground">{t('settings.planHint')}</span>
          </div>
        </CardContent>
      </Card>

      {/* Accent — moved here from Members */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('members.accentTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => setAccent(c)}
              disabled={!isAdmin}
              title={c}
              aria-label={c}
              className="h-7 w-7 rounded-full transition hover:scale-110 disabled:opacity-50"
              style={{ backgroundColor: c, boxShadow: data?.accentColor?.toLowerCase() === c ? `0 0 0 2px ${c}` : undefined }}
            />
          ))}
          <input
            type="color"
            value={data?.accentColor ?? '#6d28d9'}
            onChange={(e) => setAccent(e.target.value)}
            disabled={!isAdmin}
            className="h-7 w-9 cursor-pointer rounded border border-input bg-transparent p-0.5 disabled:opacity-50"
            title={t('members.accentCustom')}
          />
          {data?.accentColor && isAdmin && (
            <Button variant="ghost" size="sm" onClick={() => setAccent(null)}>
              {t('members.accentReset')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Danger zone — OWNER only */}
      {isOwner && data && (
        <DangerZone
          title={t('settings.dangerTitle')}
          description={t('settings.deleteOrgWarning')}
          confirmLabel={data.name}
          confirmHint={t('settings.typeToConfirm', { name: data.name })}
          actionLabel={t('settings.deleteOrg')}
          onDelete={async () => {
            try {
              await api.deleteOrg(slug)
              qc.invalidateQueries({ queryKey: ['orgs'] })
              toast.success(t('settings.orgDeleted'))
              navigate('/')
            } catch (e) {
              toast.error((e as Error).message)
            }
          }}
        />
      )}
    </div>
  )
}
