import { isStringArray, postJson, SolveExtraApiError } from './postJson'

export type AnotherWayErrorCode = 'bad_type' | 'too_large' | 'upstream' | 'parse' | 'model' | 'not_configured' | 'rate_limited' | 'mismatch' | 'network'

export type AnotherWayResult = { kind: 'method'; method: string; steps: string[]; answer: string } | { kind: 'none'; note: string }

export interface AnotherWayRequestPayload {
  question: string
  steps: string[]
  answer: string
  language: string
}

const KNOWN: ReadonlySet<string> = new Set(['bad_type', 'too_large', 'upstream', 'parse', 'model', 'not_configured', 'rate_limited', 'mismatch'])

export async function fetchAnotherWay(payload: AnotherWayRequestPayload, signal?: AbortSignal): Promise<AnotherWayResult> {
  const body = await postJson<AnotherWayErrorCode>('/api/another-way', payload, KNOWN, signal)
  if (body.kind === 'none') return { kind: 'none', note: typeof body.note === 'string' ? body.note : '' }
  if (body.kind === 'method' && typeof body.method === 'string' && isStringArray(body.steps) && body.steps.length > 0 && typeof body.answer === 'string') {
    return { kind: 'method', method: body.method, steps: body.steps, answer: body.answer }
  }
  throw new SolveExtraApiError<AnotherWayErrorCode>('parse')
}
