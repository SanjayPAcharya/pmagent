import { useEffect, useMemo, useState } from 'react'

// 3.8.1 B2 — presentation-only "streaming" reveal. The validated response is
// already complete when these hooks run (forced-tool JSON can't token-stream);
// they only pace how it appears, so cancelling/regenerating stays trivial.

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

/**
 * Whitespace-preserving segmentation: odd indices are the whitespace runs, so
 * `segments.slice(0, n).join('')` is always a faithful prefix (newlines kept).
 */
export function segmentText(text: string): string[] {
  if (!text) return []
  return text.split(/(\s+)/).filter((s) => s.length > 0)
}

/**
 * Word-by-word reveal of `text`. Starts when `enabled` flips true, restarts
 * when `text` changes, and completes instantly under prefers-reduced-motion.
 * `done` is the chaining signal (title → description → bullets).
 */
export function useTextReveal(
  text: string,
  opts: { enabled?: boolean; tickMs?: number; segmentsPerTick?: number } = {},
): { shown: string; done: boolean } {
  // ~2 words per 40ms tick (a word + its trailing whitespace = 2 segments).
  const { enabled = true, tickMs = 40, segmentsPerTick = 4 } = opts
  const segments = useMemo(() => segmentText(text), [text])
  const [n, setN] = useState(0)

  useEffect(() => setN(0), [text])
  useEffect(() => {
    if (!enabled || n >= segments.length) return
    if (prefersReducedMotion()) {
      setN(segments.length)
      return
    }
    const id = setTimeout(() => setN((v) => Math.min(v + segmentsPerTick, segments.length)), tickMs)
    return () => clearTimeout(id)
  }, [enabled, n, segments, tickMs, segmentsPerTick])

  return { shown: segments.slice(0, n).join(''), done: enabled && n >= segments.length }
}

/**
 * Staggered reveal of `total` list items once `start` is true; returns how many
 * are visible. Restarts when `total` changes (a regenerate swaps the list).
 */
export function useListReveal(total: number, start: boolean, intervalMs = 200): number {
  const [n, setN] = useState(0)

  useEffect(() => setN(0), [total])
  useEffect(() => {
    if (!start || n >= total) return
    if (prefersReducedMotion()) {
      setN(total)
      return
    }
    const id = setTimeout(() => setN((v) => Math.min(v + 1, total)), intervalMs)
    return () => clearTimeout(id)
  }, [start, n, total, intervalMs])

  return start ? n : 0
}

/**
 * Prefixes of each text after revealing `n` segments across all of them in
 * order — field 1 finishes before field 2 starts (the drawer auto-fill streams
 * description → goal → AC → constraints through this).
 */
export function sliceSequential(texts: string[], n: number): string[] {
  const out: string[] = []
  let remaining = Math.max(0, n)
  for (const text of texts) {
    const segments = segmentText(text)
    const take = Math.min(segments.length, remaining)
    out.push(segments.slice(0, take).join(''))
    remaining -= take
  }
  return out
}

/** Total reveal steps for a sliceSequential run over these texts. */
export function countSegments(texts: string[]): number {
  return texts.reduce((sum, t) => sum + segmentText(t).length, 0)
}

export const HINT_STAGES = ['ai.stage.reading', 'ai.stage.drafting', 'ai.stage.almost'] as const

/** Which staged hint applies after `elapsedMs` of generation (pure, testable). */
export function stageAt(elapsedMs: number): (typeof HINT_STAGES)[number] {
  if (elapsedMs >= 4000) return HINT_STAGES[2]
  if (elapsedMs >= 1500) return HINT_STAGES[1]
  return HINT_STAGES[0]
}

/**
 * Staged hint line while a generation is in flight ("Reading context…" →
 * "Writing…" → "Almost there…"); null when idle. The visible line must NOT sit
 * in an aria-live region (it would announce every stage) — pair it with a
 * separate sr-only start/done announcement.
 */
export function useStagedHint(active: boolean): (typeof HINT_STAGES)[number] | null {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (!active) {
      setStage(0)
      return
    }
    const t1 = setTimeout(() => setStage(1), 1500)
    const t2 = setTimeout(() => setStage(2), 4000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [active])

  return active ? HINT_STAGES[stage] : null
}
