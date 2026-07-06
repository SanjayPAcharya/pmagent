import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Pencil, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// Org Settings — manage the org's labels in one place: rename, recolor,
// delete (with usage counts so you know what a delete detaches). Writes are
// ADMIN-gated server-side; the card is rendered read-only for members.
export function LabelsCard({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const labels = useQuery({ queryKey: ['labels', orgId], queryFn: () => api.listLabels(orgId) })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6d28d9')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6d28d9')

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['labels', orgId] })
    // Renames/recolors show on ticket chips too — let open views refetch.
    qc.invalidateQueries({ queryKey: ['tickets'] })
  }

  const startEdit = (id: string, currentName: string, currentColor: string) => {
    setEditingId(id)
    setName(currentName)
    setColor(currentColor)
    setConfirmDeleteId(null)
  }

  const saveEdit = async () => {
    if (!editingId || !name.trim()) return
    try {
      await api.updateLabel(editingId, { name: name.trim(), color })
      setEditingId(null)
      refresh()
      toast.success(t('labels.saved'))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const remove = async (id: string) => {
    try {
      await api.deleteLabel(id)
      setConfirmDeleteId(null)
      refresh()
      toast.success(t('labels.deleted'))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const create = async () => {
    if (!newName.trim()) return
    try {
      await api.createLabel(orgId, newName.trim(), newColor)
      setNewName('')
      refresh()
      toast.success(t('labels.created'))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const items = labels.data?.labels ?? []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('labels.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {labels.isPending && (
          <div className="space-y-2 py-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        )}
        {labels.data && items.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">{t('labels.empty')}</p>
        )}
        <ul className="divide-y divide-border">
          {items.map((l) =>
            editingId === l.id ? (
              <li key={l.id} className="flex items-center gap-2 py-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-7 w-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  aria-label={t('labels.color')}
                />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void saveEdit()}
                  className="h-8 flex-1"
                  autoFocus
                />
                <Button size="sm" className="h-8 gap-1 px-2" onClick={() => void saveEdit()} disabled={!name.trim()}>
                  <Check className="h-3.5 w-3.5" />
                  {t('common.save')}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingId(null)}>
                  {t('common.cancel')}
                </Button>
              </li>
            ) : (
              <li key={l.id} className="group flex items-center gap-2 py-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: `${l.color}22`, color: l.color }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {t('labels.usage', { count: l.usageCount ?? 0 })}
                </span>
                {isAdmin &&
                  (confirmDeleteId === l.id ? (
                    <>
                      <span className="text-xs text-destructive">{t('labels.confirmDelete')}</span>
                      <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => void remove(l.id)}>
                        {t('common.delete')}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setConfirmDeleteId(null)}>
                        {t('common.cancel')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(l.id, l.name, l.color)}
                        aria-label={t('common.edit')}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(l.id)}
                        aria-label={t('common.delete')}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ))}
              </li>
            ),
          )}
        </ul>
        {isAdmin && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-7 w-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
              aria-label={t('labels.color')}
            />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void create()}
              placeholder={t('labels.newPlaceholder')}
              className="h-8 flex-1"
            />
            <Button size="sm" variant="outline" className="h-8" onClick={() => void create()} disabled={!newName.trim()}>
              + {t('labels.add')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
