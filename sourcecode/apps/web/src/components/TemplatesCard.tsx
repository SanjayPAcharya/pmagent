import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { api, type Priority, type TicketType } from '@/lib/api'
import { PRIORITIES } from '@/lib/board'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// 3.4 W1 — org template management (Members page = the org admin surface).
// Server enforces ADMIN on writes; reads are for every member.
const TYPES: TicketType[] = ['FEATURE', 'BUG', 'CHORE', 'SPIKE']

export function TemplatesCard({ orgId }: { orgId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const templates = useQuery({ queryKey: ['templates', orgId], queryFn: () => api.listTemplates(orgId) })

  const [name, setName] = useState('')
  const [type, setType] = useState<TicketType>('FEATURE')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const [description, setDescription] = useState('')
  const [ac, setAc] = useState('')
  const [showForm, setShowForm] = useState(false)

  const refresh = () => qc.invalidateQueries({ queryKey: ['templates', orgId] })
  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => { refresh(); toast.success(ok) }).catch((e) => toast.error((e as Error).message))

  const create = () => {
    if (!name.trim()) return
    void run(
      api.createTemplate({
        orgId,
        name: name.trim(),
        type,
        priority,
        description: description.trim() || undefined,
        acceptanceCriteria: ac.trim() || undefined,
      }).then(() => { setName(''); setDescription(''); setAc(''); setShowForm(false) }),
      t('templates.created'),
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('templates.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {templates.isPending && (
          <div className="space-y-2 py-1">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        )}
        <ul className="divide-y divide-border">
          {(templates.data?.templates ?? []).map((tpl) => (
            <li key={tpl.id} className="flex items-center gap-2 py-2">
              <Badge variant="secondary" className="shrink-0 text-[10px]">{tpl.type}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{tpl.name}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{tpl.priority}</span>
              <button
                onClick={() => void run(api.deleteTemplate(tpl.id), t('templates.deleted'))}
                aria-label={t('common.delete')}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        {templates.data && templates.data.templates.length === 0 && (
          <div className="flex flex-col items-start gap-2 py-2">
            <p className="text-sm text-muted-foreground">{t('templates.empty')}</p>
            <Button size="sm" variant="outline" onClick={() => void run(api.seedDefaultTemplates(orgId), t('templates.seeded'))}>
              {t('templates.restoreDefaults')}
            </Button>
          </div>
        )}

        {showForm ? (
          <div className="mt-3 space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('templates.namePlaceholder')} className="h-8 flex-1" />
              <select value={type} onChange={(e) => setType(e.target.value as TicketType)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
                {TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
              </select>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={t('templates.descriptionPlaceholder')} />
            <Textarea value={ac} onChange={(e) => setAc(e.target.value)} rows={2} placeholder={t('templates.acPlaceholder')} />
            <div className="flex gap-2">
              <Button size="sm" onClick={create} disabled={!name.trim()}>{t('common.create')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>
            + {t('templates.newTemplate')}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
