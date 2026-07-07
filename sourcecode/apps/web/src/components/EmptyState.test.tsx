import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Inbox } from 'lucide-react'
import { EmptyState } from './EmptyState'

// EmptyState is a pure presentational component (only pulls in `cn` + a lucide
// icon), so it renders to static markup without any Keycloak/api stubbing.
describe('EmptyState', () => {
  it('renders the icon + message, an optional cta, and a custom className', () => {
    const withoutCta = renderToStaticMarkup(<EmptyState icon={Inbox} message="Nothing here yet" />)
    expect(withoutCta).toContain('Nothing here yet') // message
    expect(withoutCta).toContain('<svg') // the lucide icon
    expect(withoutCta).not.toContain('mt-4') // no cta wrapper when cta is omitted

    const withCta = renderToStaticMarkup(
      <EmptyState icon={Inbox} message="Empty" cta={<button>Create one</button>} className="border-0 bg-transparent" />,
    )
    expect(withCta).toContain('Create one') // cta slot rendered
    expect(withCta).toContain('mt-4') // cta wrapper present
    expect(withCta).toContain('border-0') // custom className merged in
    expect(withCta).toContain('bg-transparent')
  })
})
