// C2 — acceptance-criteria checklist. Parses GitHub-style task list lines
// ("- [ ] item" / "- [x] item") out of free-text AC so they can render as
// interactive checkboxes; toggling rewrites the source text (no backend — the
// state lives in the acceptanceCriteria markdown itself).
const ITEM_RE = /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/

export interface ChecklistItem {
  line: number // index into the source's split lines
  text: string
  checked: boolean
}

export function parseChecklist(source: string | null | undefined): {
  items: ChecklistItem[]
  done: number
  total: number
} {
  const items: ChecklistItem[] = []
  const lines = (source ?? '').split('\n')
  lines.forEach((l, i) => {
    const m = l.match(ITEM_RE)
    if (m) items.push({ line: i, text: m[3], checked: m[2].toLowerCase() === 'x' })
  })
  const done = items.filter((i) => i.checked).length
  return { items, done, total: items.length }
}

// Flip the checkbox on a given source line and return the new text.
export function toggleChecklistItem(source: string, line: number): string {
  const lines = source.split('\n')
  const m = lines[line]?.match(ITEM_RE)
  if (!m) return source
  const next = m[2].toLowerCase() === 'x' ? ' ' : 'x'
  lines[line] = lines[line].replace(/\[([ xX])\]/, `[${next}]`)
  return lines.join('\n')
}
