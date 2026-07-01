import { useEffect, useState } from 'react'

// Small JSON-backed localStorage state hook for UI prefs (density, tree
// expansion, rail collapse). Single-consumer; for cross-component shared state
// (favorites) use lib/favorites.ts instead.
export function useLocalStorageState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore quota/serialization errors — prefs are best-effort
    }
  }, [key, value])

  return [value, setValue] as const
}
