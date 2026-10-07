import { isGradeResponseBody } from '../lib/grading'
import type { GradeErrorCode, GradeQuestionType, GradeResponseBody } from '../lib/grading'
import { apiFetch } from '../lib/auth/apiFetch'

export interface GradeAnswerPayload {
  type: GradeQuestionType
  question: string
  modelAnswer: string
  keyPoints: string[]
  evidence: string
  studentAnswer: string
  language: string
}

export class GradeApiError extends Error {
  code: GradeErrorCode

  constructor(code: GradeErrorCode) {
    super(code)
    this.code = code
  }
}

const ERROR_CODES: ReadonlySet<string> = new Set(['empty', 'too_long', 'upstream', 'parse', 'not_configured'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isErrorCode(value: unknown): value is GradeErrorCode {
  return typeof value === 'string' && ERROR_CODES.has(value)
}

export async function gradeAnswer(payload: GradeAnswerPayload, signal?: AbortSignal): Promise<GradeResponseBody> {
  let response: Response
  try {
    response = await apiFetch('/api/grade', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new GradeApiError('upstream')
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new GradeApiError('parse')
  }

  if (isRecord(json) && 'error' in json) {
    const code = json.error
    throw new GradeApiError(isErrorCode(code) ? code : 'upstream')
  }

  if (!isGradeResponseBody(json)) {
    throw new GradeApiError('parse')
  }
  return json
}
