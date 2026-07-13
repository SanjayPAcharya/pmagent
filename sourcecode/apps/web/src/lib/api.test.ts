import { describe, it, expect } from 'vitest'
import { retryAfterMs } from './api'

// Rate-limit grace (2026-07-13) — the single silent GET retry waits for the
// server's Retry-After, clamped so a missing/garbled header can't stall (min 1s)
// and a huge one can't hang the UI (max 10s).
describe('retryAfterMs', () => {
  it('uses the server Retry-After seconds', () => {
    expect(retryAfterMs('3')).toBe(3000)
    expect(retryAfterMs('8')).toBe(8000)
  })

  it('clamps to the 1–10s band', () => {
    expect(retryAfterMs('0')).toBe(1000)
    expect(retryAfterMs('60')).toBe(10000)
  })

  it('falls back to 1s on a missing or garbled header', () => {
    expect(retryAfterMs(null)).toBe(1000)
    expect(retryAfterMs('soon')).toBe(1000)
    expect(retryAfterMs('-5')).toBe(1000)
  })
})
