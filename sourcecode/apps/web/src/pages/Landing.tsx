import { useTranslation } from 'react-i18next'
import { login, register, loginWith } from '../lib/auth'
import Logo from '../components/Logo'
import ParallaxBackground from '../components/ParallaxBackground'
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <ParallaxBackground />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center gap-10 lg:flex-row lg:justify-between lg:gap-12">
        {/* Brand + product-defining tagline */}
        <div className="max-w-md text-center lg:text-left">
          <Logo className="mx-auto h-11 w-auto text-foreground lg:mx-0" />
          <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
            {t('landing.headline')}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">{t('landing.subtitle')}</p>
        </div>

        {/* Login card — translucent so the backdrop shows through */}
        <div className="w-full max-w-[380px] rounded-2xl border bg-card/80 px-8 py-10 text-center shadow-xl backdrop-blur-md">
          <h2 className="text-lg font-semibold text-foreground">{t('landing.signIn')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('landing.cardHint')}</p>

          <div className="mt-6 space-y-3">
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
      </div>
    </main>
  )
}
