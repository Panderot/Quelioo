export type ExplainLevel = 'simple' | 'simpler'

export type ExplainErrorCode = 'bad_type' | 'too_large' | 'upstream' | 'parse' | 'model' | 'not_configured' | 'rate_limited' | 'network'

export interface StepExplanation {
  explanation: string
  /** Mini example, "" when none. */
  example: string
}

export interface ExplainRequestPayload {
  question: string
  steps: string[]
  answer: string
  stepIndex: number
  level: ExplainLevel
  /** Required for "simpler": the explanation the student already read. */
  previousExplanation?: string
  language: string
}

export class ExplainApiError extends Error {
  code: ExplainErrorCode

  constructor(code: ExplainErrorCode) {
    super(code)
    this.code = code
  }
}

const ERROR_CODES: ReadonlySet<string> = new Set(['bad_type', 'too_large', 'upstream', 'parse', 'model', 'not_configured', 'rate_limited'])

export async function explainStep(payload: ExplainRequestPayload, signal?: AbortSignal): Promise<StepExplanation> {
  let response: Response
  try {
    response = await fetch('/api/explain-step', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ExplainApiError('network')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ExplainApiError('parse')
  }

  if (typeof body !== 'object' || body === null) throw new ExplainApiError('parse')
  const record = body as Record<string, unknown>
  if ('error' in record) {
    throw new ExplainApiError(typeof record.error === 'string' && ERROR_CODES.has(record.error) ? (record.error as ExplainErrorCode) : 'upstream')
  }
  if (typeof record.explanation !== 'string' || !record.explanation.trim()) throw new ExplainApiError('parse')
  return { explanation: record.explanation, example: typeof record.example === 'string' ? record.example : '' }
}
