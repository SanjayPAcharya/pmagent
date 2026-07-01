// C4 — compact relative time ("2h ago"); the exact timestamp is shown on hover
// by the <RelativeTime> component via the `title` attribute.
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const WEEK = 7 * DAY

// `now` is injectable so callers (and tests) can avoid the Date.now() lint in
// other contexts; defaults to the real clock here in the browser.
export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = now - then
  if (diff < 0) return 'just now'
  if (diff < MIN) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`
  return new Date(iso).toLocaleDateString()
}

// Whole days from now until an ISO date (negative = past). null if no date.
export function daysUntil(iso?: string | null, now: number = Date.now()): number | null {
  if (!iso) return null
  const end = new Date(iso).getTime()
  if (Number.isNaN(end)) return null
  return Math.ceil((end - now) / 86_400_000)
}

// B5 — time-decay: a card's left border darkens the longer since `updatedAt`,
// a calm staleness signal (no nagging badge). Fresh cards show nothing.
export function staleBorderClass(iso: string, now: number = Date.now()): string {
  const days = (now - new Date(iso).getTime()) / 86_400_000
  if (Number.isNaN(days) || days < 2) return 'border-l-transparent'
  if (days < 7) return 'border-l-amber-300/40'
  if (days < 21) return 'border-l-amber-500/50'
  return 'border-l-amber-600/70'
}
