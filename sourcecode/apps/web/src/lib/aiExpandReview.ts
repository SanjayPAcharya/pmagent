import type { AIExpandDraft } from './api'

// 3.8.1 B4 — pure logic behind the auto-fill per-field review. Auto-fill now
// generates first, then shows current-vs-proposed per field so the user accepts
// or keeps each one; nothing overwrites blindly and nothing auto-saves.

export type ExpandFieldKey = 'description' | 'goal' | 'ac' | 'constraints'

export interface ExpandValues {
  description: string
  goal: string
  ac: string
  constraints: string
}

export interface ReviewField {
  key: ExpandFieldKey
  labelKey: string
  current: string
  proposed: string
  /** true = the field already has content the proposal would replace. */
  conflict: boolean
  /** proposals for empty fields are pre-accepted; conflicts default to keep-current. */
  defaultAccept: boolean
}

const LABEL_KEYS: Record<ExpandFieldKey, string> = {
  description: 'drawer.description',
  goal: 'drawer.goal',
  ac: 'drawer.acceptanceCriteria',
  constraints: 'drawer.constraints',
}

const ORDER: ExpandFieldKey[] = ['description', 'goal', 'ac', 'constraints']

/** The proposed value per field, in the textarea shapes the drawer uses (AC bulleted). */
export function proposedValues(draft: AIExpandDraft): ExpandValues {
  return {
    description: draft.description?.trim() ? draft.description : '',
    goal: draft.goal?.trim() ? draft.goal : '',
    ac: draft.acceptanceCriteria.length ? draft.acceptanceCriteria.map((x) => `- ${x}`).join('\n') : '',
    constraints: draft.constraints?.trim() ? draft.constraints : '',
  }
}

/**
 * Review rows — only fields the AI actually proposed something for (empty
 * proposals are skipped: nothing to accept, and accepting mustn't blank a field).
 */
export function buildReviewFields(current: ExpandValues, draft: AIExpandDraft): ReviewField[] {
  const proposed = proposedValues(draft)
  return ORDER.filter((key) => proposed[key] !== '').map((key) => {
    const conflict = current[key].trim() !== ''
    return { key, labelKey: LABEL_KEYS[key], current: current[key], proposed: proposed[key], conflict, defaultAccept: !conflict }
  })
}

/** Full accept record (all four keys) seeded from the rows' defaults. */
export function defaultAccepts(fields: ReviewField[]): Record<ExpandFieldKey, boolean> {
  const base: Record<ExpandFieldKey, boolean> = { description: false, goal: false, ac: false, constraints: false }
  for (const f of fields) base[f.key] = f.defaultAccept
  return base
}

/** Set every reviewable field's accept flag to `value` (non-reviewed keys stay false). */
export function setAllAccepts(fields: ReviewField[], value: boolean): Record<ExpandFieldKey, boolean> {
  const base: Record<ExpandFieldKey, boolean> = { description: false, goal: false, ac: false, constraints: false }
  for (const f of fields) base[f.key] = value
  return base
}

/** Final field values after applying the accept toggles (non-accepted keep current). */
export function composeAccepted(
  current: ExpandValues,
  draft: AIExpandDraft,
  accepted: Record<ExpandFieldKey, boolean>,
): ExpandValues {
  const proposed = proposedValues(draft)
  const pick = (key: ExpandFieldKey) => (accepted[key] && proposed[key] !== '' ? proposed[key] : current[key])
  return { description: pick('description'), goal: pick('goal'), ac: pick('ac'), constraints: pick('constraints') }
}
