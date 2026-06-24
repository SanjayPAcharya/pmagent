import { useTranslation } from 'react-i18next'
import { login, register } from '../lib/auth'

export default function Landing() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-[360px] rounded-2xl border bg-card px-8 py-10 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('common.appName')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('landing.tagline')}</p>
        <div className="mt-8 space-y-3">
          <button
            onClick={() => login()}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('landing.signIn')}
          </button>
          <button
            onClick={() => register()}
            className="w-full rounded-lg border border-input px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            {t('landing.createAccount')}
          </button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">{t('landing.ssoNote')}</p>
      </div>
    </main>
  )
}
