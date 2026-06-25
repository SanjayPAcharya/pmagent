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

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark')
  localStorage.setItem(KEY, theme)
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
