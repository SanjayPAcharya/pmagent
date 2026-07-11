import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { assertOrgRole } from '../services/authz.js'
import { ApiError } from '../lib/errors.js'
import { aiHealth, requireProvider } from '../services/ai.service.js'
import { PROMPTS } from '../services/ai.prompts.js'
import { projectOverview } from '../services/overview.service.js'

// Phase 3.8 — self-hosted AI drafting. All endpoints sit behind requireAuth and
// (for the generation routes) org-role checks; each generation is only ever a
// draft the same user reviews — no tool use, no auto-save (see phase spec §Prompt hygiene).
// 3.8.1 A1: the prompts/schemas/zod live in ../services/ai.prompts.ts (shared with
// the offline eval harness); this file only assembles per-request context + wiring.

// ── request-body validators (route input, not model prompts) ──────────────────
const draftTicketBody = z.object({
  projectId: z.string().uuid(),
  notes: z.string().min(1).max(4000),
})
const expandTicketBody = z.object({
  ticketId: z.string().uuid(),
  prompt: z.string().max(2000).optional(),
})
const projectSummaryBody = z.object({ projectId: z.string().uuid() })

/** Cap a field so the whole context comfortably fits num_ctx (~4096 tokens). */
const cap = (s: string | null | undefined, n: number) => (s ?? '').slice(0, n)

const routes: FastifyPluginAsync = async (app) => {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', requireAuth)

  // ── Health — drives the frontend's enabled / disabled-with-reason state ──
  r.get('/health', { schema: { tags: ['ai'] } }, async () => aiHealth())

  // ── A2: draft a ticket from rough notes (never creates it) ──
  r.post(
    '/draft-ticket',
    {
      schema: { body: draftTicketBody, tags: ['ai'] },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { projectId, notes } = request.body
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { orgId: true } })
      if (!project) throw new ApiError(404, 'Project not found')
      await assertOrgRole(request.userId!, project.orgId, 'MEMBER')

      const provider = requireProvider(project.orgId)
      const draft = await provider.generate({
        ...PROMPTS.draft,
        user: `Rough notes for the ticket:\n\n${notes}`,
      })
      return { draft }
    },
  )

  // ── A3: expand an existing ticket into fuller fields (draft only) ──
  r.post(
    '/expand-ticket',
    {
      schema: { body: expandTicketBody, tags: ['ai'] },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { ticketId, prompt } = request.body
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          title: true,
          description: true,
          acceptanceCriteria: true,
          goal: true,
          constraints: true,
          project: { select: { orgId: true } },
        },
      })
      if (!ticket) throw new ApiError(404, 'Ticket not found')
      await assertOrgRole(request.userId!, ticket.project.orgId, 'MEMBER')

      const context = [
        `Title: ${cap(ticket.title, 200)}`,
        `Current description: ${cap(ticket.description, 2000) || '(none)'}`,
        `Current acceptance criteria: ${cap(ticket.acceptanceCriteria, 1500) || '(none)'}`,
        `Current goal: ${cap(ticket.goal, 500) || '(none)'}`,
        `Current constraints: ${cap(ticket.constraints, 500) || '(none)'}`,
        prompt ? `\nAdditional direction from the user: ${prompt}` : '',
      ].join('\n')

      const provider = requireProvider(ticket.project.orgId)
      const draft = await provider.generate({
        ...PROMPTS.expand,
        user: context,
      })
      return { draft }
    },
  )

  // ── A4: project status digest (ephemeral — not persisted) ──
  r.post(
    '/project-summary',
    {
      schema: { body: projectSummaryBody, tags: ['ai'] },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { projectId } = request.body
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { orgId: true, name: true },
      })
      if (!project) throw new ApiError(404, 'Project not found')
      await assertOrgRole(request.userId!, project.orgId, 'MEMBER')

      // Reuse the overview aggregate — counts/sprint/blocker-titles/milestones only,
      // no full ticket descriptions (keeps the payload small and PII-light).
      const ov = await projectOverview(projectId)
      const metrics = {
        project: project.name,
        statusCounts: ov.status.byStatus,
        open: ov.status.open,
        done: ov.status.done,
        workstream: ov.status.byWorkstream,
        activeSprint: ov.activeSprint
          ? { name: ov.activeSprint.name, done: ov.activeSprint.done, total: ov.activeSprint.total, endDate: ov.activeSprint.endDate }
          : null,
        blockers: ov.blockers.map((b) => ({ key: b.key, title: cap(b.title, 120), openBlockers: b.openBlockerCount })),
        milestones: ov.milestones.map((m) => ({ name: m.name, date: m.date, readiness: m.readiness })),
        recentVelocityAvg: ov.capacity.recentVelocityAvg,
      }

      const provider = requireProvider(project.orgId)
      const draft = await provider.generate({
        ...PROMPTS.summary,
        user: `Project metrics (JSON):\n\n${JSON.stringify(metrics)}`,
      })
      return { summary: draft }
    },
  )
}

export default routes
