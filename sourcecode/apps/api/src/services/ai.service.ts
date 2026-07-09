import type { ZodType } from 'zod'
import { loadConfig } from '../config.js'
import { ApiError } from '../lib/errors.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3.8 — AI provider seam.
//
// This is the SINGLE future switch point for the product's AI tiers (owner
// strategy, see agentpm-plan/phases/phase-3.8-local-ai-tickets.md):
//   • v1  — self-hosted small model (OllamaProvider) = always-available baseline.
//   • 3.8.1 — BYOK: an org's own cloud key routes the *same* features through a
//             ClaudeProvider et al. Only `resolveProvider` changes; routes and UI
//             depend on the `AIProvider` interface alone and never learn which ran.
// AI is OPTIONAL infra (like REDIS_URL): no OLLAMA_BASE_URL → resolveProvider
// returns null → endpoints answer 503 AI_UNAVAILABLE and the UI disables buttons.
// ─────────────────────────────────────────────────────────────────────────────

/** A JSON Schema object handed to the model to constrain its output shape. */
export type JsonSchema = Record<string, unknown>

export interface GenerateOptions<T> {
  system: string
  user: string
  schema: JsonSchema // constrains the model (Ollama `format`)
  zod: ZodType<T> // validates + types the parsed result
}

export interface ProviderHealth {
  reachable: boolean
  modelReady: boolean
}

export interface AIProvider {
  readonly name: string
  generate<T>(opts: GenerateOptions<T>): Promise<T>
  health(): Promise<ProviderHealth>
}

/** Shape returned by GET /api/ai/health — drives the frontend's enabled/disabled state. */
export interface AIHealth {
  enabled: boolean
  reachable: boolean
  modelReady: boolean
  provider: string | null
}

// ── Ollama implementation ────────────────────────────────────────────────────

interface OllamaChatResponse {
  message?: { content?: string }
}

class OllamaProvider implements AIProvider {
  readonly name = 'ollama'
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async generate<T>({ system, user, schema, zod }: GenerateOptions<T>): Promise<T> {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]

    // First attempt, then ONE corrective re-prompt if the output doesn't parse/validate.
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1) {
        messages.push({
          role: 'user',
          content: `Your previous reply was not valid: ${lastError}. Return ONLY valid JSON matching the schema, with no prose, no markdown fences.`,
        })
      }
      const raw = await this.chat(messages, schema)
      try {
        return zod.parse(JSON.parse(raw))
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }
    throw new ApiError(502, `AI returned invalid output: ${lastError}`, 'AI_BAD_OUTPUT')
  }

  private async chat(messages: unknown[], schema: JsonSchema): Promise<string> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: schema,
          options: { temperature: 0.2, num_ctx: 4096 },
          messages,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new ApiError(504, 'AI request timed out', 'AI_TIMEOUT')
      }
      throw new ApiError(503, 'AI provider unreachable', 'AI_UNAVAILABLE')
    }
    if (!res.ok) throw new ApiError(503, `AI provider error (${res.status})`, 'AI_UNAVAILABLE')
    const body = (await res.json()) as OllamaChatResponse
    return body.message?.content ?? ''
  }

  async health(): Promise<ProviderHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return { reachable: false, modelReady: false }
      const body = (await res.json()) as { models?: { name?: string }[] }
      const wanted = this.model
      const modelReady = (body.models ?? []).some(
        (m) => m.name === wanted || m.name === `${wanted}:latest` || m.name?.split(':')[0] === wanted.split(':')[0],
      )
      return { reachable: true, modelReady }
    } catch {
      return { reachable: false, modelReady: false }
    }
  }
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * The single BYOK switch point. v1: returns the Ollama provider iff
 * OLLAMA_BASE_URL is set, else null (= AI disabled). Takes org context now so the
 * 3.8.1 BYOK phase only edits this function (org key present → cloud provider).
 */
export function resolveProvider(_orgId?: string): AIProvider | null {
  const { OLLAMA_BASE_URL, OLLAMA_MODEL, AI_TIMEOUT_MS } = loadConfig()
  if (!OLLAMA_BASE_URL) return null
  return new OllamaProvider(OLLAMA_BASE_URL, OLLAMA_MODEL, AI_TIMEOUT_MS)
}

/** Resolve or throw 503 — the common path for the three generation endpoints. */
export function requireProvider(orgId?: string): AIProvider {
  const provider = resolveProvider(orgId)
  if (!provider) throw new ApiError(503, 'AI is not enabled on this server', 'AI_UNAVAILABLE')
  return provider
}

export async function aiHealth(orgId?: string): Promise<AIHealth> {
  const provider = resolveProvider(orgId)
  if (!provider) return { enabled: false, reachable: false, modelReady: false, provider: null }
  const { reachable, modelReady } = await provider.health()
  return { enabled: true, reachable, modelReady, provider: provider.name }
}
