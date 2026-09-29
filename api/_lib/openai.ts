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
}

export interface OpenAiCallResult {
  ok: boolean
  status: number | null
  text: string | null
  usage: OpenAiUsage | null
  /** True only when the provider rejected the request specifically because the model id is unknown/unavailable. */
  modelRejected: boolean
}

/** POSTs a single-turn request to the OpenAI Responses API and returns the model's text reply, or a failure with enough detail for the fallback layer to decide what to do next. */
export async function callOpenAiResponses(params: CallOpenAiResponsesParams): Promise<OpenAiCallResult> {
  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), UPSTREAM_TIMEOUT_MS)

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
        input: params.user,
        max_output_tokens: params.maxOutputTokens,
        text: { format: { type: 'json_object' } },
      }),
      signal: timeoutController.signal,
    })
  } catch {
    return { ok: false, status: null, text: null, usage: null, modelRejected: false }
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    let errorPayload: unknown = null
    try {
      errorPayload = await response.json()
    } catch {
      // Body wasn't JSON — fall through with no error detail.
    }
    const modelRejected = isModelRejection(response.status, errorPayload)
    return { ok: false, status: response.status, text: null, usage: null, modelRejected }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, status: response.status, text: null, usage: null, modelRejected: false }
  }

  return { ok: true, status: response.status, text: extractOutputText(payload), usage: extractUsage(payload), modelRejected: false }
}

function isModelRejection(status: number, errorPayload: unknown): boolean {
  if (status !== 400 && status !== 404) return false
  if (!isRecord(errorPayload) || !isRecord(errorPayload.error)) return false
  const { code, param } = errorPayload.error
  return (typeof code === 'string' && code.includes('model')) || param === 'model'
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
