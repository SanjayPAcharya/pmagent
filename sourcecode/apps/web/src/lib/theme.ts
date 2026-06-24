import { useEffect, useState } from 'react'

// Light/dark theme: persisted to localStorage, falling back to the OS preference.
// applyTheme is called once pre-render in main.tsx to avoid a flash of the wrong
// theme; the hook keeps it in sync and exposes a toggle.
export type Theme = 'light' | 'dark'
const KEY = 'agentpm-theme'

export function getInitialTheme(): Theme {
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem(KEY, theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  useEffect(() => applyTheme(theme), [theme])
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }
}
