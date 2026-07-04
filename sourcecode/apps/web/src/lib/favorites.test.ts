import { describe, it, expect, beforeEach, vi } from 'vitest'

// The store loads localStorage at import time, so each test re-imports a fresh
// module copy after seeding storage.
const KEY = 'agentpm-favorites'

async function freshModule() {
  vi.resetModules()
  return import('./favorites')
}

describe('favorites store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('toggle adds then removes, persisting to localStorage', async () => {
    const { toggleFavorite } = await freshModule()
    toggleFavorite('p1')
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['p1'])
    toggleFavorite('p2')
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['p1', 'p2'])
    toggleFavorite('p1')
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['p2'])
  })

  it('hydrates existing favorites from localStorage', async () => {
    localStorage.setItem(KEY, JSON.stringify(['a', 'b']))
    const { toggleFavorite } = await freshModule()
    toggleFavorite('c')
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['a', 'b', 'c'])
  })

  it('survives corrupt storage', async () => {
    localStorage.setItem(KEY, 'not-json{')
    const { toggleFavorite } = await freshModule()
    toggleFavorite('x')
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['x'])
  })
})
