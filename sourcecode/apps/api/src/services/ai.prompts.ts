import { z } from 'zod'
import type { JsonSchema } from './ai.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3.8.1 A1 — prompt registry.
//
// The 3 system prompts + 3 JSON schemas + 3 zod shapes that drive the AI
// endpoints, extracted verbatim from routes/ai.ts so the offline eval harness
// (scripts/ai-eval.ts) can import them WITHOUT booting the Fastify plugin, and
// so prompt tuning (A2) lives in one measured place. `routes/ai.ts` now imports
// these; the wording here is byte-for-byte what shipped in 3.8.
//
// PROMPT_VERSION: bump on ANY wording/schema change so eval scorecards and the
// A6 telemetry line are attributable to a specific prompt revision.
// ─────────────────────────────────────────────────────────────────────────────

export const PROMPT_VERSION = 1

export const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const

// ── draft-ticket ─────────────────────────────────────────────────────────────
export const draftTicketSchema: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
    priority: { type: 'string', enum: [...PRIORITIES] },
  },
  required: ['title', 'description', 'acceptanceCriteria', 'priority'],
}
export const draftTicketZod = z.object({
  title: z.string().min(1).max(200),
  description: z.string(),
  // .min(1): an empty list fails validation → the seam's one corrective re-prompt
  // fires with an explicit message. Small models (Nova Micro) otherwise omit AC on
  // thin input despite the prompt + schema minItems.
  acceptanceCriteria: z.array(z.string()).min(1),
  priority: z.enum(PRIORITIES),
})
export const DRAFT_SYSTEM = [
  'You are a senior product manager writing a single work ticket from rough notes.',
  'Be concrete and concise. Do NOT invent requirements the notes do not support.',
  'title: a short imperative summary (max ~12 words).',
  'description: 2–5 sentences of context and scope.',
  'acceptanceCriteria: 2–6 short, testable, outcome-focused bullet strings (no leading dash).',
  `priority: choose exactly one of ${PRIORITIES.join(', ')} based only on urgency implied by the notes.`,
  'Return ONLY JSON matching the schema — no prose, no markdown.',
].join('\n')

// ── expand-ticket ────────────────────────────────────────────────────────────
export const expandTicketSchema: JsonSchema = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
    goal: { type: 'string' },
    constraints: { type: 'string' },
  },
  required: ['description', 'acceptanceCriteria', 'goal', 'constraints'],
}
export const expandTicketZod = z.object({
  description: z.string(),
  // .min(1): see draftTicketZod — forces the corrective re-prompt if the model
  // returns an empty acceptanceCriteria (observed with Nova Micro on thin tickets).
  acceptanceCriteria: z.array(z.string()).min(1),
  goal: z.string(),
  constraints: z.string(),
})
export const EXPAND_SYSTEM = [
  'You are a senior product manager fleshing out an existing work ticket.',
  'Use the ticket context below; do NOT contradict its title or invent unrelated scope.',
  'description: a clear 2–5 sentence problem/scope statement.',
  'acceptanceCriteria: REQUIRED — always 2 to 6 short, testable bullet strings (no leading dash). Never return an empty list; if the ticket has none yet, derive them from its title, description, and intent.',
  'goal: one sentence — the outcome this ticket achieves.',
  'constraints: one or two sentences — technical or scope limits (empty string if none).',
  'Return ONLY JSON matching the schema — no prose, no markdown.',
].join('\n')

// ── project-summary ──────────────────────────────────────────────────────────
export const projectSummarySchema: JsonSchema = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'bullets', 'risks'],
}
export const projectSummaryZod = z.object({
  headline: z.string(),
  bullets: z.array(z.string()),
  risks: z.array(z.string()),
})
export const SUMMARY_SYSTEM = [
  'You are a senior product manager writing a short status digest for a stakeholder.',
  'Base everything ONLY on the metrics below — do not invent tickets, names, or dates.',
  'headline: one sentence capturing overall project health.',
  'bullets: 3–5 short strings of concrete progress/status (no leading dash).',
  'risks: 1–4 short strings naming real risks visible in the metrics (blockers, slipping milestones, imbalance); empty array if none.',
  'Return ONLY JSON matching the schema — no prose, no markdown.',
].join('\n')

// ── Registry — one entry per endpoint, for the eval harness to iterate ─────────
export const PROMPTS = {
  draft: { system: DRAFT_SYSTEM, schema: draftTicketSchema, zod: draftTicketZod },
  expand: { system: EXPAND_SYSTEM, schema: expandTicketSchema, zod: expandTicketZod },
  summary: { system: SUMMARY_SYSTEM, schema: projectSummarySchema, zod: projectSummaryZod },
} as const

export type PromptEndpoint = keyof typeof PROMPTS
