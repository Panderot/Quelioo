import type { IncomingMessage } from 'node:http'

const UPSTREAM_TIMEOUT_MS = 25000

export function resolveModel(defaultModel: string): string {
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
  /** Overrides the default upstream timeout (e.g. a 10-question quiz batch). */
  timeoutMs?: number
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
  const timeout = setTimeout(() => timeoutController.abort(), params.timeoutMs ?? UPSTREAM_TIMEOUT_MS)

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

/**
 * Best-effort repair for a common LLM quirk: a literal (unescaped) newline, carriage return or tab
 * inside an otherwise well-formed JSON string literal — multi-line content (song lyrics, long
 * explanations) occasionally comes back this way even when explicitly asked for "\n", and a bare
 * control character inside a JSON string is strictly invalid, so JSON.parse throws on an otherwise
 * obviously-intended document. Walks the text tracking whether it's inside a double-quoted string
 * (respecting backslash escapes) and only touches control characters found strictly inside one.
 */
function repairUnescapedControlCharsInStrings(text: string): string {
  let result = ''
  let inString = false
  let escaped = false
  for (const char of text) {
    if (!inString) {
      result += char
      if (char === '"') inString = true
      continue
    }
    if (escaped) {
      result += char
      escaped = false
      continue
    }
    if (char === '\\') {
      result += char
      escaped = true
      continue
    }
    if (char === '"') {
      inString = false
      result += char
      continue
    }
    if (char === '\n') result += '\\n'
    else if (char === '\r') result += '\\r'
    else if (char === '\t') result += '\\t'
    else result += char
  }
  return result
}

/**
 * Doubles backslashes that don't start a valid JSON escape (LaTeX like \cdot, \sqrt written with
 * a single backslash inside a string value). Only touches text inside strings.
 */
function repairInvalidEscapesInStrings(text: string): string {
  let result = ''
  let inString = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (!inString) {
      result += char
      if (char === '"') inString = true
      continue
    }
    if (char === '\\') {
      const next = text[i + 1] ?? ''
      const validUnicode = next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))
      if (next === '"' || next === '\\' || next === '/' || next === 'b' || next === 'f' || next === 'n' || next === 'r' || next === 't' || validUnicode) {
        result += char + next
        i += 1
      } else {
        result += '\\\\'
      }
      continue
    }
    if (char === '"') inString = false
    result += char
  }
  return result
}

/** Parses a JSON object out of a model reply, tolerating a wrapping ```json code fence and (as a
 * last resort) unescaped control characters inside string values — see repairUnescapedControlCharsInStrings. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const unfenced = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const attempts = [
    trimmed,
    unfenced,
    repairUnescapedControlCharsInStrings(unfenced),
    repairUnescapedControlCharsInStrings(repairInvalidEscapesInStrings(unfenced)),
  ]
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
