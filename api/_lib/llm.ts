import { callAnthropicMessagesDetailed, resolveModel } from './anthropic.js'
import type { AnthropicContentBlock } from './anthropic.js'
import { callOpenAiResponses } from './openai.js'
import type { OpenAiUsage } from './openai.js'

export type LlmProvider = 'anthropic' | 'openai'
export type LlmErrorCode = 'upstream' | 'parse' | 'model'
/**
 * Only used for the one-line-per-request diagnostic log; the client always sees the coarse
 * LlmErrorCode above. quota/rate/auth/bad_request all collapse to 'upstream' for the client —
 * only 'model' gets its own client-facing code, per the "don't change what users see" rule.
 */
type LogTag = 'auth' | 'quota' | 'rate' | 'model' | 'bad_request' | 'upstream' | 'forced_fail'

export interface LlmImageInput {
  mimeType: string
  base64Data: string
}

export interface LlmCallParams {
  system: string
  user: string
  maxTokens: number
  /** Optional image to attach alongside `user` as vision input (e.g. Solve). Omitted entirely for text-only callers. */
  image?: LlmImageInput
  /** Try this provider first (e.g. an independent second opinion from the other provider). */
  preferProvider?: LlmProvider
  /** Use only this provider, never fall back to the other one (e.g. Audio Lesson is OpenAI-only). */
  onlyProvider?: LlmProvider
  /** OpenAI model id for this call instead of OPENAI_MODEL / the default. */
  openAiModel?: string
  /** Static instructions placed first with an explicit prompt-cache breakpoint (OpenAI); `system` is the variable rest. */
  cacheablePrefix?: string
  timeoutMs?: number
  /** Absolute time (ms since epoch) by which the whole call, fallback included, must be over: each
   * provider attempt gets at most what is left, and no attempt starts with almost nothing left. */
  deadlineAt?: number
  /** OpenAI reasoning effort for this call ("none", "low", ...); omitted = the model default. */
  reasoningEffort?: string
  /** Short label for the log line (e.g. "quiz-write"); counts only are logged, never content. */
  callType?: string
}

/** Token usage of one successful call, for cost logging. */
export interface LlmUsage extends OpenAiUsage {
  model: string
}

export type LlmResult =
  | { status: 'ok'; text: string; provider: LlmProvider; fallbackUsed: boolean; usage?: LlmUsage }
  | { status: 'error'; error: LlmErrorCode }
  | { status: 'not_configured' }

interface ProviderFailure {
  error: LlmErrorCode
  logTag: LogTag
  status: number | null
  errorType: string | null
  errorCode: string | null
}

type ProviderOutcome = ProviderFailure | { text: string; usage?: LlmUsage } | null

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

function classifyAnthropicFailure(status: number | null, errorType: string | null): LogTag {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate'
  if (status === 404 && errorType === 'not_found_error') return 'model'
  if (status === 400) return 'bad_request'
  return 'upstream'
}

function classifyOpenAiFailure(status: number | null, errorCode: string | null, modelRejected: boolean): LogTag {
  if (modelRejected) return 'model'
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) {
    if (errorCode === 'insufficient_quota' || errorCode === 'credit_balance_exhausted') return 'quota'
    return 'rate'
  }
  if (status === 400) return 'bad_request'
  return 'upstream'
}

/** The client-facing code stays coarse — only "model" gets its own message; everything else reads as a generic upstream failure. */
function toClientErrorCode(logTag: LogTag): LlmErrorCode {
  return logTag === 'model' ? 'model' : 'upstream'
}

async function callAnthropic(params: LlmCallParams): Promise<ProviderOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  if (isForcedToFail('anthropic')) {
    return { error: 'upstream', logTag: 'forced_fail', status: null, errorType: null, errorCode: null }
  }

  const model = resolveModel(DEFAULT_ANTHROPIC_MODEL)
  const effort = resolveAnthropicEffortConfig()
  const content: AnthropicContentBlock[] = params.image
    ? [
        { type: 'image', source: { type: 'base64', media_type: params.image.mimeType, data: params.image.base64Data } },
        { type: 'text', text: params.user },
      ]
    : [{ type: 'text', text: params.user }]
  const result = await callAnthropicMessagesDetailed({
    apiKey,
    model,
    maxTokens: params.maxTokens,
    system: params.cacheablePrefix ? `${params.cacheablePrefix}

${params.system}` : params.system,
    content,
    outputConfig: effort.outputConfig,
    thinking: effort.thinking,
    timeoutMs: params.timeoutMs,
  })

  if (!result.ok || result.text === null) {
    const logTag = classifyAnthropicFailure(result.status, result.errorType)
    return { error: toClientErrorCode(logTag), logTag, status: result.status, errorType: result.errorType, errorCode: null }
  }
  const usage = result.usage ? { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, cachedTokens: 0, cacheWriteTokens: 0, model } : undefined
  return { text: result.text, ...(usage ? { usage } : {}) }
}

