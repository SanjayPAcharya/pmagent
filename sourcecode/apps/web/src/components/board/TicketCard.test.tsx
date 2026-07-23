import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TicketCardBody } from './TicketCard'
import type { Ticket } from '@/lib/api'

// U2 — the board card shows its sprint so "which cards are in the current
// sprint" is answerable at a glance. TicketCardBody is the pure visual (no dnd
// hooks), so it renders to static markup like EmptyState.
const base = {
  id: 't1',
  number: 1,
  key: 'NEW-1',
  title: 'Test ticket',
  status: 'TODO',
  priority: 'MEDIUM',
  labels: [],
  watcherIds: [],
  updatedAt: new Date().toISOString(),
  goal: null,
  acceptanceCriteria: null,
  constraints: null,
  blockedBy: 0,
  assignedTo: null,
} as unknown as Ticket

describe('TicketCardBody sprint chip (3.8.4 U2)', () => {
  it('renders the sprint name when provided', () => {
    const html = renderToStaticMarkup(<TicketCardBody ticket={base} sprintName="Sprint 1" sprintActive />)
    expect(html).toContain('Sprint 1')
  })

  it('renders no sprint chip when the ticket is not in a sprint', () => {
    const html = renderToStaticMarkup(<TicketCardBody ticket={base} />)
    expect(html).not.toContain('Sprint 1')
  })
})
