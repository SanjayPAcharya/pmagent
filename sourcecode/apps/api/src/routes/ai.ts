import type { FastifyPluginAsync } from 'fastify'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAuth } from '../middleware/auth.middleware.js'
import { aiHealth } from '../services/ai.service.js'

// Phase 3.8 — self-hosted AI drafting. All endpoints sit behind requireAuth and
// (for the generation routes) org-role checks; each generation is only ever a
// draft the same user reviews — no tool use, no auto-save (see phase spec §Prompt hygiene).

const routes: FastifyPluginAsync = async (app) => {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', requireAuth)

  // ── Health — drives the frontend's enabled / disabled-with-reason state ──
  r.get('/health', { schema: { tags: ['ai'] } }, async () => aiHealth())
}

export default routes
