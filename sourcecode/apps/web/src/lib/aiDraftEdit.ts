import type { AITicketDraft, Priority } from './api'

// 3.8.1 B3 — pure logic behind the editable draft preview. The preview keeps a
// local working copy (edits + per-AC checkboxes); what you see is what Create
// submits, and regenerate only confirms when that copy has diverged.

export interface DraftEdits {
  title: string
  description: string
  priority: Priority
}

/** The draft Create submits: edited fields, unchecked AC bullets dropped. */
export function composeEditedDraft(base: AITicketDraft, edits: DraftEdits, checkedAC: boolean[]): AITicketDraft {
  return {
    // A blanked-out title falls back to the generated one — the create path
    // requires a title and the button shouldn't dead-end on an empty edit.
    title: edits.title.trim() || base.title,
    description: edits.description,
    priority: edits.priority,
    acceptanceCriteria: base.acceptanceCriteria.filter((_, i) => checkedAC[i] !== false),
  }
}

/** Dirty check driving the regenerate confirm — a pristine draft regenerates silently. */
export function isDraftEdited(base: AITicketDraft, edits: DraftEdits, checkedAC: boolean[]): boolean {
  return (
    edits.title !== base.title ||
    edits.description !== base.description ||
    edits.priority !== base.priority ||
    checkedAC.some((c) => !c)
  )
}
