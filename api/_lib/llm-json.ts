import type { IncomingMessage, ServerResponse } from 'node:http'

import { extractJson, isRecord, readRequestBody } from './anthropic.js'
import { generateJson } from './llm.js'
import type { LlmImageInput, LlmProvider } from './llm.js'
import { requestIp } from './song-rate-limit.js'

export type LlmJsonErrorCode = 'upstream' | 'parse' | 'model' | 'not_configured'

export type LlmJsonResult<T> =
  | { ok: true; value: T; provider: LlmProvider; fallbackUsed: boolean }
  | { ok: false; error: LlmJsonErrorCode }

/**
 * One JSON-returning call through the shared provider layer: parses + validates the reply with
 * `validate` (null = invalid), and on an invalid/truncated reply retries once with `retryTokens`.
 */
export async function callLlmJson<T>(params: {
  system: string
  user: string
  initialTokens: number
  retryTokens: number
  validate: (parsed: unknown) => T | null
  /** Optional vision input sent with `user` (e.g. a photo of the student's work). */
  image?: LlmImageInput
  preferProvider?: LlmProvider
}): Promise<LlmJsonResult<T>> {
  for (const maxTokens of [params.initialTokens, params.retryTokens]) {
    const result = await generateJson({
      system: params.system,
      user: params.user,
      maxTokens,
      ...(params.image ? { image: params.image } : {}),
      ...(params.preferProvider ? { preferProvider: params.preferProvider } : {}),
    })
    if (result.status === 'not_configured') return { ok: false, error: 'not_configured' }
    if (result.status === 'error') return { ok: false, error: result.error === 'model' ? 'model' : 'upstream' }
    const value = params.validate(extractJson(result.text))
    if (value !== null) return { ok: true, value, provider: result.provider, fallbackUsed: result.fallbackUsed }
  }
  return { ok: false, error: 'parse' }
}

export function cleanString(value: unknown, maxChars: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxChars) : ''
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

export { isRecord }

/** Shared POST-JSON transport: method check, size-capped body, JSON parse, then `handle`. */
export function jsonPostHandler<B>(
  maxRequestBytes: number,
  handle: (payload: unknown, ip: string) => Promise<{ status: number; body: B }>,
  errorBody: (code: 'bad_type' | 'too_large' | 'upstream') => B,
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const respond = (status: number, body: B) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST') {
      respond(405, errorBody('bad_type'))
      return
    }
    let rawBody: string
    try {
      rawBody = await readRequestBody(req, maxRequestBytes)
    } catch {
      respond(400, errorBody('too_large'))
      return
    }
    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch {
      respond(400, errorBody('bad_type'))
      return
    }
    try {
      const { status, body } = await handle(payload, requestIp(req))
      respond(status, body)
    } catch (error) {
      console.error('api: unexpected failure', error instanceof Error ? error.message : 'unknown')
      respond(502, errorBody('upstream'))
    }
  }
}
