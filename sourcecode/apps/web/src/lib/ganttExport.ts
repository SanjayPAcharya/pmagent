// FEAT-2 — Timeline export helpers. PNG (serialize the live SVG, inline the
// theme's CSS variables so the picture matches on-screen, rasterize to a canvas)
// and an Excel-compatible CSV of the visible rows. No external libraries — the
// artifact CSP and our bundle both stay lean.
import type { GanttItem } from './api'

// The CSS custom properties the Gantt SVG references via `hsl(var(--x))`. They
// don't resolve inside a standalone <img>, so we substitute the live values.
export const GANTT_CSS_VARS = [
  'background',
  'card',
  'border',
  'destructive',
  'foreground',
  'muted',
  'muted-foreground',
  'primary',
  'ring',
] as const

/** Pure: replace every `var(--name)` in an SVG string using the provided map. */
export function applyGanttVarMap(svg: string, vars: Record<string, string>): string {
  let out = svg
  for (const [name, value] of Object.entries(vars)) {
    if (value) out = out.split(`var(--${name})`).join(value)
  }
  return out
}

/** Read the Gantt CSS vars off the live document root. */
export function readGanttVars(): Record<string, string> {
  const root = getComputedStyle(document.documentElement)
  const out: Record<string, string> = {}
  for (const name of GANTT_CSS_VARS) out[name] = root.getPropertyValue(`--${name}`).trim()
  return out
}

/**
 * Rasterize a Gantt <svg> to a PNG and trigger a download. Clones the node,
 * paints a solid (theme card) background behind it (SVGs are transparent), inlines
 * the CSS vars, then draws it onto a 2× canvas.
 */
export async function exportGanttPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const width = svg.width.baseVal.value || Number(svg.getAttribute('width')) || svg.clientWidth
  const height = svg.height.baseVal.value || Number(svg.getAttribute('height')) || svg.clientHeight

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const vars = readGanttVars()
  const bg = vars.card || vars.background || '0 0% 100%'
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('width', String(width))
  rect.setAttribute('height', String(height))
  rect.setAttribute('fill', `hsl(${bg})`)
  clone.insertBefore(rect, clone.firstChild)

  const resolved = applyGanttVarMap(new XMLSerializer().serializeToString(clone), vars)
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(resolved)}`

  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to render the timeline image'))
    img.src = src
  })

  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0)

  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = filename
  a.click()
}

export interface GanttCsvLookups {
  memberName: Record<string, string>
  sprintName: Record<string, string>
  milestoneName: Record<string, string>
}

/** Pure: the visible timeline rows as a CSV matrix (header + one row per ticket). */
export function ganttRowsToCsv(items: GanttItem[], lk: GanttCsvLookups): string[][] {
  const header = ['Key', 'Title', 'Status', 'Priority', 'Assignee', 'Start', 'Due', 'Story Points', 'Sprint', 'Milestone', 'Workstream']
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
  const rows = items.map((it) => [
    it.key,
    it.title,
    it.status,
    it.priority,
    it.assignedToId ? lk.memberName[it.assignedToId] ?? '' : '',
    day(it.startDate),
    day(it.dueDate),
    it.storyPoints != null ? String(it.storyPoints) : '',
    it.sprintId ? lk.sprintName[it.sprintId] ?? '' : '',
    it.milestoneId ? lk.milestoneName[it.milestoneId] ?? '' : '',
    it.workstream,
  ])
  return [header, ...rows]
}
