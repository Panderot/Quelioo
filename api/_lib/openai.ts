import { isRecord } from './anthropic.js'

const UPSTREAM_TIMEOUT_MS = 25000

export interface OpenAiUsage {
  inputTokens: number
  outputTokens: number
}

export interface CallOpenAiResponsesParams {
  apiKey: string
  model: string
  system: string
  user: string
  maxOutputTokens: number
  /** Optional image to attach as vision input, alongside `user` as text. */
  image?: { mimeType: string; base64Data: string }
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
  const timeout = setTimeout(() => timeoutController.abort(), UPSTREAM_TIMEOUT_MS)

  const input = params.image
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
        instructions: params.system,
        input,
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
    text: extractOutputText(payload),
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
  const { input_tokens: inputTokens, output_tokens: outputTokens } = payload.usage
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return null
  return { inputTokens, outputTokens }
}
