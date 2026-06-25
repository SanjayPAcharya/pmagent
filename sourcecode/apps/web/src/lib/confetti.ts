// G1 — a tiny dependency-free confetti burst, fired when a card hits DONE.
// No-ops under prefers-reduced-motion. Self-cleaning: the canvas is removed once
// every particle has fallen off-screen.
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6']

export function fireConfetti(): void {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999'
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  document.body.appendChild(canvas)

  const w = window.innerWidth
  const h = window.innerHeight
  // Launch from the upper-centre, fan outward.
  const particles = Array.from({ length: 90 }, () => {
    const angle = (Math.PI / 2) * (Math.random() - 0.5) - Math.PI / 2
    const speed = 6 + Math.random() * 7
    return {
      x: w / 2,
      y: h * 0.35,
      vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? -1 : 1) * 1.4,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
      life: 0,
    }
  })

  let raf = 0
  const start = performance.now()
  const tick = (now: number) => {
    const elapsed = now - start
    ctx.clearRect(0, 0, w, h)
    let alive = false
    for (const p of particles) {
      p.vy += 0.18 // gravity
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vrot
      p.life = elapsed
      if (p.y < h + 20) alive = true
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 1600)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    }
    if (alive && elapsed < 2000) {
      raf = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(raf)
      canvas.remove()
    }
  }
  raf = requestAnimationFrame(tick)
}
