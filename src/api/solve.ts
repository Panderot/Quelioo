import { apiFetch } from '../lib/auth/apiFetch'
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
  /** Short goal sentence shown above the steps; "" when none (older responses omit it). */
  intro: string
  steps: string[]
  answer: string
  tip: string
  /** 0–2 common mistakes; [] when none (older responses omit it). */
  mistakes: string[]
}

export type SolveOutcome = { kind: 'solution'; result: SolveResult } | { kind: 'choices'; problems: string[] }

export interface SolveRequestPayload {
  imageBase64: string
  mimeType: string
  language: string
  note: string
  /** The chosen problem from an earlier multiple-problem reply, echoed back verbatim. */
  problem?: string
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function toSolveOutcome(value: unknown): SolveOutcome | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (isStringArray(record.problems) && record.problems.length > 0 && !('steps' in record)) {
    return { kind: 'choices', problems: record.problems }
  }
  if (
    typeof record.topic !== 'string' ||
    typeof record.question !== 'string' ||
    !isStringArray(record.steps) ||
    typeof record.answer !== 'string' ||
    typeof record.tip !== 'string'
  ) {
    return null
  }
  return {
    kind: 'solution',
    result: {
      topic: record.topic,
      question: record.question,
      intro: typeof record.intro === 'string' ? record.intro : '',
      steps: record.steps,
      answer: record.answer,
      tip: record.tip,
      mistakes: isStringArray(record.mistakes) ? record.mistakes.filter((entry) => entry.trim()).slice(0, 2) : [],
    },
  }
}

export async function solveMathPhoto(payload: SolveRequestPayload, signal?: AbortSignal): Promise<SolveOutcome> {
  let response: Response
  try {
    response = await apiFetch('/api/solve', {
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

  const outcome = toSolveOutcome(body)
  if (!outcome) {
    throw new SolveApiError('parse')
  }

  return outcome
}
