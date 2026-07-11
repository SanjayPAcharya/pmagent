import { useQuery } from '@tanstack/react-query'
import { api, ApiError, type AIHealth } from './api'

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

// 3.8.1 B1 — map a caught generation failure to a truthful i18n key. Rate-limit
// (429) comes from @fastify/rate-limit and carries NO `code`, so it must be
// keyed on status BEFORE the `code` switch; anything unrecognised falls back to
// the generic message.
export function aiErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'ai.error.rateLimit'
    switch (err.code) {
      case 'AI_UNAVAILABLE':
        return 'ai.error.unavailable'
      case 'AI_TIMEOUT':
        return 'ai.error.timeout'
      case 'AI_BAD_OUTPUT':
        return 'ai.error.badOutput'
    }
  }
  return 'ai.failed'
}
