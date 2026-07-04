import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FilePlus2, Zap } from 'lucide-react'
import { api, type AutomationSettings, type Project, type TicketTemplate } from '@/lib/api'
import { resolveAutomation } from '@/lib/automationSettings'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// 3.4 W1+W3 — board-header tools: "new from template" and the per-project
// automation toggles. Server enforces roles (templates: read MEMBER, write
// ADMIN; automation PATCH: ADMIN) — a denied toggle surfaces as a toast.
interface Props {
  orgId: string
  project: Project
  slug: string
  projectSlug: string
}

export function ProjectTools({ orgId, project, slug, projectSlug }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const templates = useQuery({ queryKey: ['templates', orgId], queryFn: () => api.listTemplates(orgId) })
  const labels = useQuery({ queryKey: ['labels', orgId], queryFn: () => api.listLabels(orgId) })

  const createFromTemplate = async (tpl: TicketTemplate) => {
    try {
      // Drop label refs that no longer exist in the org (loose references).
      const validLabelIds = tpl.labelIds.filter((id) => labels.data?.labels.some((l) => l.id === id))
      const { ticket } = await api.createTicket({
        projectId: project.id,
        title: tpl.title?.trim() || tpl.name,
        type: tpl.type,
        priority: tpl.priority,
        description: tpl.description ?? undefined,
        acceptanceCriteria: tpl.acceptanceCriteria ?? undefined,
        goal: tpl.goal ?? undefined,
        constraints: tpl.constraints ?? undefined,
        labelIds: validLabelIds.length ? validLabelIds : undefined,
      })
      qc.invalidateQueries({ queryKey: ['tickets', project.id] })
      toast.success(t('board.templateCreated', { key: ticket.key }))
      navigate(`/orgs/${slug}/projects/${projectSlug}/ticket/${ticket.number}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const setting = resolveAutomation(project.automation)
  const toggle = async (key: keyof AutomationSettings) => {
    try {
      await api.updateProject(project.id, { automation: { [key]: !setting[key] } })
      qc.invalidateQueries({ queryKey: ['projects', orgId] })
      toast.success(t('board.automationSaved'))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const iconBtn = 'rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={iconBtn} title={t('board.fromTemplate')} aria-label={t('board.fromTemplate')}>
            <FilePlus2 className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{t('board.fromTemplate')}</DropdownMenuLabel>
          {(templates.data?.templates ?? []).map((tpl) => (
            <DropdownMenuItem key={tpl.id} onClick={() => void createFromTemplate(tpl)}>
              <span className="mr-2 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">{tpl.type}</span>
              <span className="truncate">{tpl.name}</span>
            </DropdownMenuItem>
          ))}
          {templates.data && templates.data.templates.length === 0 && (
            <DropdownMenuItem disabled>{t('board.noTemplates')}</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={iconBtn} title={t('board.automation')} aria-label={t('board.automation')}>
            <Zap className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{t('board.automation')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={setting.unblockNudge} onCheckedChange={() => void toggle('unblockNudge')}>
            {t('board.autoUnblockNudge')}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={setting.autoTodoOnAssign} onCheckedChange={() => void toggle('autoTodoOnAssign')}>
            {t('board.autoTodoOnAssign')}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={setting.subtasksDoneNudge} onCheckedChange={() => void toggle('subtasksDoneNudge')}>
            {t('board.autoSubtasksDone')}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
