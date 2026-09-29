import type { IncomingMessage } from 'node:http'

export const DEFAULT_MODEL = 'claude-haiku-4-5'
const UPSTREAM_TIMEOUT_MS = 25000

export function resolveModel(): string {
  return process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export interface AnthropicContentBlock {
  type: 'text' | 'image'
  text?: string
  source?: { type: 'base64'; media_type: string; data: string }
}

interface CallAnthropicMessagesParams {
  apiKey: string
  model: string
  maxTokens: number
  system: string
  content: AnthropicContentBlock[]
}

/** POSTs a single-turn message to the Anthropic Messages API and returns the model's text reply, or null on any transport/shape failure. */
export async function callAnthropicMessages(params: CallAnthropicMessagesParams): Promise<string | null> {
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
      }),
      signal: timeoutController.signal,
    })
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) return null

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return null
  }

  return extractResponseText(payload)
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
