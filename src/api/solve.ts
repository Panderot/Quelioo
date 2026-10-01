export type SolveErrorCode =
  | 'unreadable'
  | 'not_math'
  | 'too_large'
  | 'bad_type'
  | 'upstream'
  | 'parse'
  | 'model'
  | 'not_configured'
  | 'rate_limited'
  | 'network'

export interface SolveResult {
  topic: string
  question: string
  steps: string[]
  answer: string
  tip: string
}

export interface SolveRequestPayload {
  imageBase64: string
  mimeType: string
  language: string
  note: string
}

export class SolveApiError extends Error {
  code: SolveErrorCode

  constructor(code: SolveErrorCode) {
    super(code)
    this.code = code
  }
}

const ERROR_CODES: ReadonlySet<string> = new Set([
  'unreadable',
  'not_math',
  'too_large',
  'bad_type',
  'upstream',
  'parse',
  'model',
  'not_configured',
  'rate_limited',
])

function isSolveErrorCode(value: unknown): value is SolveErrorCode {
  return typeof value === 'string' && ERROR_CODES.has(value)
}

function isSolveResult(value: unknown): value is SolveResult {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.topic === 'string' &&
    typeof record.question === 'string' &&
    Array.isArray(record.steps) &&
    record.steps.every((step) => typeof step === 'string') &&
    typeof record.answer === 'string' &&
    typeof record.tip === 'string'
  )
}

export async function solveMathPhoto(payload: SolveRequestPayload, signal?: AbortSignal): Promise<SolveResult> {
  let response: Response
  try {
    response = await fetch('/api/solve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new SolveApiError('network')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new SolveApiError('parse')
  }

  if (typeof body === 'object' && body !== null && 'error' in body) {
    const code = (body as { error: unknown }).error
    throw new SolveApiError(isSolveErrorCode(code) ? code : 'upstream')
  }

  if (!isSolveResult(body)) {
    throw new SolveApiError('parse')
  }

  return body
}
