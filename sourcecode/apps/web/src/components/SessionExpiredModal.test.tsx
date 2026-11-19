import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '../lib/i18n'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from './ui/sheet'

// 3.8.8 — the session-expired prompt: hidden until the bus fires, then focused,
// undismissable, above any open drawer, with the app's shortcuts muted (AC1, AC8).
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

async function mount(extra?: ReactNode) {
  vi.resetModules()
  auth = await import('../lib/auth')
  ;({ SessionExpiredModal } = await import('./SessionExpiredModal'))
  app = document.createElement('div')
  app.id = 'root'
  document.body.appendChild(app)
  root = createRoot(app)
  act(() =>
    root.render(
      <>
        {extra}
        <SessionExpiredModal />
      </>,
    ),
  )
}

function expire() {
  auth.watchSession()
  act(() => auth.notifySessionExpired())
}

const prompt = () => document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')
const loginButton = () =>
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Log in again') as HTMLButtonElement
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    ;(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
  })

afterEach(() => {
  act(() => root.unmount())
  document.body.innerHTML = ''
})

describe('SessionExpiredModal (3.8.8)', () => {
  beforeEach(() => mount())

  it('renders nothing until the session ends', () => {
    expect(prompt()).toBeNull()
    expect(app.hasAttribute('inert')).toBe(false)
  })

  it('shows the sentence-case prompt, focuses "Log in again" and makes the app inert', () => {
    expire()
    const dialog = prompt()!
    expect(app.contains(dialog)).toBe(false) // portalled outside the inert #root
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Session expired')
    expect(document.activeElement).toBe(loginButton())
    expect(app.hasAttribute('inert')).toBe(true)
  })

  it("mutes the app's shortcuts and can't be dismissed with Esc", () => {
    const shortcut = vi.fn()
    document.addEventListener('keydown', shortcut)
    expire()
    press('k', { metaKey: true })
    press('?')
    press('Escape')
    expect(shortcut).not.toHaveBeenCalled()
    expect(prompt()).not.toBeNull()
    document.removeEventListener('keydown', shortcut)
  })

  it('keeps focus on "Log in again" when the backdrop or card is clicked', () => {
    expire()
    const backdrop = document.querySelector('[data-session-expired]:not([role="dialog"])')!
    const title = document.getElementById(prompt()!.getAttribute('aria-labelledby')!)!
    for (const target of [backdrop, title, document.body]) {
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      target.dispatchEvent(down)
      expect(down.defaultPrevented).toBe(true) // the browser won't move focus
    }
    const onButton = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    loginButton().dispatchEvent(onButton)
    expect(onButton.defaultPrevented).toBe(false)
  })

  it('"Log in again" starts the login and shows it is busy', () => {
    expire()
    act(() => loginButton().click())
    expect(auth.keycloak.login).toHaveBeenCalledTimes(1)
    expect(loginButton().disabled).toBe(true)
  })

  it('releases the page when it unmounts', () => {
    expire()
    act(() => root.unmount())
    expect(document.querySelector('[inert]')).toBeNull()
    root = createRoot(app) // afterEach unmounts again
  })
})

// Review finding #1: a ticket drawer (a Radix Sheet, portalled outside #root)
// that's open when the session ends must not keep focus away from the prompt.
describe('SessionExpiredModal over an open ticket drawer (3.8.8)', () => {
  beforeEach(() =>
    mount(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Ticket</SheetTitle>
          <SheetDescription>Drawer</SheetDescription>
          <input aria-label="Ticket title" />
        </SheetContent>
      </Sheet>,
    ),
  )

  const drawerInput = () => document.querySelector<HTMLInputElement>('input[aria-label="Ticket title"]')!

  it('takes focus from the drawer, and keeps it there', () => {
    act(() => drawerInput().focus())
    expect(document.activeElement).toBe(drawerInput())

    expire()
    expect(document.activeElement).toBe(loginButton())

    press('Tab')
    expect(document.activeElement).toBe(loginButton())
    press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(loginButton())

    // Something tries to put focus back in the drawer: the prompt's trap wins.
    act(() => drawerInput().focus())
    expect(document.activeElement).toBe(loginButton())
  })

  it('makes the drawer inert and hidden from screen readers, and keeps Esc from closing it', () => {
    expire()
    const drawer = drawerInput().closest('[role="dialog"]')!
    expect(drawer.closest('[inert]')).not.toBeNull()
    expect(drawer.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(prompt()!.closest('[inert]')).toBeNull()
    press('Escape')
    expect(drawerInput().isConnected).toBe(true)
    expect(prompt()).not.toBeNull()
  })
})
