import { describe, it, expect } from 'vitest'
import { countSegments, segmentText, sliceSequential, stageAt, HINT_STAGES } from './aiReveal'

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

describe('sliceSequential', () => {
  const fields = ['one two', 'three', '']

  it('reveals fields strictly in order — a later field stays empty until the earlier ones finish', () => {
    expect(sliceSequential(fields, 0)).toEqual(['', '', ''])
    expect(sliceSequential(fields, 1)).toEqual(['one', '', ''])
    expect(sliceSequential(fields, 3)).toEqual(['one two', '', ''])
    expect(sliceSequential(fields, 4)).toEqual(['one two', 'three', ''])
  })

  it('is complete and stable at countSegments and beyond', () => {
    const total = countSegments(fields)
    expect(sliceSequential(fields, total)).toEqual(['one two', 'three', ''])
    expect(sliceSequential(fields, total + 100)).toEqual(['one two', 'three', ''])
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
