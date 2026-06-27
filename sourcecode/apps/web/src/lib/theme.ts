import { useCallback, useEffect, useState } from 'react'

// G2 — theme tristate: light / dark / system. Persisted to localStorage;
// "system" follows the OS and reacts live to OS changes. applyTheme runs once
// pre-render in main.tsx to avoid a flash of the wrong theme.
export type Theme = 'light' | 'dark' | 'system'
const KEY = 'agentpm-theme'

const systemPrefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

export function getInitialTheme(): Theme {
  const saved = localStorage.getItem(KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme
}

// Mirror the theme into a cookie so the Keycloak-hosted pages (a different origin)
// can match it — cookies are shared across ports on the same host (dev) and across
// subdomains when a parent domain is set (prod). The pmagent Keycloak theme reads it.
function writeThemeCookie(theme: Theme) {
  const host = location.hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || /^\d+(\.\d+){3}$/.test(host)
  const parts = host.split('.')
  const domain = isLocal || parts.length < 2 ? '' : `; domain=.${parts.slice(-2).join('.')}`
  document.cookie = `pmagent-theme=${theme}; path=/; max-age=31536000; samesite=lax${domain}`
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark')
  localStorage.setItem(KEY, theme)
  writeThemeCookie(theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  useEffect(() => applyTheme(theme), [theme])
  // While in "system" mode, follow live OS changes.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])
  // Cycle light → dark → system (used by the toggle button and the "t" shortcut).
  const cycle = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light')), [])
  return { theme, cycle, setTheme }
}
