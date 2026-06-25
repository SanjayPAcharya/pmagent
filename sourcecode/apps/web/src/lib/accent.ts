import { useEffect } from 'react'

// G2 — apply a per-org accent to the shadcn --primary token (which is stored as
// "H S% L%" and consumed via hsl(var(--primary))). Converting the org's hex to
// HSL lets it drive every primary surface (buttons, rings, progress bars).
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

// Set/clear --primary (+ --ring) from the org accent. Foreground stays white for
// contrast on typical mid-tone accents; light accents flip to dark text.
export function useOrgAccent(accentColor: string | null | undefined) {
  useEffect(() => {
    const root = document.documentElement
    const hsl = accentColor ? hexToHsl(accentColor) : null
    if (!hsl) {
      root.style.removeProperty('--primary')
      root.style.removeProperty('--primary-foreground')
      root.style.removeProperty('--ring')
      return
    }
    const value = `${hsl.h} ${hsl.s}% ${hsl.l}%`
    root.style.setProperty('--primary', value)
    root.style.setProperty('--ring', value)
    root.style.setProperty('--primary-foreground', hsl.l > 65 ? '222 47% 11%' : '0 0% 100%')
    return () => {
      root.style.removeProperty('--primary')
      root.style.removeProperty('--primary-foreground')
      root.style.removeProperty('--ring')
    }
  }, [accentColor])
}
