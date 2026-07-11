import type { ZodType } from 'zod'
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
} from '@aws-sdk/client-bedrock-runtime'
import { BedrockClient, GetInferenceProfileCommand } from '@aws-sdk/client-bedrock'
import { loadConfig } from '../config.js'
import { ApiError } from '../lib/errors.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3.8 — AI provider seam.
//
// This is the SINGLE future switch point for the product's AI tiers (owner
// strategy, see agentpm-plan/phases/phase-3.8-ai-tickets.md):
//   • v1  — Amazon Bedrock (BedrockProvider). Model is config: Nova Micro by
//           default; flip BEDROCK_MODEL_ID to a Claude global.* profile for
//           higher quality without touching routes or UI.
//   • 3.8.1 — BYOK: an org's own cloud key routes the *same* features. Only
//             `resolveProvider` changes; routes and UI depend on the `AIProvider`
//             interface alone and never learn which provider ran.
// AI is OPTIONAL (like REDIS_URL): empty AI_PROVIDER → resolveProvider returns
// null → endpoints answer 503 AI_UNAVAILABLE and the UI disables the buttons.
// ─────────────────────────────────────────────────────────────────────────────

/** A JSON Schema object handed to the model to constrain its output shape. */
export type JsonSchema = Record<string, unknown>

export interface GenerateOptions<T> {
  system: string
  user: string
  schema: JsonSchema // constrains the model (Bedrock tool `inputSchema.json`)
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

/**
 * Per-generation metadata — surfaced to the offline eval harness (A1) and the
 * seed for the A6 telemetry line. Not part of the request path: routes call
 * `generate()` and never see this.
 */
export interface GenerateMeta {
  attempts: number // 1 = valid first try; 2 = one corrective re-prompt fired
  ms: number
  inputTokens?: number
  outputTokens?: number
}
export interface GenerateResult<T> {
  value: T
  meta: GenerateMeta
}

/** Shape returned by GET /api/ai/health — drives the frontend's enabled/disabled state. */
export interface AIHealth {
  enabled: boolean
  reachable: boolean
  modelReady: boolean
  provider: string | null
}

// ── Bedrock implementation ───────────────────────────────────────────────────

const TOOL_NAME = 'emit_result'

class BedrockProvider implements AIProvider {
  readonly name = 'bedrock'
  private readonly runtime: BedrockRuntimeClient
  private readonly control: BedrockClient

  constructor(
    private readonly modelId: string,
    region: string,
    private readonly timeoutMs: number,
  ) {
    // Credentials come from the default AWS chain: env vars in dev
    // (AWS_ACCESS_KEY_ID/SECRET), the EC2 instance role in prod. Never in code.
    this.runtime = new BedrockRuntimeClient({ region })
    this.control = new BedrockClient({ region })
  }

  async generate<T>(opts: GenerateOptions<T>): Promise<T> {
    return (await this.generateDetailed(opts)).value
  }

