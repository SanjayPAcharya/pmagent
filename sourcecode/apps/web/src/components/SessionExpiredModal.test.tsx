import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '../lib/i18n'

// 3.8.8 — the session-expired prompt: hidden until the bus fires, then focused,
// with the app behind it inert and its shortcuts muted (AC1, AC8).
vi.mock('keycloak-js', () => ({
  default: class {
    authenticated = false
    token: string | undefined = undefined
    updateToken = vi.fn()
    login = vi.fn(() => new Promise(() => {}))
    logout = vi.fn()
    register = vi.fn()
  },
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let auth: typeof import('../lib/auth')
let SessionExpiredModal: typeof import('./SessionExpiredModal').SessionExpiredModal
let app: HTMLDivElement
let root: Root

beforeEach(async () => {
  vi.resetModules()
  auth = await import('../lib/auth')
  ;({ SessionExpiredModal } = await import('./SessionExpiredModal'))
  app = document.createElement('div')
  app.id = 'root'
  document.body.appendChild(app)
  root = createRoot(app)
  act(() => root.render(<SessionExpiredModal />))
})

afterEach(() => {
  act(() => root.unmount())
  document.body.innerHTML = ''
})

const dialog = () => document.querySelector('[role="dialog"]')

describe('SessionExpiredModal (3.8.8)', () => {
  it('renders nothing until the session ends', () => {
    expect(dialog()).toBeNull()
    expect(app.hasAttribute('inert')).toBe(false)
  })

  it('shows the sentence-case prompt, focuses "Log in again" and makes the app inert', () => {
    auth.watchSession()
    act(() => auth.notifySessionExpired())

    expect(dialog()?.getAttribute('aria-modal')).toBe('true')
    expect(app.contains(dialog())).toBe(false) // portalled outside the inert #root
    expect(document.getElementById('session-expired-title')?.textContent).toBe('Session expired')
    expect(document.activeElement?.textContent).toBe('Log in again')
    expect(app.hasAttribute('inert')).toBe(true)
  })

  it("mutes the app's shortcuts while it is up", () => {
    const shortcut = vi.fn()
    document.addEventListener('keydown', shortcut)
    auth.watchSession()
    act(() => auth.notifySessionExpired())

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    expect(shortcut).not.toHaveBeenCalled()
    document.removeEventListener('keydown', shortcut)
  })

  it('"Log in again" starts the login and shows it is busy', () => {
    auth.watchSession()
    act(() => auth.notifySessionExpired())
    const button = document.activeElement as HTMLButtonElement

    act(() => button.click())
    expect(auth.keycloak.login).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(true)
  })

  it('releases the app when it unmounts', () => {
    auth.watchSession()
    act(() => auth.notifySessionExpired())
    act(() => root.unmount())
    expect(app.hasAttribute('inert')).toBe(false)
    root = createRoot(app) // afterEach unmounts again
  })
})
