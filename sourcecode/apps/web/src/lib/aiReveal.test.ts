import { describe, it, expect } from 'vitest'
import { segmentText, stageAt, HINT_STAGES } from './aiReveal'

// The reveal hooks are thin timers over these pure helpers — the correctness
// that matters (faithful prefixes, right hint at the right time) lives here.
describe('segmentText', () => {
  it('round-trips exactly, preserving newlines and multiple spaces', () => {
    const texts = ['one two  three', 'line one\nline two', '  leading and trailing  ', 'single']
    for (const text of texts) {
      expect(segmentText(text).join('')).toBe(text)
    }
  })

  it('yields faithful prefixes at every cut point (what useTextReveal renders)', () => {
    const text = 'Add retry logic\nto the sync job'
    const segments = segmentText(text)
    for (let n = 0; n <= segments.length; n++) {
      expect(text.startsWith(segments.slice(0, n).join(''))).toBe(true)
    }
  })

  it('returns no segments for empty text (reveal completes immediately)', () => {
    expect(segmentText('')).toEqual([])
  })
})

describe('stageAt', () => {
  it('advances reading → drafting → almost at 1.5s and 4s', () => {
    expect(stageAt(0)).toBe(HINT_STAGES[0])
    expect(stageAt(1499)).toBe(HINT_STAGES[0])
    expect(stageAt(1500)).toBe(HINT_STAGES[1])
    expect(stageAt(3999)).toBe(HINT_STAGES[1])
    expect(stageAt(4000)).toBe(HINT_STAGES[2])
  })
})
