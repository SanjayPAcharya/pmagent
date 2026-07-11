/**
 * Phase 3.8.1 A1 — offline AI eval harness.
 *
 *   pnpm --filter @agentpm/api ai:eval [--endpoint draft|expand|summary] [--model <id>] [--runs N]
 *
 * Calls BedrockProvider.generateDetailed() DIRECTLY — no HTTP, no Keycloak, no
 * Fastify plugin — against the real prompts in src/services/ai.prompts.ts and the
 * synthetic fixtures in scripts/ai-eval-fixtures.json, then scores each run and
 * writes release-doc/ai-eval-report.md.
 *
 * ⚠️ THIS SPENDS REAL BEDROCK TOKENS. It is deliberately NOT a vitest test and is
 *    never wired into CI (CI has no AWS credentials). Run it by hand when tuning.
 *
 * Env: needs AI_PROVIDER=bedrock + AWS creds + region. It self-loads sourcecode/.env
 * (tiny KEY=VALUE parser) for any of those absent from process.env, then hard-exits
 * with a clear message if AI is still not configured.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createBedrockProvider } from '../src/services/ai.service.js'
import {
  PROMPTS,
  PROMPT_VERSION,
  buildDraftUser,
  buildExpandUser,
  buildSummaryUser,
  type PromptEndpoint,
} from '../src/services/ai.prompts.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(HERE, '../../../.env') // sourcecode/.env
const FIXTURES_PATH = resolve(HERE, 'ai-eval-fixtures.json')
const REPORT_PATH = resolve(HERE, '../../../../release-doc/ai-eval-report.md') // repo-root/release-doc

// Approximate Bedrock prices (USD per 1M tokens) — REFRESH at run time; here only
// to print a ballpark. INR at ~83/USD. Keyed by a substring of the model id.
const PRICES: Array<{ match: string; inPer1M: number; outPer1M: number }> = [
  { match: 'nova-micro', inPer1M: 0.035, outPer1M: 0.14 },
  { match: 'nova-lite', inPer1M: 0.06, outPer1M: 0.24 },
  { match: 'nova-pro', inPer1M: 0.8, outPer1M: 3.2 },
  { match: 'haiku', inPer1M: 0.8, outPer1M: 4.0 },
]
const USD_TO_INR = 83

// ── args ──────────────────────────────────────────────────────────────────────
function parseArgs() {
  const a = process.argv.slice(2)
  const get = (flag: string) => {
    const i = a.indexOf(flag)
    return i >= 0 ? a[i + 1] : undefined
  }
  const endpoint = get('--endpoint') as PromptEndpoint | undefined
  if (endpoint && !(endpoint in PROMPTS)) {
    console.error(`--endpoint must be one of: ${Object.keys(PROMPTS).join(', ')}`)
    process.exit(1)
  }
  return {
    endpoint,
    model: get('--model'),
    runs: Math.max(1, Number(get('--runs') ?? 3)),
  }
}

// ── env self-load ───────────────────────────────────────────────────────────────
function loadEnvFile() {
  if (!existsSync(ENV_PATH)) return
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val // real env wins
  }
}

function assertConfigured() {
  const missing: string[] = []
  if ((process.env.AI_PROVIDER ?? '') !== 'bedrock') missing.push('AI_PROVIDER=bedrock')
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) missing.push('AWS_ACCESS_KEY_ID (or AWS_PROFILE)')
  if (!process.env.AWS_REGION) missing.push('AWS_REGION')
  if (missing.length) {
    console.error(
      `\nAI is not configured for the eval harness. Missing/incorrect: ${missing.join(', ')}.\n` +
        `Set them in sourcecode/.env (self-loaded) or the environment, then re-run.\n`,
    )
    process.exit(1)
  }
}

// ── fixture shapes + faithful user-text assembly ────────────────────────────────
// The builders come from ai.prompts.ts — the SAME functions the routes call, so the
// harness measures production's exact text (enrichment included). Fixtures carry
// synthetic enrichment (applied from the top-level `enrichment` block for draft/
// expand; per-fixture `sprintGoal` for summary) to measure the A3 lever.
interface DraftFx { id: string; kind: string; notes: string }
interface ExpandFx { id: string; kind: string; ticket: { title: string; description: string; acceptanceCriteria: string; goal: string; constraints: string }; prompt: string | null }
interface SummaryFx { id: string; kind: string; metrics: unknown; sprintGoal?: string | null }
interface Enrichment {
  draft?: { projectName?: string; recentTitles?: string[]; labels?: string[] }
  expand?: { parentTitle?: string; siblingTitles?: string[] }
}

function draftUser(fx: DraftFx, e: Enrichment): string {
  return buildDraftUser({ notes: fx.notes, ...e.draft })
}
function expandUser(fx: ExpandFx, e: Enrichment): string {
  return buildExpandUser({ ...fx.ticket, prompt: fx.prompt, ...e.expand })
}
function summaryUser(fx: SummaryFx): string {
  return buildSummaryUser({ metrics: fx.metrics, sprintGoal: fx.sprintGoal ?? null })
}

// ── scoring heuristics ──────────────────────────────────────────────────────────
const STOPWORDS = new Set(
  'the a an and or of to for in on with that this these those need needs should must will would could when then them they their there here from into over under about your user users work ticket'.split(
    ' ',
  ),
)
const wordsOf = (s: string): string[] => s.toLowerCase().match(/[a-z][a-z0-9']+/g) ?? []
const contentWords = (s: string): Set<string> => new Set(wordsOf(s).filter((w) => w.length >= 4 && !STOPWORDS.has(w)))

const VERB_START =
  /^(add|allow|block|cancel|clear|confirm|create|delete|disable|display|enable|ensure|expire|fail|filter|generate|handle|hide|include|limit|load|log|notify|open|persist|prevent|redirect|reject|remove|render|reset|retry|return|save|send|show|sort|store|submit|support|sync|update|upload|validate|verify|view)\b/i
const MEASURABLE =
  /\b(\d+|within|less than|greater than|at most|at least|exactly|equal|returns?|status|error|redirect|expires?|seconds?|minutes?|hours?|days?|ms|%|percent)\b/i
const acTestable = (b: string): boolean => VERB_START.test(b.trim()) || MEASURABLE.test(b)

/** Fraction of output content-words absent from the input — an invention smell (higher = worse). */
function inventedFraction(output: string, input: string): number {
  const out = contentWords(output)
  if (out.size === 0) return 0
  const inp = contentWords(input)
  let novel = 0
  for (const w of out) if (!inp.has(w)) novel++
  return novel / out.size
}

