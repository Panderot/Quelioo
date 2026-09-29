export type SolveErrorCode = 'not_math' | 'too_large' | 'bad_type' | 'upstream' | 'parse' | 'network'

export interface SolveResult {
  topic: string
  question: string
  steps: string[]
  answer: string
  tip: string
  demo: boolean
}

export interface SolveRequestPayload {
  imageBase64: string
  mimeType: string
  language: string
}

export class SolveApiError extends Error {
  code: SolveErrorCode

  constructor(code: SolveErrorCode) {
    super(code)
    this.code = code
  }
}

const ERROR_CODES: ReadonlySet<string> = new Set(['not_math', 'too_large', 'bad_type', 'upstream', 'parse'])

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
    typeof record.tip === 'string' &&
    typeof record.demo === 'boolean'
  )
}

export async function solveMathPhoto(payload: SolveRequestPayload): Promise<SolveResult> {
  let response: Response
  try {
    response = await fetch('/api/solve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
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
