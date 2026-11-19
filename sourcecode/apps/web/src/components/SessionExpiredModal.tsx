import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldAlert, LogIn } from 'lucide-react'
import { login, onSessionExpired } from '../lib/auth'
import { Button } from './ui/button'

export function SessionExpiredModal() {
  const [expired, setExpired] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    return onSessionExpired(() => setExpired(true))
  }, [])

  if (!expired) return null

  const handleRelogin = () => {
    login()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-desc"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldAlert className="h-7 w-7 text-primary" />
        </div>

        <h2 id="session-expired-title" className="mt-4 text-xl font-bold text-foreground">
          {t('auth.sessionExpiredTitle')}
        </h2>

        <p id="session-expired-desc" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t('auth.sessionExpiredBody')}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Button onClick={handleRelogin} size="lg" className="w-full gap-2 font-medium">
            <LogIn className="h-4 w-4" />
            {t('auth.reloginButton')}
          </Button>
        </div>
      </div>
    </div>
  )
}
