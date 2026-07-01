import { useEffect, useRef, useState } from 'react'

// Depth-layered, animated backdrop for the Landing screen.
// - Desktop (fine pointer): layers drift with the cursor at different depths → parallax.
// - Touch / mobile (no pointer): a slow continuous float keeps it alive.
// - prefers-reduced-motion: everything holds still.
// Colors are theme-neutral translucent glows (read well on the light + dark token bg);
// the base wash + grid use the design tokens so they follow the theme.
const BLOBS = [
  { pos: 'left-[-8%] top-[-6%] h-[42vmax] w-[42vmax]', color: 'rgba(99,102,241,0.30)', depth: 34, name: 'float-a', dur: 16 },
  { pos: 'right-[-10%] top-[6%] h-[38vmax] w-[38vmax]', color: 'rgba(14,165,233,0.26)', depth: 22, name: 'float-b', dur: 20 },
  { pos: 'bottom-[-14%] left-[16%] h-[46vmax] w-[46vmax]', color: 'rgba(139,92,246,0.26)', depth: 46, name: 'float-c', dur: 24 },
]

export default function ParallaxBackground() {
  const ref = useRef<HTMLDivElement>(null)
  const [reduce] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const el = ref.current
    if (!el || reduce) return
    if (!window.matchMedia('(pointer: fine)').matches) return // touch: rely on the float only
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--px', String((e.clientX / window.innerWidth - 0.5) * 2)) // -1..1
        el.style.setProperty('--py', String((e.clientY / window.innerHeight - 0.5) * 2))
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [reduce])

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden [--px:0] [--py:0]">
      {/* base wash (themed) */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/50" />

      {/* colored depth glows — outer div = pointer parallax, inner = float animation */}
      {BLOBS.map((b) => (
        <div
          key={b.name}
          className={`absolute ${b.pos} transition-transform duration-300 ease-out will-change-transform`}
          style={{ transform: `translate3d(calc(var(--px) * ${b.depth}px), calc(var(--py) * ${b.depth}px), 0)` }}
        >
          <div
            className="h-full w-full rounded-full blur-3xl"
            style={{ background: b.color, animation: reduce ? undefined : `${b.name} ${b.dur}s ease-in-out infinite` }}
          />
        </div>
      ))}

      {/* faint grid, slight parallax, masked to a soft ellipse */}
      <div
        className="absolute inset-[-4px] opacity-30 transition-transform duration-300 ease-out dark:opacity-20"
        style={{
          transform: 'translate3d(calc(var(--px) * 8px), calc(var(--py) * 8px), 0)',
          backgroundImage:
            'linear-gradient(hsl(var(--border) / 0.7) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.7) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 45%, #000 25%, transparent 80%)',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 45%, #000 25%, transparent 80%)',
        }}
      />
    </div>
  )
}
