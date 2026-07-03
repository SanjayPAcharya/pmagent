import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Archive, ChevronUp, CircleDot, Rocket, Tag, UserPlus, X } from 'lucide-react'
import { api, type BatchPatch, type Label, type Member, type Sprint, type TicketStatus } from '@/lib/api'
import { ALL_STATUSES, STATUS_LABEL } from '@/lib/board'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

// Floating action bar shown while tickets are multi-selected (board + list).
// Every action is one POST /tickets/batch, then the ticket queries refresh.
interface Props {
  selectedIds: string[]
  projectId: string
  members: Member[]
  sprints: Sprint[]
  labels: Label[]
  onClear: () => void
}

export function BulkBar({ selectedIds, projectId, members, sprints, labels, onClear }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const apply = async (patch: BatchPatch, okMsg: string) => {
    if (busy) return
    setBusy(true)
    try {
      const { updated } = await api.batchUpdateTickets(selectedIds, patch)
      toast.success(okMsg.replace('{n}', String(updated)))
      void qc.invalidateQueries({ queryKey: ['tickets', projectId] })
      void qc.invalidateQueries({ queryKey: ['my-work'] })
      onClear()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
      setConfirmArchive(false)
    }
  }

  const menuBtn = (icon: React.ReactNode, label: string) => (
    <Button variant="ghost" size="sm" disabled={busy} className="gap-1.5">
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <ChevronUp className="h-3 w-3 opacity-50" />
    </Button>
  )

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-card p-1.5 shadow-lg">
      <span className="px-2 text-sm font-medium text-foreground">{t('bulk.selected', { count: selectedIds.length })}</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>{menuBtn(<CircleDot className="h-4 w-4" />, t('bulk.status'))}</DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          {ALL_STATUSES.map((s: TicketStatus) => (
            <DropdownMenuItem key={s} onClick={() => apply({ status: s }, t('bulk.updated'))}>
              {STATUS_LABEL[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>{menuBtn(<UserPlus className="h-4 w-4" />, t('bulk.assign'))}</DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          <DropdownMenuItem onClick={() => apply({ assignedToId: null }, t('bulk.updated'))}>
            {t('drawer.unassigned')}
          </DropdownMenuItem>
          {members.map((m) => (
            <DropdownMenuItem key={m.userId} onClick={() => apply({ assignedToId: m.userId }, t('bulk.updated'))}>
              {m.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>{menuBtn(<Rocket className="h-4 w-4" />, t('bulk.sprint'))}</DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          <DropdownMenuItem onClick={() => apply({ sprintId: null }, t('bulk.updated'))}>{t('drawer.noSprint')}</DropdownMenuItem>
          {sprints.map((s) => (
            <DropdownMenuItem key={s.id} onClick={() => apply({ sprintId: s.id }, t('bulk.updated'))}>
              {s.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>{menuBtn(<Tag className="h-4 w-4" />, t('bulk.label'))}</DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          {labels.length === 0 && <DropdownMenuItem disabled>{t('bulk.noLabels')}</DropdownMenuItem>}
          {labels.map((l) => (
            <DropdownMenuItem key={l.id} onClick={() => apply({ addLabelIds: [l.id] }, t('bulk.updated'))}>
              <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
              {l.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant={confirmArchive ? 'destructive' : 'ghost'}
        size="sm"
        disabled={busy}
        className="gap-1.5"
        onClick={() => (confirmArchive ? void apply({ archived: true }, t('bulk.archived')) : setConfirmArchive(true))}
        onBlur={() => setConfirmArchive(false)}
      >
        <Archive className="h-4 w-4" />
        <span className="hidden sm:inline">{confirmArchive ? t('bulk.confirmArchive') : t('bulk.archive')}</span>
      </Button>

      <Button variant="ghost" size="sm" onClick={onClear} aria-label={t('bulk.clear')}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
