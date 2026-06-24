/** URL-safe slug from arbitrary text. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'item'
  )
}

/** Short uppercase project key (e.g. "Web App" → "WEBA"). Used for ticket ids (AGP-42). */
export function deriveKey(input: string): string {
  const base = input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  return base || 'PRJ'
}
