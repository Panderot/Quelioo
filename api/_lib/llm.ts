import { callAnthropicMessagesDetailed, resolveModel } from './anthropic.js'
import { callOpenAiResponses } from './openai.js'

export type LlmProvider = 'anthropic' | 'openai'
export type LlmErrorCode = 'upstream' | 'parse' | 'model'
/** Only used for the one-line-per-request log; the client always sees the LlmErrorCode above ('auth' collapses to 'upstream'). */
type LogTag = LlmErrorCode | 'auth' | 'forced_fail'

export interface LlmCallParams {
  system: string
  user: string
  maxTokens: number
}

export type LlmResult =
  | { status: 'ok'; text: string; provider: LlmProvider; fallbackUsed: boolean }
  | { status: 'error'; error: LlmErrorCode }
  | { status: 'demo' }

type ProviderOutcome = { error: LlmErrorCode; logTag: LogTag } | { text: string } | null

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5'
const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna'
const ANTHROPIC_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

function resolveAnthropicEffortConfig(): { outputConfig?: { effort: string }; thinking?: { type: string } } {
  const raw = process.env.ANTHROPIC_EFFORT
  // Sonnet 5.5 has no "disabled" thinking mode (Anthropic's docs say to use between_tools
  // instead) — "off" maps to the lowest effort level plus between_tools, which skips
  // up-front thinking. This is the documented substitute, not a literal "thinking: off".
  if (raw === 'off') {
    return { outputConfig: { effort: 'low' }, thinking: { type: 'between_tools' } }
  }
  if (raw && ANTHROPIC_EFFORT_LEVELS.has(raw)) {
    return { outputConfig: { effort: raw } }
  }
  return { outputConfig: { effort: 'low' } }
}

function resolveProviderOrder(): LlmProvider[] {
  const override = process.env.LLM_PROVIDER_ORDER
  if (override) {
    const parsed = override
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry): entry is LlmProvider => entry === 'anthropic' || entry === 'openai')
    const deduped = [...new Set(parsed)]
    if (deduped.length > 0) return deduped
  }
  const isProduction = process.env.VERCEL_ENV === 'production'
  return isProduction ? ['anthropic', 'openai'] : ['openai', 'anthropic']
}

function isForcedToFail(provider: LlmProvider): boolean {
  if (process.env.VERCEL_ENV === 'production') return false
  return process.env.LLM_FORCE_FAIL === provider
}

async function callAnthropic(params: LlmCallParams): Promise<ProviderOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  if (isForcedToFail('anthropic')) {
    return { error: 'upstream', logTag: 'forced_fail' }
  }

  const model = resolveModel(DEFAULT_ANTHROPIC_MODEL)
  const effort = resolveAnthropicEffortConfig()
  const result = await callAnthropicMessagesDetailed({
    apiKey,
    model,
    maxTokens: params.maxTokens,
    system: params.system,
    content: [{ type: 'text', text: params.user }],
    outputConfig: effort.outputConfig,
    thinking: effort.thinking,
  })

  if (result.status === 401 || result.status === 403) {
    return { error: 'upstream', logTag: 'auth' }
  }
  if (!result.ok || result.text === null) {
    return { error: 'upstream', logTag: 'upstream' }
  }
  return { text: result.text }
}

async function callOpenAi(params: LlmCallParams): Promise<ProviderOutcome> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  if (isForcedToFail('openai')) {
    return { error: 'upstream', logTag: 'forced_fail' }
  }

  const model = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL
  const result = await callOpenAiResponses({
    apiKey,
    model,
    system: params.system,
    user: params.user,
    maxOutputTokens: params.maxTokens,
  })

  if (result.modelRejected) {
    return { error: 'model', logTag: 'model' }
  }
  if (result.status === 401 || result.status === 403) {
    return { error: 'upstream', logTag: 'auth' }
  }
  if (!result.ok || result.text === null) {
    return { error: 'upstream', logTag: 'upstream' }
  }
  return { text: result.text }
}

const CALLERS: Record<LlmProvider, (params: LlmCallParams) => Promise<ProviderOutcome>> = {
  anthropic: callAnthropic,
  openai: callOpenAi,
}

/** Tries each provider in order (env-decided, at most two), falling back on any failure. Resolves to 'demo' when no provider has a key configured. Never throws. Logs exactly one line per request — provider, fallbackUsed, duration, error code — and never logs keys, user text or generated questions. */
export async function generateJson(params: LlmCallParams): Promise<LlmResult> {
  const start = Date.now()
  const order = resolveProviderOrder().slice(0, 2)

  let attempts = 0
  let lastError: LlmErrorCode = 'upstream'
  let lastLogTag: LogTag = 'upstream'

  for (const provider of order) {
    let outcome: ProviderOutcome
    try {
      outcome = await CALLERS[provider](params)
    } catch (error) {
      console.error('llm: unexpected error', error instanceof Error ? error.message : 'unknown')
      outcome = { error: 'upstream', logTag: 'upstream' }
    }

    if (outcome === null) continue // no key configured for this provider — not an attempt

    attempts += 1
    if ('error' in outcome) {
      lastError = outcome.error
      lastLogTag = outcome.logTag
      continue
    }

    const fallbackUsed = attempts > 1
    console.log(`llm: provider=${provider} fallbackUsed=${fallbackUsed} duration=${Date.now() - start}ms error=none`)
    return { status: 'ok', text: outcome.text, provider, fallbackUsed }
  }

  const duration = Date.now() - start
  if (attempts === 0) {
    console.log(`llm: provider=demo fallbackUsed=false duration=${duration}ms error=none`)
    return { status: 'demo' }
  }

  console.log(`llm: provider=none fallbackUsed=${attempts > 1} duration=${duration}ms error=${lastLogTag}`)
  return { status: 'error', error: lastError }
}
