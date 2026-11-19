import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ShieldAlert, LogIn, Loader2 } from 'lucide-react'
import { login, onSessionExpired } from '../lib/auth'
import { Button } from './ui/button'

// 3.8.8 — full-screen "you've been signed out" prompt. A deliberate exception to
// the no-modal rule (BOARD decision 2): once signed out nothing on the page can
// be saved, so the only honest action is "Log in again". While it's up, the app
// behind it is inert (no clicks, no focus) and its keyboard shortcuts are muted.
export function SessionExpiredModal() {
  const [expired, setExpired] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { t } = useTranslation()

  useEffect(() => onSessionExpired(() => setExpired(true)), [])

  useEffect(() => {
    if (!expired) return
    const app = document.getElementById('root')
    app?.setAttribute('inert', '')
    buttonRef.current?.focus()

    // Capture phase on window runs before the app's document-level shortcuts
    // (⌘K, ?, board keys). Tab stays on the one button; Enter/Space press it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        buttonRef.current?.focus()
      } else if (e.key !== 'Enter' && e.key !== ' ') {
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      app?.removeAttribute('inert')
      window.removeEventListener('keydown', onKey, true)
    }
  }, [expired])

  if (!expired) return null

  // Portalled to <body>, outside #root, so it stays usable while #root is inert.
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-desc"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldAlert className="h-7 w-7 text-primary" aria-hidden="true" />
        </div>

        <h2 id="session-expired-title" className="mt-4 text-xl font-bold text-foreground">
          {t('auth.sessionExpiredTitle')}
        </h2>

        <p id="session-expired-desc" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t('auth.sessionExpiredBody')}
        </p>

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
      </div>
    </div>,
    document.body,
  )
}