  /**
   * Same generation path as `generate`, but returns attempts / latency / token
   * usage alongside the value. Used by the offline eval harness (A1) and seeds
   * A6 telemetry; the request path stays on the plain `generate`.
   */
  async generateDetailed<T>({ system, user, schema, zod }: GenerateOptions<T>): Promise<GenerateResult<T>> {
    const started = Date.now()
    let lastError = ''
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    // First attempt, then ONE corrective re-prompt if the tool input doesn't validate.
    // Each attempt is a fresh single-user-turn conversation (keeps role alternation
    // trivially valid); the corrective nudge is folded into the user text.
    for (let attempt = 0; attempt < 2; attempt++) {
      const text =
        attempt === 0
          ? user
          : `${user}\n\n(Your previous attempt produced invalid arguments: ${lastError}. Call ${TOOL_NAME} again with valid arguments that match the schema exactly.)`
      const { input, usage } = await this.converse(system, text, schema)
      // Accumulate tokens across attempts so the retry cost is visible.
      if (usage) {
        inputTokens = (inputTokens ?? 0) + (usage.inputTokens ?? 0)
        outputTokens = (outputTokens ?? 0) + (usage.outputTokens ?? 0)
      }
      try {
        const value = zod.parse(input)
        return { value, meta: { attempts: attempt + 1, ms: Date.now() - started, inputTokens, outputTokens } }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }
    throw new ApiError(502, `AI returned invalid output: ${lastError}`, 'AI_BAD_OUTPUT')
  }

  /**
   * One Converse call that forces the model to emit structured JSON via a single
   * tool whose inputSchema IS the endpoint's JSON schema. Returns the tool input
   * (already parsed, or null if no tool call came back → caller retries/502) plus
   * the response's token usage when the model reports it.
   */
  private async converse(
    system: string,
    userText: string,
    schema: JsonSchema,
  ): Promise<{ input: unknown; usage?: { inputTokens?: number; outputTokens?: number } }> {
    const messages: Message[] = [{ role: 'user', content: [{ text: userText }] }]
    const command = new ConverseCommand({
      modelId: this.modelId,
      system: [{ text: system }],
      messages,
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: TOOL_NAME,
              description: 'Return the result as structured data matching the schema.',
              // Bedrock validates the model's arguments against this schema.
              inputSchema: { json: schema as never },
            },
          },
        ],
        toolChoice: { tool: { name: TOOL_NAME } },
      },
      inferenceConfig: { temperature: 0.2 },
    })

    let output
    try {
      output = await this.runtime.send(command, { abortSignal: AbortSignal.timeout(this.timeoutMs) })
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new ApiError(504, 'AI request timed out', 'AI_TIMEOUT')
      }
      if (name === 'ThrottlingException') {
        throw new ApiError(503, 'AI provider is throttling', 'AI_UNAVAILABLE')
      }
      throw new ApiError(503, 'AI provider unavailable', 'AI_UNAVAILABLE')
    }

    const blocks: ContentBlock[] = output.output?.message?.content ?? []
    const toolUse = blocks.find((b): b is ContentBlock.ToolUseMember => 'toolUse' in b && !!b.toolUse)?.toolUse
    return {
      input: toolUse?.input ?? null,
      usage: output.usage
        ? { inputTokens: output.usage.inputTokens, outputTokens: output.usage.outputTokens }
        : undefined,
    }
  }

  async health(): Promise<ProviderHealth> {
    // Cheap control-plane call: confirms credentials + profile access without
    // spending tokens. Reachable-but-not-ready = AWS answered but the profile is
    // missing/denied (model access not enabled, wrong ID); unreachable = no creds
    // or network failure.
    try {
      await this.control.send(new GetInferenceProfileCommand({ inferenceProfileIdentifier: this.modelId }), {
        abortSignal: AbortSignal.timeout(5000),
      })
      return { reachable: true, modelReady: true }
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'ResourceNotFoundException' || name === 'AccessDeniedException' || name === 'ValidationException') {
        return { reachable: true, modelReady: false }
      }
      return { reachable: false, modelReady: false }
    }
  }
}

/**
 * Construct a Bedrock provider directly (region + timeout from config, model
 * overridable). Lets the offline eval harness (A1/A4 `--model`) build one without
 * the AI_PROVIDER gate or the Fastify plugin. Not used by the request path — that
 * goes through resolveProvider so BYOK stays the single switch point.
 */
export function createBedrockProvider(modelId?: string): BedrockProvider {
  const { BEDROCK_MODEL_ID, AWS_REGION, AI_TIMEOUT_MS } = loadConfig()
  return new BedrockProvider(modelId ?? BEDROCK_MODEL_ID, AWS_REGION, AI_TIMEOUT_MS)
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * The single BYOK switch point. v1: returns the Bedrock provider iff
 * AI_PROVIDER === 'bedrock', else null (= AI disabled). Takes org context now so
 * the 3.8.1 BYOK phase only edits this function (org key present → their provider).
 */
export function resolveProvider(_orgId?: string): AIProvider | null {
  const { AI_PROVIDER, BEDROCK_MODEL_ID, AWS_REGION, AI_TIMEOUT_MS } = loadConfig()
  if (AI_PROVIDER === 'bedrock') return new BedrockProvider(BEDROCK_MODEL_ID, AWS_REGION, AI_TIMEOUT_MS)
  return null
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
