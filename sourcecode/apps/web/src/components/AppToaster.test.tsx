import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// 3.8.8 (Tester note, §8) — once the session-expired prompt is up, a failed
// save's raw "Unauthorized" toast must not show behind it.
vi.mock('keycloak-js', () => ({
  default: class {
    authenticated = false
    token: string | undefined = undefined
    updateToken = vi.fn()
    login = vi.fn()
    logout = vi.fn()
    register = vi.fn()
  },
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// sonner reads the colour scheme; jsdom has no matchMedia.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia

let auth: typeof import('@/lib/auth')
let toast: typeof import('sonner').toast
let host: HTMLDivElement
let root: Root

const toastArea = () => document.querySelector('section[aria-label^="Notifications"]')

beforeEach(async () => {
  vi.resetModules()
  auth = await import('@/lib/auth')
  ;({ toast } = await import('sonner'))
  const { AppToaster } = await import('./AppToaster')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<AppToaster />))
})

afterEach(() => {
  act(() => root.unmount())
  document.body.innerHTML = ''
})

describe('AppToaster (3.8.8)', () => {
  it('shows toasts while signed in', () => {
    expect(toastArea()).not.toBeNull()
  })

  it('switches toasts off once the session has ended, including ones raised after', () => {
    auth.watchSession()
    act(() => auth.notifySessionExpired())
    act(() => {
      toast.error('Unauthorized') // what a failed save would raise next
    })
    expect(toastArea()).toBeNull()
    expect(document.body.textContent).not.toContain('Unauthorized')
  })
})