interface RunScore {
  ok: boolean
  error?: string
  attempts?: number
  ms?: number
  inputTokens?: number
  outputTokens?: number
  acCount?: number
  acTestableFrac?: number
  titleWords?: number
  inventedFrac?: number
  bullets?: number
  risks?: number
}

async function scoreOne(
  provider: ReturnType<typeof createBedrockProvider>,
  endpoint: PromptEndpoint,
  user: string,
): Promise<RunScore> {
  const { system, schema, zod } = PROMPTS[endpoint]
  try {
    const { value, meta } = await provider.generateDetailed({ system, user, schema, zod: zod as never })
    const base: RunScore = {
      ok: true,
      attempts: meta.attempts,
      ms: meta.ms,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
    }
    const v = value as Record<string, unknown>
    if (endpoint === 'draft' || endpoint === 'expand') {
      const ac = (v.acceptanceCriteria as string[]) ?? []
      base.acCount = ac.length
      base.acTestableFrac = ac.length ? ac.filter(acTestable).length / ac.length : 0
      const outputText = `${String(v.description ?? '')} ${ac.join(' ')} ${String(v.goal ?? '')}`
      base.inventedFrac = inventedFraction(outputText, user)
      if (endpoint === 'draft') base.titleWords = wordsOf(String(v.title ?? '')).length
    } else {
      base.bullets = ((v.bullets as string[]) ?? []).length
      base.risks = ((v.risks as string[]) ?? []).length
    }
    return base
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── aggregation + rendering ─────────────────────────────────────────────────────
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (n: number) => `${Math.round(n * 100)}%`
const r1 = (n: number) => Math.round(n * 10) / 10

interface FixtureAgg {
  id: string
  kind: string
  endpoint: PromptEndpoint
  runs: number
  errors: number
  valid1stFrac: number
  retryFrac: number
  ms: number
  inTok: number
  outTok: number
  acCount?: number
  acTestableFrac?: number
  titleWords?: number
  inventedFrac?: number
  bullets?: number
  risks?: number
}

function aggregate(id: string, kind: string, endpoint: PromptEndpoint, scores: RunScore[]): FixtureAgg {
  const ok = scores.filter((s) => s.ok)
  const num = (pick: (s: RunScore) => number | undefined) => ok.map(pick).filter((x): x is number => x != null)
  return {
    id,
    kind,
    endpoint,
    runs: scores.length,
    errors: scores.length - ok.length,
    valid1stFrac: ok.length ? ok.filter((s) => s.attempts === 1).length / ok.length : 0,
    retryFrac: ok.length ? ok.filter((s) => (s.attempts ?? 0) >= 2).length / ok.length : 0,
    ms: avg(num((s) => s.ms)),
    inTok: avg(num((s) => s.inputTokens)),
    outTok: avg(num((s) => s.outputTokens)),
    acCount: endpoint !== 'summary' ? avg(num((s) => s.acCount)) : undefined,
    acTestableFrac: endpoint !== 'summary' ? avg(num((s) => s.acTestableFrac)) : undefined,
    titleWords: endpoint === 'draft' ? avg(num((s) => s.titleWords)) : undefined,
    inventedFrac: endpoint !== 'summary' ? avg(num((s) => s.inventedFrac)) : undefined,
    bullets: endpoint === 'summary' ? avg(num((s) => s.bullets)) : undefined,
    risks: endpoint === 'summary' ? avg(num((s) => s.risks)) : undefined,
  }
}

function priceFor(model: string) {
  return PRICES.find((p) => model.includes(p.match))
}

function renderReport(model: string, runs: number, aggs: FixtureAgg[]): string {
  const totalIn = aggs.reduce((a, g) => a + g.inTok * g.runs, 0)
  const totalOut = aggs.reduce((a, g) => a + g.outTok * g.runs, 0)
  const price = priceFor(model)
  const usd = price ? (totalIn / 1e6) * price.inPer1M + (totalOut / 1e6) * price.outPer1M : null

  const lines: string[] = []
  lines.push(`# AI eval report`)
  lines.push('')
  lines.push(`- **Generated:** ${new Date().toISOString()}`)
  lines.push(`- **Model:** \`${model}\``)
  lines.push(`- **Prompt version:** ${PROMPT_VERSION}`)
  lines.push(`- **Runs per fixture:** ${runs}`)
  lines.push(`- **Fixtures:** ${aggs.length} (${aggs.reduce((a, g) => a + g.runs, 0)} generations)`)
  lines.push(
    `- **Tokens:** ${Math.round(totalIn)} in / ${Math.round(totalOut)} out` +
      (usd != null ? ` · **est. cost this run:** $${usd.toFixed(4)} (≈₹${(usd * USD_TO_INR).toFixed(2)})` : ''),
  )
  lines.push('')
  lines.push(
    `> Heuristic scores, not ground truth. **valid-1st** = passed zod on the first attempt (no corrective re-prompt). ` +
      `**retry** = one re-prompt fired. **AC-test** = fraction of acceptance criteria that look testable (verb-led or measurable). ` +
      `**invent** = fraction of output content-words absent from the input (a hallucination smell — high is bad on thin inputs). ` +
      `Prices in PRICES[] are approximate; refresh before quoting.`,
  )

  for (const ep of ['draft', 'expand', 'summary'] as PromptEndpoint[]) {
    const rows = aggs.filter((g) => g.endpoint === ep)
    if (!rows.length) continue
    lines.push('')
    lines.push(`## ${ep}`)
    lines.push('')
    if (ep === 'summary') {
      lines.push('| fixture | kind | valid-1st | retry | bullets | risks | ms | in-tok | out-tok |')
      lines.push('|---|---|---|---|---|---|---|---|---|')
      for (const g of rows) {
        lines.push(
          `| ${g.id} | ${g.kind} | ${pct(g.valid1stFrac)} | ${pct(g.retryFrac)} | ${r1(g.bullets ?? 0)} | ${r1(g.risks ?? 0)} | ${Math.round(g.ms)} | ${Math.round(g.inTok)} | ${Math.round(g.outTok)} |`,
        )
      }
    } else {
      const titleCol = ep === 'draft' ? ' title-words |' : ''
      const titleSep = ep === 'draft' ? '---|' : ''
      lines.push(`| fixture | kind | valid-1st | retry | AC | AC-test | invent |${titleCol} ms | in-tok | out-tok |`)
      lines.push(`|---|---|---|---|---|---|---|${titleSep}---|---|---|`)
      for (const g of rows) {
        const titleVal = ep === 'draft' ? ` ${r1(g.titleWords ?? 0)} |` : ''
        lines.push(
          `| ${g.id} | ${g.kind} | ${pct(g.valid1stFrac)} | ${pct(g.retryFrac)} | ${r1(g.acCount ?? 0)} | ${pct(g.acTestableFrac ?? 0)} | ${pct(g.inventedFrac ?? 0)} |${titleVal} ${Math.round(g.ms)} | ${Math.round(g.inTok)} | ${Math.round(g.outTok)} |`,
        )
      }
    }
  }
  lines.push('')
  return lines.join('\n')
}

// ── main ────────────────────────────────────────────────────────────────────────
async function main() {
  const { endpoint, model, runs } = parseArgs()
  loadEnvFile()
  assertConfigured()

  const modelId = model ?? process.env.BEDROCK_MODEL_ID ?? 'apac.amazon.nova-micro-v1:0'
  const provider = createBedrockProvider(modelId)

  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as {
    draft: DraftFx[]
    expand: ExpandFx[]
    summary: SummaryFx[]
    enrichment?: Enrichment
  }
  const enrichment: Enrichment = fixtures.enrichment ?? {}
  const endpoints: PromptEndpoint[] = endpoint ? [endpoint] : ['draft', 'expand', 'summary']

  const totalGenerations = endpoints.reduce((a, ep) => a + fixtures[ep].length * runs, 0)
  const price = priceFor(modelId)
  const roughUsd = price ? (totalGenerations * 1200 * price.inPer1M + totalGenerations * 350 * price.outPer1M) / 1e6 : null
  console.log(`\nAI eval — model=${modelId} promptVersion=${PROMPT_VERSION} runs=${runs}`)
  console.log(
    `Will make ${totalGenerations} real Bedrock generations` +
      (roughUsd != null ? ` — rough estimate ~$${roughUsd.toFixed(4)} (≈₹${(roughUsd * USD_TO_INR).toFixed(2)}).` : '.'),
  )
  console.log('Spending real tokens now…\n')

  const aggs: FixtureAgg[] = []
  for (const ep of endpoints) {
    for (const fx of fixtures[ep] as Array<DraftFx & ExpandFx & SummaryFx>) {
      const user =
        ep === 'draft'
          ? draftUser(fx, enrichment)
          : ep === 'expand'
            ? expandUser(fx, enrichment)
            : summaryUser(fx)
      const scores: RunScore[] = []
      for (let i = 0; i < runs; i++) {
        const s = await scoreOne(provider, ep, user)
        scores.push(s)
        process.stdout.write(s.ok ? '.' : 'x')
      }
      const g = aggregate(fx.id, fx.kind, ep, scores)
      aggs.push(g)
      const errs = g.errors ? ` (${g.errors} errors)` : ''
      console.log(` ${ep}/${fx.id}: valid1st=${pct(g.valid1stFrac)} ms=${Math.round(g.ms)}${errs}`)
    }
  }

  const report = renderReport(modelId, runs, aggs)
  writeFileSync(REPORT_PATH, report)
  console.log(`\nReport written to ${REPORT_PATH}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