async function callOpenAi(params: LlmCallParams): Promise<ProviderOutcome> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  if (isForcedToFail('openai')) {
    return { error: 'upstream', logTag: 'forced_fail', status: null, errorType: null, errorCode: null }
  }

  const model = params.openAiModel ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL
  const result = await callOpenAiResponses({
    apiKey,
    model,
    system: params.system,
    user: params.user,
    maxOutputTokens: params.maxTokens,
    image: params.image,
    cacheablePrefix: params.cacheablePrefix,
    timeoutMs: params.timeoutMs,
    reasoningEffort: params.reasoningEffort,
  })

  if (!result.ok || result.text === null) {
    const logTag = classifyOpenAiFailure(result.status, result.errorCode, result.modelRejected)
    return { error: toClientErrorCode(logTag), logTag, status: result.status, errorType: result.errorType, errorCode: result.errorCode }
  }
  return { text: result.text, ...(result.usage ? { usage: { ...result.usage, model } } : {}) }
}

const CALLERS: Record<LlmProvider, (params: LlmCallParams) => Promise<ProviderOutcome>> = {
  anthropic: callAnthropic,
  openai: callOpenAi,
}

/**
 * Tries each provider in order (env-decided, at most two), falling back on any failure.
 * Resolves to 'not_configured' when no provider has a key configured. Never throws.
 *
 * Logs exactly one line per request: provider, fallbackUsed, duration, and on failure the
 * internal error tag plus the upstream HTTP status and the provider's own error.type/error.code
 * (e.g. auth/quota/rate/model/bad_request) — enough to diagnose a failure from the log alone,
 * without ever logging keys, prompts, user text or generated questions.
 */
/** With a deadline, an attempt is only started when at least this much time is left. */
const MIN_ATTEMPT_MS = 4_000

export async function generateJson(params: LlmCallParams): Promise<LlmResult> {
  const start = Date.now()
  const resolved = resolveProviderOrder()
  const preferred = params.preferProvider
  const order = params.onlyProvider
    ? [params.onlyProvider]
    : (preferred && resolved.includes(preferred) ? [preferred, ...resolved.filter((p) => p !== preferred)] : resolved).slice(0, 2)

  let attempts = 0
  let expired = false
  let lastProvider: LlmProvider | null = null
  let lastFailure: ProviderFailure = { error: 'upstream', logTag: 'upstream', status: null, errorType: null, errorCode: null }

  for (const provider of order) {
    let attemptParams = params
    if (params.deadlineAt !== undefined) {
      const left = params.deadlineAt - Date.now()
      if (left < MIN_ATTEMPT_MS) {
        expired = true
        break
      } // out of time: report the last failure instead of starting a doomed attempt
      attemptParams = { ...params, timeoutMs: Math.min(params.timeoutMs ?? left, left) }
    }
    let outcome: ProviderOutcome
    try {
      outcome = await CALLERS[provider](attemptParams)
    } catch (error) {
      console.error('llm: unexpected error', error instanceof Error ? error.message : 'unknown')
      outcome = { error: 'upstream', logTag: 'upstream', status: null, errorType: null, errorCode: null }
    }

    if (outcome === null) continue // no key configured for this provider — not an attempt

    attempts += 1
    lastProvider = provider
    if ('error' in outcome) {
      lastFailure = outcome
      continue
    }

    const fallbackUsed = attempts > 1
    const usage = outcome.usage
    console.log(
      `llm: type=${params.callType ?? 'other'} provider=${provider} fallbackUsed=${fallbackUsed} duration=${Date.now() - start}ms effort=${params.reasoningEffort ?? 'default'} limit=${params.maxTokens} out=${usage?.outputTokens ?? '-'} reasoning=${usage?.reasoningTokens ?? '-'} truncated=${usage?.truncated === true} error=none`,
    )
    return { status: 'ok', text: outcome.text, provider, fallbackUsed, ...(outcome.usage ? { usage: outcome.usage } : {}) }
  }

  const duration = Date.now() - start
  if (attempts === 0 && !expired) {
    console.log(`llm: type=${params.callType ?? 'other'} provider=none fallbackUsed=false duration=${duration}ms error=not_configured`)
    return { status: 'not_configured' }
  }

  console.log(
    `llm: type=${params.callType ?? 'other'} provider=${lastProvider} fallbackUsed=${attempts > 1} duration=${duration}ms error=${lastFailure.logTag} status=${lastFailure.status} type=${lastFailure.errorType} code=${lastFailure.errorCode}`,
  )
  return { status: 'error', error: lastFailure.error }
}
