import { isStringArray, postJson, SolveExtraApiError } from './postJson'

export type SimilarErrorCode = 'bad_type' | 'too_large' | 'upstream' | 'parse' | 'model' | 'not_configured' | 'rate_limited' | 'unverified' | 'network'

export interface SimilarProblem {
  question: string
  steps: string[]
  answer: string
  /** Plain value for the local answer check, "" when the answer isn't a single value. */
  checkValue: string
}

export interface SimilarRequestPayload {
  question: string
  steps: string[]
  answer: string
  topic: string
  language: string
  /** Earlier similar problems, so the new one is different. */
  avoid: string[]
}

const KNOWN: ReadonlySet<string> = new Set(['bad_type', 'too_large', 'upstream', 'parse', 'model', 'not_configured', 'rate_limited', 'unverified'])

export async function fetchSimilarProblem(payload: SimilarRequestPayload, signal?: AbortSignal): Promise<SimilarProblem> {
  const body = await postJson<SimilarErrorCode>('/api/similar', payload, KNOWN, signal)
  if (typeof body.question !== 'string' || !body.question || !isStringArray(body.steps) || body.steps.length === 0 || typeof body.answer !== 'string') {
    throw new SolveExtraApiError<SimilarErrorCode>('parse')
  }
  return {
    question: body.question,
    steps: body.steps,
    answer: body.answer,
    checkValue: typeof body.checkValue === 'string' ? body.checkValue : '',
  }
}
