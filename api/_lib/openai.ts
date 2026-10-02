import { isRecord } from './anthropic.js'

const UPSTREAM_TIMEOUT_MS = 25000

export interface OpenAiUsage {
  inputTokens: number
  outputTokens: number
  /** usage.input_tokens_details.cached_tokens — input served from the prompt cache. */
  cachedTokens: number
  /** usage.input_tokens_details.cache_write_tokens — input written to the prompt cache. */
  cacheWriteTokens: number
}

export interface CallOpenAiResponsesParams {
  apiKey: string
  model: string
  system: string
  user: string
  maxOutputTokens: number
  /** Optional image to attach as vision input, alongside `user` as text. */
  image?: { mimeType: string; base64Data: string }
  /** Long static instructions sent first, as a developer message with an explicit prompt-cache
   * breakpoint, so repeated calls reuse the cached prefix; `system` then follows as a second
   * developer message (the variable part). */
  cacheablePrefix?: string
  timeoutMs?: number
  /** Responses API reasoning.effort (e.g. "low"); omitted means the model default. */
  reasoningEffort?: string
}

export interface OpenAiCallResult {
  ok: boolean
  status: number | null
  text: string | null
  usage: OpenAiUsage | null
  /** True only when the provider rejected the request specifically because the model id is unknown/unavailable. */
  modelRejected: boolean
  /** OpenAI's error.type (e.g. "invalid_request_error", "rate_limit_error") — null on success or an unparseable body. */
  errorType: string | null
  /** OpenAI's error.code (e.g. "invalid_api_key", "insufficient_quota", "model_not_found") — null when absent. */
  errorCode: string | null
}

/** POSTs a single-turn request to the OpenAI Responses API and returns the model's text reply, or a failure with enough detail for the fallback layer to decide what to do next. */
export async function callOpenAiResponses(params: CallOpenAiResponsesParams): Promise<OpenAiCallResult> {
  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), params.timeoutMs ?? UPSTREAM_TIMEOUT_MS)

  const userInput = params.image
    ? [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: params.user },
            { type: 'input_image', image_url: `data:${params.image.mimeType};base64,${params.image.base64Data}` },
          ],
        },
      ]
    : params.user

  const prompt = params.cacheablePrefix
    ? {
        // Only the static prefix is written to the cache; the implicit end-of-prompt breakpoint would
        // bill the whole variable prompt as a cache write (1.25x) on every call.
        prompt_cache_options: { mode: 'explicit' },
        input: [
          {
            role: 'developer',
            content: [{ type: 'input_text', text: params.cacheablePrefix, prompt_cache_breakpoint: { mode: 'explicit' } }],
          },
          { role: 'developer', content: [{ type: 'input_text', text: params.system }] },
          ...(typeof userInput === 'string' ? [{ role: 'user', content: [{ type: 'input_text', text: userInput }] }] : userInput),
        ],
      }
    : { instructions: params.system, input: userInput }

  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        ...prompt,
        ...(params.reasoningEffort ? { reasoning: { effort: params.reasoningEffort } } : {}),
        max_output_tokens: params.maxOutputTokens,
      }),
      signal: timeoutController.signal,
    })
  } catch {
    return { ok: false, status: null, text: null, usage: null, modelRejected: false, errorType: null, errorCode: null }
  } finally {
    clearTimeout(timeout)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, status: response.status, text: null, usage: null, modelRejected: false, errorType: null, errorCode: null }
  }

  if (!response.ok) {
    const { errorType, errorCode, param } = extractError(payload)
    const modelRejected = isModelRejection(response.status, errorCode, param)
    return { ok: false, status: response.status, text: null, usage: null, modelRejected, errorType, errorCode }
  }

  return {
    ok: true,
    status: response.status,
    // A reply cut off by max_output_tokens (e.g. all spent on reasoning) reads as empty text, so the
    // JSON layer retries it with a higher limit instead of treating it as a provider failure.
    text: extractOutputText(payload) ?? (isRecord(payload) && payload.status === 'incomplete' ? '' : null),
    usage: extractUsage(payload),
    modelRejected: false,
    errorType: null,
    errorCode: null,
  }
}

function extractError(payload: unknown): { errorType: string | null; errorCode: string | null; param: string | null } {
  if (!isRecord(payload) || !isRecord(payload.error)) return { errorType: null, errorCode: null, param: null }
  const { type, code, param } = payload.error
  return {
    errorType: typeof type === 'string' ? type : null,
    errorCode: typeof code === 'string' ? code : null,
    param: typeof param === 'string' ? param : null,
  }
}

function isModelRejection(status: number, errorCode: string | null, param: string | null): boolean {
  if (status !== 400 && status !== 404) return false
  return (errorCode !== null && errorCode.includes('model')) || param === 'model'
}

function extractOutputText(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  if (typeof payload.output_text === 'string' && payload.output_text.length > 0) return payload.output_text
  if (!Array.isArray(payload.output)) return null
  for (const item of payload.output) {
    if (!isRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) continue
    for (const block of item.content) {
      if (isRecord(block) && (block.type === 'output_text' || block.type === 'text') && typeof block.text === 'string') {
        return block.text
      }
    }
  }
  return null
}

function extractUsage(payload: unknown): OpenAiUsage | null {
  if (!isRecord(payload) || !isRecord(payload.usage)) return null
  const { input_tokens: inputTokens, output_tokens: outputTokens, input_tokens_details: details } = payload.usage
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return null
  const cachedTokens = isRecord(details) && typeof details.cached_tokens === 'number' ? details.cached_tokens : 0
  const cacheWriteTokens = isRecord(details) && typeof details.cache_write_tokens === 'number' ? details.cache_write_tokens : 0
  return { inputTokens, outputTokens, cachedTokens, cacheWriteTokens }
}
