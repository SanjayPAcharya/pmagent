import { useQuery } from '@tanstack/react-query'
import { api, type AIHealth } from './api'

// 3.8 B1 — one shared health probe drives every AI button's enabled/disabled state.
// staleTime 60s so buttons across the app don't each re-fetch; a disabled server
// (503) still resolves to `{ enabled:false }` so the UI degrades gracefully.
export function useAIHealth() {
  return useQuery<AIHealth>({
    queryKey: ['ai-health'],
    queryFn: () => api.aiHealth(),
    staleTime: 60_000,
    retry: false,
  })
}

/** Derive the button state + a reason key from a health result. */
export function aiButtonState(health: AIHealth | undefined): {
  ready: boolean
  reasonKey: 'ai.unavailable' | 'ai.modelLoading' | null
} {
  if (!health || !health.enabled || !health.reachable) return { ready: false, reasonKey: 'ai.unavailable' }
  if (!health.modelReady) return { ready: false, reasonKey: 'ai.modelLoading' }
  return { ready: true, reasonKey: null }
}
