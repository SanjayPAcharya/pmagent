import { useCallback, useSyncExternalStore } from 'react'

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

// Tiny shared store so every useTheme() consumer (header toggle, account page)
// sees the same value — a per-hook useState would leave the others stale.
let current: Theme = typeof window !== 'undefined' ? getInitialTheme() : 'system'
const listeners = new Set<() => void>()

export function setTheme(theme: Theme) {
  current = theme
  applyTheme(theme)
  listeners.forEach((l) => l())
}

// While in "system" mode, follow live OS changes.
if (typeof window !== 'undefined') {
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (current === 'system') applyTheme('system')
    })
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => 'system' as Theme,
  )
  // Cycle light → dark → system (used by the toggle button and the "t" shortcut).
  const cycle = useCallback(() => setTheme(current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light'), [])
  return { theme, cycle, setTheme }
}
