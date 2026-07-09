import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { assertOrgRole } from '../services/authz.js'
import { ApiError } from '../lib/errors.js'
import { aiHealth, requireProvider, type JsonSchema } from '../services/ai.service.js'

// Phase 3.8 — self-hosted AI drafting. All endpoints sit behind requireAuth and
// (for the generation routes) org-role checks; each generation is only ever a
// draft the same user reviews — no tool use, no auto-save (see phase spec §Prompt hygiene).

const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const

// ── A2: draft-ticket ─────────────────────────────────────────────────────────
const draftTicketBody = z.object({
  projectId: z.string().uuid(),
  notes: z.string().min(1).max(4000),
})
const draftTicketSchema: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    priority: { type: 'string', enum: [...PRIORITIES] },
  },
  required: ['title', 'description', 'acceptanceCriteria', 'priority'],
}
const draftTicketZod = z.object({
  title: z.string().min(1).max(200),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  priority: z.enum(PRIORITIES),
})

const DRAFT_SYSTEM = [
  'You are a senior product manager writing a single work ticket from rough notes.',
  'Be concrete and concise. Do NOT invent requirements the notes do not support.',
  'title: a short imperative summary (max ~12 words).',
  'description: 2–5 sentences of context and scope.',
  'acceptanceCriteria: 2–6 short, testable, outcome-focused bullet strings (no leading dash).',
  `priority: choose exactly one of ${PRIORITIES.join(', ')} based only on urgency implied by the notes.`,
  'Return ONLY JSON matching the schema — no prose, no markdown.',
].join('\n')

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
        system: DRAFT_SYSTEM,
        user: `Rough notes for the ticket:\n\n${notes}`,
        schema: draftTicketSchema,
        zod: draftTicketZod,
      })
      return { draft }
    },
  )
}

export default routes
