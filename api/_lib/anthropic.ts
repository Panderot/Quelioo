import type { IncomingMessage } from 'node:http'

export const DEFAULT_MODEL = 'claude-haiku-4-5'
const UPSTREAM_TIMEOUT_MS = 25000

/** Solve keeps calling this with no default override, so it keeps resolving to DEFAULT_MODEL exactly as before. */
export function resolveModel(defaultModel: string = DEFAULT_MODEL): string {
  return process.env.ANTHROPIC_MODEL ?? defaultModel
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export interface AnthropicContentBlock {
  type: 'text' | 'image'
  text?: string
  source?: { type: 'base64'; media_type: string; data: string }
}

export interface AnthropicUsage {
  inputTokens: number
  outputTokens: number
}

interface CallAnthropicMessagesParams {
  apiKey: string
  model: string
  maxTokens: number
  system: string
  content: AnthropicContentBlock[]
  /** Omitted entirely from the request when not passed, so existing callers (Solve) send a byte-identical body. */
  outputConfig?: { effort: string }
  thinking?: { type: string }
}

export interface AnthropicCallResult {
  ok: boolean
  status: number | null
  text: string | null
  usage: AnthropicUsage | null
  /** Anthropic's error.type (e.g. "authentication_error", "rate_limit_error", "not_found_error") — null on success or if the body wasn't parseable JSON. */
  errorType: string | null
}

async function postAnthropicMessages(params: CallAnthropicMessagesParams): Promise<AnthropicCallResult> {
  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), UPSTREAM_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: [{ role: 'user', content: params.content }],
        ...(params.outputConfig ? { output_config: params.outputConfig } : {}),
        ...(params.thinking ? { thinking: params.thinking } : {}),
      }),
      signal: timeoutController.signal,
    })
  } catch {
    return { ok: false, status: null, text: null, usage: null, errorType: null }
  } finally {
    clearTimeout(timeout)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, status: response.status, text: null, usage: null, errorType: null }
  }

  if (!response.ok) {
    return { ok: false, status: response.status, text: null, usage: null, errorType: extractErrorType(payload) }
  }

  return { ok: true, status: response.status, text: extractResponseText(payload), usage: extractUsage(payload), errorType: null }
}

function extractErrorType(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null
  return typeof payload.error.type === 'string' ? payload.error.type : null
}

/** POSTs a single-turn message to the Anthropic Messages API and returns the model's text reply, or null on any transport/shape failure. */
export async function callAnthropicMessages(params: CallAnthropicMessagesParams): Promise<string | null> {
  const result = await postAnthropicMessages(params)
  return result.text
}

/** Same call, with the HTTP status and token usage exposed for callers that need to distinguish auth failures from other errors (used by the multi-provider LLM layer). */
export async function callAnthropicMessagesDetailed(params: CallAnthropicMessagesParams): Promise<AnthropicCallResult> {
  return postAnthropicMessages(params)
}

function extractResponseText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.content)) return null
  for (const block of payload.content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      return block.text
    }
  }
  return null
}

function extractUsage(payload: unknown): AnthropicUsage | null {
  if (!isRecord(payload) || !isRecord(payload.usage)) return null
  const { input_tokens: inputTokens, output_tokens: outputTokens } = payload.usage
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return null
  return { inputTokens, outputTokens }
}

/** Parses a JSON object out of a model reply, tolerating a wrapping ```json code fence. */
export function extractJson(text: string): unknown {
  const attempts = [text.trim(), text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()]
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt)
    } catch {
      continue
    }
  }
  return null
}

export function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error('payload_too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', (error) => reject(error as Error))
  })
}
