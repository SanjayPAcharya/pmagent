// Opaque keyset cursors for list endpoints.
//
// We lean on Prisma's native cursor pagination: pass `cursor: { id }`, `skip: 1`,
// `take: limit + 1`, and an `orderBy` that ENDS with `id`. Because the final sort
// key is the unique id, the ordering is a total order, so even rows that tie on
// the primary sort column (e.g. shared `position`, equal `priority`) page without
// dropping or duplicating. The cursor therefore only needs to carry the last id;
// we still base64url-wrap it so clients treat it as opaque.

export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url')
}

export function decodeCursor(raw: string): string {
  const id = Buffer.from(raw, 'base64url').toString('utf8')
  // ids are uuids; reject anything that round-trips to junk
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid cursor')
  return id
}

/**
 * Slice a `take: limit + 1` result into a page + nextCursor. Fetching one extra
 * row tells us whether more exist without a second count query.
 */
export function paginate<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  if (rows.length > limit) {
    const items = rows.slice(0, limit)
    return { items, nextCursor: encodeCursor(items[items.length - 1].id) }
  }
  return { items: rows, nextCursor: null }
}

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 100
