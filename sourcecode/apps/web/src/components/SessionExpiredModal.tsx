import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { ShieldAlert, LogIn, Loader2 } from 'lucide-react'
import { login, onSessionExpired } from '../lib/auth'
import { Button } from './ui/button'

// 3.8.8 — full-screen "you've been signed out" prompt. A deliberate exception to
// the no-modal rule (BOARD decision 2): once signed out nothing on the page can
// be saved, so the only honest action is "Log in again".
//
// Built on Radix Dialog, like the `?` help, so it stacks above any Radix layer
// that's already open (ticket drawer, ⌘K palette): Radix pauses that layer's
// focus trap, hides it from screen readers and blocks clicks on it. It can't be
// dismissed (no Esc, no outside click). On top of that:
// - everything else in <body> goes inert: the app (#root, toasts included) and
//   any portalled layer next to it, so nothing behind can take focus at all;
// - a capture-phase key guard mutes the app's document-level shortcuts (⌘K, ?,
//   board keys), so none of them can open a new layer above the inert ones;
// - a click anywhere else leaves focus on "Log in again".
export function SessionExpiredModal() {
  const [expired, setExpired] = useState(false)
  const [leaving, setLeaving] = useState(false)
  // Set once Radix has portalled the prompt into <body>; the lockdown waits for it.
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { t } = useTranslation()

  useEffect(() => onSessionExpired(() => setExpired(true)), [])

  useEffect(() => {
    if (!content) return
    const isPrompt = (el: Element) => el.matches('[data-session-expired]') || !!el.querySelector('[data-session-expired]')
    const others = [...document.body.children].filter((el) => !isPrompt(el) && !el.hasAttribute('inert'))
    others.forEach((el) => el.setAttribute('inert', ''))
    // Window capture runs before every document listener, Radix's included.
    // Tab (Radix loops it inside the prompt), Enter and Space still reach the button.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== ' ') e.stopPropagation()
    }
    // A click anywhere but the button (backdrop, card text) would drop focus to
    // <body>, where Enter does nothing. Keep it on "Log in again".
    const keepFocus = (e: MouseEvent) => {
      if (!buttonRef.current?.contains(e.target as Node)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', keepFocus, true)
    return () => {
      others.forEach((el) => el.removeAttribute('inert'))
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', keepFocus, true)
    }
  }, [content])

  const stay = (e: Event) => e.preventDefault()

  return (
    <Dialog.Root open={expired}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-session-expired=""
          className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        />
        <Dialog.Content
          ref={setContent}
          data-session-expired=""
          aria-modal="true"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            buttonRef.current?.focus()
          }}
          onEscapeKeyDown={stay}
          onPointerDownOutside={stay}
          onInteractOutside={stay}
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card p-6 text-center shadow-2xl focus:outline-none animate-in fade-in duration-200"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldAlert className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>

          <Dialog.Title className="mt-4 text-xl font-bold text-foreground">{t('auth.sessionExpiredTitle')}</Dialog.Title>

          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t('auth.sessionExpiredBody')}
          </Dialog.Description>

          <div className="mt-6 flex flex-col gap-3">
            <Button
              ref={buttonRef}
              onClick={() => {
                // login() navigates to Keycloak; it only settles if that fails.
                setLeaving(true)
                login().catch(() => setLeaving(false))
              }}
              disabled={leaving}
              size="lg"
              className="w-full gap-2 font-medium"
            >
              {leaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden="true" />
              )}
              {t('auth.reloginButton')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
