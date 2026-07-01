import { useSyncExternalStore } from 'react'

// Favorited project ids, shared across the tree rail and the project cards via a
// tiny external store so a star toggled in one place updates everywhere.
// Persisted to localStorage.
const KEY = 'agentpm-favorites'

function load(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

let favorites = load()
let snapshot: string[] = [...favorites]
const listeners = new Set<() => void>()

function emit() {
  snapshot = [...favorites]
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    // best-effort
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function toggleFavorite(id: string) {
  if (favorites.has(id)) favorites.delete(id)
  else favorites.add(id)
  emit()
}

/** Reactive boolean for a single project. */
export function useIsFavorite(id: string) {
  return useSyncExternalStore(
    subscribe,
    () => favorites.has(id),
    () => false,
  )
}

/** Reactive list of favorited ids. */
export function useFavorites() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  )
}
