import { useTranslation } from 'react-i18next'
import { login, register, loginWith } from '../lib/auth'
import Logo from '../components/Logo'
import { GoogleIcon, MicrosoftIcon, GithubIcon } from '../components/ProviderIcons'

export default function Landing() {
  const { t } = useTranslation()

  // Social sign-in goes straight to the provider via idpHint (no Keycloak page).
  const social = [
    { idp: 'google' as const, label: t('landing.continueGoogle'), Icon: GoogleIcon },
    { idp: 'microsoft' as const, label: t('landing.continueMicrosoft'), Icon: MicrosoftIcon },
    { idp: 'github' as const, label: t('landing.continueGithub'), Icon: GithubIcon },
  ]

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-[380px] rounded-2xl border bg-card px-8 py-10 text-center shadow-sm">
        <h1 className="flex justify-center text-foreground">
          <Logo className="h-10 w-auto" />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('landing.tagline')}</p>

        <div className="mt-8 space-y-3">
          {social.map(({ idp, label, Icon }) => (
            <button
              key={idp}
              onClick={() => loginWith(idp)}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('landing.or')}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Email/password is handled on the PMAgent-branded Keycloak page. */}
        <div className="space-y-3">
          <button
            onClick={() => login()}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('landing.signInEmail')}
          </button>
          <button
            onClick={() => register()}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t('landing.createAccount')}
          </button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">{t('landing.ssoNote')}</p>
      </div>
    </main>
  )
}
