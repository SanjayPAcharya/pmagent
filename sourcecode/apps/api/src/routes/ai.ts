import type { FastifyPluginAsync, FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { assertOrgRole } from '../services/authz.js'
import { ApiError } from '../lib/errors.js'
import { aiHealth, requireProvider, type AIProvider, type GenerateOptions } from '../services/ai.service.js'
import {
  PROMPTS,
  PROMPT_VERSION,
  buildDraftUser,
  buildExpandUser,
  buildSummaryUser,
  buildSprintGoalUser,
  type PromptEndpoint,
} from '../services/ai.prompts.js'
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
const sprintGoalBody = z.object({ sprintId: z.string().uuid() })

/** Cap a field so the whole context comfortably fits num_ctx (~4096 tokens). */
const cap = (s: string | null | undefined, n: number) => (s ?? '').slice(0, n)

/**
 * 3.8.1 A6 — run a generation through the seam and emit exactly ONE structured
 * telemetry line per attempt-set (no request-body logging). Gives A5 prod
 * evidence and makes Cost Explorer anomalies attributable to an endpoint/model/
 * prompt version. `outcome`: ok | retry_ok on success; bad_output | timeout |
 * unavailable | error on the mapped ApiError code.
 */
async function generateLogged<T>(
  log: FastifyBaseLogger,
  endpoint: PromptEndpoint,
  provider: AIProvider,
  opts: GenerateOptions<T>,
): Promise<T> {
  const started = Date.now()
  const base = { evt: 'ai.generate', endpoint, model: provider.model, promptVersion: PROMPT_VERSION }
  try {
    const { value, meta } = await provider.generateDetailed(opts)
    log.info({
      ...base,
      attempts: meta.attempts,
      ms: meta.ms,
      outcome: meta.attempts === 1 ? 'ok' : 'retry_ok',
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
    })
    return value
  } catch (err) {
    const code = err instanceof ApiError ? err.code : undefined
    const outcome =
      code === 'AI_BAD_OUTPUT' ? 'bad_output' : code === 'AI_TIMEOUT' ? 'timeout' : code === 'AI_UNAVAILABLE' ? 'unavailable' : 'error'
    log.warn({ ...base, ms: Date.now() - started, outcome })
    throw err
  }
}

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
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { orgId: true, name: true } })
      if (!project) throw new ApiError(404, 'Project not found')
      await assertOrgRole(request.userId!, project.orgId, 'MEMBER')

      // A3 enrichment: project name + up to 10 recent titles (naming-style anchor)
      // + the org's label vocabulary. Same org-role gate covers these reads.
      const [recent, labels] = await Promise.all([
        prisma.ticket.findMany({
          where: { projectId, archivedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: { title: true },
        }),
        prisma.label.findMany({ where: { orgId: project.orgId }, select: { name: true } }),
      ])

      const provider = requireProvider(project.orgId)
      const draft = await generateLogged(request.log, 'draft', provider, {
        ...PROMPTS.draft,
        user: buildDraftUser({
          notes,
          projectName: project.name,
          recentTitles: recent.map((t) => t.title),
          labels: labels.map((l) => l.name),
        }),
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
          projectId: true,
          parentId: true,
          parent: { select: { title: true } },
          project: { select: { orgId: true } },
        },
      })
      if (!ticket) throw new ApiError(404, 'Ticket not found')
      await assertOrgRole(request.userId!, ticket.project.orgId, 'MEMBER')

      // A3 enrichment: parent title + up to 5 sibling titles (same parent if this
      // ticket is a subtask, else the nearest tickets in the project).
      const siblings = await prisma.ticket.findMany({
        where: {
          projectId: ticket.projectId,
          id: { not: ticketId },
          archivedAt: null,
          ...(ticket.parentId ? { parentId: ticket.parentId } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { title: true },
      })

      const provider = requireProvider(ticket.project.orgId)
      const draft = await generateLogged(request.log, 'expand', provider, {
        ...PROMPTS.expand,
        user: buildExpandUser({
          title: ticket.title,
          description: ticket.description,
          acceptanceCriteria: ticket.acceptanceCriteria,
          goal: ticket.goal,
          constraints: ticket.constraints,
          prompt,
          parentTitle: ticket.parent?.title,
          siblingTitles: siblings.map((s) => s.title),
        }),
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

      // A3 enrichment: the active sprint's goal (OverviewActiveSprint doesn't carry
      // it — query the sprint directly rather than widening the overview type).
      const activeSprint = await prisma.sprint.findFirst({
        where: { projectId, status: 'ACTIVE' },
        select: { goal: true },
      })

      const provider = requireProvider(project.orgId)
      const draft = await generateLogged(request.log, 'summary', provider, {
        ...PROMPTS.summary,
        user: buildSummaryUser({ metrics, sprintGoal: activeSprint?.goal ?? null }),
      })
      return { summary: draft }
    },
  )

  // ── 3.8.3 S1: draft a sprint goal from its committed ticket titles (draft only) ──
  r.post(
    '/sprint-goal',
    {
      schema: { body: sprintGoalBody, tags: ['ai'] },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { sprintId } = request.body
      const sprint = await prisma.sprint.findUnique({
        where: { id: sprintId },
        select: {
          name: true,
          project: { select: { orgId: true } },
          tickets: { orderBy: { updatedAt: 'desc' }, take: 15, select: { title: true } },
        },
      })
      if (!sprint) throw new ApiError(404, 'Sprint not found')
      await assertOrgRole(request.userId!, sprint.project.orgId, 'MEMBER')

      const provider = requireProvider(sprint.project.orgId)
      const { goal } = await generateLogged(request.log, 'sprintGoal', provider, {
        ...PROMPTS.sprintGoal,
        user: buildSprintGoalUser({ sprintName: sprint.name, ticketTitles: sprint.tickets.map((t) => t.title) }),
      })
      return { goal }
    },
  )
}

export default routes
