import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Download, FileDown, Upload } from 'lucide-react'
import { api, type ImportTicketRow, type Priority, type Sprint, type Ticket, type TicketStatus, type TicketType } from '@/lib/api'
import { STATUS_LABEL } from '@/lib/board'
import { downloadCsv, parseCsv } from '@/lib/csv'
import { Button } from '@/components/ui/button'

// 3.4 W4 — CSV export of the current (filtered) list + preview-then-commit
// import with Jira-compatible header aliases.
const HEADER_ALIASES: Record<keyof ImportTicketRow, string[]> = {
  title: ['title', 'summary'],
  description: ['description'],
  status: ['status'],
  priority: ['priority'],
  type: ['type', 'issue type', 'issuetype'],
  storyPoints: ['story points', 'storypoints', 'points', 'estimate'],
  acceptanceCriteria: ['acceptance criteria', 'ac'],
}
const STATUS_MAP: Record<string, TicketStatus> = {
  backlog: 'BACKLOG', 'to do': 'TODO', todo: 'TODO', open: 'TODO',
  'in progress': 'IN_PROGRESS', in_progress: 'IN_PROGRESS',
  'in review': 'IN_REVIEW', in_review: 'IN_REVIEW', review: 'IN_REVIEW',
  blocked: 'BLOCKED', done: 'DONE', closed: 'DONE', resolved: 'DONE', cancelled: 'CANCELLED', canceled: 'CANCELLED',
}
const TYPE_MAP: Record<string, TicketType> = {
  feature: 'FEATURE', story: 'FEATURE', improvement: 'FEATURE',
  bug: 'BUG', defect: 'BUG',
  chore: 'CHORE', task: 'CHORE',
  spike: 'SPIKE', research: 'SPIKE',
}
const PRIORITY_SET = new Set(['URGENT', 'HIGH', 'MEDIUM', 'LOW'])

// Downloadable example of the accepted import format. Exercises the quirks on
// purpose: quoted commas, a multi-line acceptance-criteria cell, mixed
// Jira-style values ("To Do", "Story"), and optional cells left empty.
export const SAMPLE_CSV_ROWS: string[][] = [
  ['Title', 'Description', 'Status', 'Priority', 'Type', 'Story Points', 'Acceptance Criteria'],
  [
    'Set up the login page',
    'Users can sign in with email, or Google',
    'To Do',
    'High',
    'Feature',
    '3',
    '- [ ] Form validates the email\n- [ ] Errors are shown inline',
  ],
  ['Fix crash on save', 'The app crashes when saving an empty form', 'Backlog', 'Urgent', 'Bug', '2', ''],
  ['Update onboarding docs', '', 'In Progress', 'Low', 'Task', '1', ''],
]

export function mapRows(grid: string[][]): { rows: ImportTicketRow[]; skipped: number } {
  if (grid.length < 2) return { rows: [], skipped: 0 }
  const headers = grid[0].map((h) => h.trim().toLowerCase())
  const col = (field: keyof ImportTicketRow) => headers.findIndex((h) => HEADER_ALIASES[field].includes(h))
  const idx = {
    title: col('title'), description: col('description'), status: col('status'),
    priority: col('priority'), type: col('type'), storyPoints: col('storyPoints'),
    acceptanceCriteria: col('acceptanceCriteria'),
  }
  const rows: ImportTicketRow[] = []
  let skipped = 0
  for (const r of grid.slice(1)) {
    const title = idx.title >= 0 ? r[idx.title]?.trim() : ''
    if (!title) { skipped++; continue }
    const points = idx.storyPoints >= 0 ? Number(r[idx.storyPoints]) : NaN
    const prio = idx.priority >= 0 ? r[idx.priority]?.trim().toUpperCase() : ''
    rows.push({
      title: title.slice(0, 200),
      description: idx.description >= 0 && r[idx.description]?.trim() ? r[idx.description] : undefined,
      acceptanceCriteria: idx.acceptanceCriteria >= 0 && r[idx.acceptanceCriteria]?.trim() ? r[idx.acceptanceCriteria] : undefined,
      status: idx.status >= 0 ? STATUS_MAP[r[idx.status]?.trim().toLowerCase() ?? ''] : undefined,
      priority: PRIORITY_SET.has(prio) ? (prio as Priority) : undefined,
      type: idx.type >= 0 ? TYPE_MAP[r[idx.type]?.trim().toLowerCase() ?? ''] : undefined,
      storyPoints: Number.isInteger(points) && points > 0 ? points : undefined,
    })
  }
  return { rows: rows.slice(0, 500), skipped }
}

interface Props {
  projectId: string
  projectKey: string
  items: Ticket[]
  sprints: Sprint[]
}

export function CsvTools({ projectId, projectKey, items, sprints }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{ rows: ImportTicketRow[]; skipped: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const exportCsv = () => {
    const header = ['Key', 'Title', 'Status', 'Priority', 'Type', 'Assignee', 'Sprint', 'Points', 'Due', 'Labels', 'Updated']
    const rows = items.map((tk) => [
      tk.key, tk.title, STATUS_LABEL[tk.status], tk.priority, tk.type,
      tk.assignedTo?.name ?? '', sprints.find((s) => s.id === tk.sprintId)?.name ?? '',
      tk.storyPoints?.toString() ?? '', tk.dueDate?.slice(0, 10) ?? '',
      tk.labels.map((l) => l.name).join('; '), tk.updatedAt,
    ])
    downloadCsv(`${projectKey.toLowerCase()}-tickets.csv`, [header, ...rows])
  }

  const downloadSample = () => downloadCsv('pmagent-import-sample.csv', SAMPLE_CSV_ROWS)

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const text = await f.text()
    const mapped = mapRows(parseCsv(text))
    if (mapped.rows.length === 0) {
      toast.error(t('csv.nothingToImport'), { action: { label: t('csv.sample'), onClick: downloadSample } })
      return
    }
    setPreview(mapped)
  }

  const commit = async () => {
    if (!preview || busy) return
    setBusy(true)
    try {
      const { created } = await api.importTickets(projectId, preview.rows)
      toast.success(t('csv.imported', { count: created }))
      setPreview(null)
      qc.invalidateQueries({ queryKey: ['tickets', projectId] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={exportCsv} disabled={items.length === 0} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('csv.export')}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('csv.import')}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={downloadSample} title={t('csv.sampleHint')} className="gap-1.5">
          <FileDown className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('csv.sample')}</span>
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      {preview && (
        <div className="mb-4 w-full rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-foreground">
            {t('csv.previewTitle', { count: preview.rows.length })}
            {preview.skipped > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">{t('csv.skipped', { count: preview.skipped })}</span>
            )}
          </p>
          <ul className="mt-2 space-y-1">
            {preview.rows.slice(0, 5).map((r, i) => (
              <li key={i} className="truncate text-xs text-muted-foreground">
                • {r.title}
                {r.type && <span className="ml-1 rounded bg-muted px-1 text-[10px]">{r.type}</span>}
                {r.priority && <span className="ml-1 rounded bg-muted px-1 text-[10px]">{r.priority}</span>}
                {r.status && <span className="ml-1 rounded bg-muted px-1 text-[10px]">{STATUS_LABEL[r.status]}</span>}
              </li>
            ))}
            {preview.rows.length > 5 && (
              <li className="text-xs text-muted-foreground">{t('csv.andMore', { count: preview.rows.length - 5 })}</li>
            )}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => void commit()} disabled={busy}>
              {t('csv.confirmImport', { count: preview.rows.length })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
