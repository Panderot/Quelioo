import { isStringArray, postJson, SolveExtraApiError } from './postJson'

export type CheckWorkErrorCode = 'bad_type' | 'too_large' | 'upstream' | 'parse' | 'model' | 'not_configured' | 'rate_limited' | 'network'

type CheckWorkVerdict = 'correct' | 'has_error' | 'unsure' | 'incomplete' | 'different_problem' | 'unreadable' | 'uncertain'
type CheckWorkErrorType = 'arithmetic' | 'sign' | 'concept' | 'copying' | 'missing_step'
export type CheckWorkStepState = 'ok' | 'mistake' | 'unsure' | 'unchecked'

export interface CheckWorkResult {
  verdict: CheckWorkVerdict
  studentSteps: string[]
  /** One state per step: verified mistake, "check this step again", correct, or not checked. */
  stepStates: CheckWorkStepState[]
  /** 0-based index of the first verified wrong step, or null. */
  firstWrongStep: number | null
  errorType: CheckWorkErrorType | null
  explanation: string
  correctedStep: string
  /** 0-based index of a step to check again (only one checker doubted it), or null. */
  unsureStep: number | null
  unsureHint: string
  /** Server-checked: the student's final result is equivalent to the reference answer (null = unknown / none). */
  finalAnswerCorrect: boolean | null
}

export interface CheckWorkReadLine {
  text: string
  lowConfidence: boolean
}

export type CheckWorkReadOutcome = { kind: 'reading'; lines: CheckWorkReadLine[] } | { kind: 'result'; result: CheckWorkResult }

interface BasePayload {
  question: string
  steps: string[]
  answer: string
  language: string
}

export interface CheckWorkReadPayload extends BasePayload {
  imageBase64: string
  mimeType: 'image/jpeg'
}

export interface CheckWorkGradePayload extends BasePayload {
  studentSteps: string[]
}

const KNOWN: ReadonlySet<string> = new Set(['bad_type', 'too_large', 'upstream', 'parse', 'model', 'not_configured', 'rate_limited'])
const VERDICTS: ReadonlySet<string> = new Set(['correct', 'has_error', 'unsure', 'incomplete', 'different_problem', 'unreadable', 'uncertain'])
const ERROR_TYPES: ReadonlySet<string> = new Set(['arithmetic', 'sign', 'concept', 'copying', 'missing_step'])
const STATES: ReadonlySet<string> = new Set(['ok', 'mistake', 'unsure', 'unchecked'])

function stepIndex(value: unknown, length: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length ? value : null
}

/** Validates a check result (from the server or a saved record, including older ones); null when malformed. */
export function toCheckWorkResult(value: unknown): CheckWorkResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.verdict !== 'string' || !VERDICTS.has(record.verdict) || !isStringArray(record.studentSteps)) return null
  const steps = record.studentSteps
  const verdict = record.verdict as CheckWorkVerdict
  const firstWrongStep = stepIndex(record.firstWrongStep, steps.length)
  const unsureStep = stepIndex(record.unsureStep, steps.length)

  let stepStates: CheckWorkStepState[]
  if (Array.isArray(record.stepStates) && record.stepStates.length === steps.length && record.stepStates.every((state) => typeof state === 'string' && STATES.has(state))) {
    stepStates = record.stepStates as CheckWorkStepState[]
  } else {
    // Saved before step states existed: steps before the first mistake were correct.
    stepStates = steps.map((_, index) => {
      if (index === firstWrongStep) return 'mistake'
      if (firstWrongStep === null) return verdict === 'correct' || verdict === 'incomplete' ? 'ok' : 'unchecked'
      return index < firstWrongStep ? 'ok' : 'unchecked'
    })
  }

  return {
    verdict,
    studentSteps: steps,
    stepStates,
    firstWrongStep,
    errorType: firstWrongStep !== null && typeof record.errorType === 'string' && ERROR_TYPES.has(record.errorType) ? (record.errorType as CheckWorkErrorType) : null,
    explanation: typeof record.explanation === 'string' ? record.explanation : '',
    correctedStep: firstWrongStep !== null && typeof record.correctedStep === 'string' ? record.correctedStep : '',
    unsureStep,
    unsureHint: unsureStep !== null && typeof record.unsureHint === 'string' ? record.unsureHint : '',
    finalAnswerCorrect: typeof record.finalAnswerCorrect === 'boolean' ? record.finalAnswerCorrect : null,
  }
}

function toReadLines(value: unknown): CheckWorkReadLine[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const lines = value.filter(
    (line): line is CheckWorkReadLine => typeof line === 'object' && line !== null && typeof line.text === 'string' && typeof line.lowConfidence === 'boolean',
  )
  return lines.length === value.length ? lines.map(({ text, lowConfidence }) => ({ text, lowConfidence })) : null
}

/** Step 1: reads the photo. Returns the lines to confirm, or a final result (unreadable / different problem). */
export async function fetchCheckWorkReading(payload: CheckWorkReadPayload, signal?: AbortSignal): Promise<CheckWorkReadOutcome> {
  const body = await postJson<CheckWorkErrorCode>('/api/check-work', { mode: 'read', ...payload }, KNOWN, signal)
  if (typeof body === 'object' && body !== null && (body as { kind?: unknown }).kind === 'reading') {
    const lines = toReadLines((body as { lines?: unknown }).lines)
    if (lines) return { kind: 'reading', lines }
  } else {
    const result = toCheckWorkResult(body)
    if (result) return { kind: 'result', result }
  }
  throw new SolveExtraApiError<CheckWorkErrorCode>('parse')
}

/** Step 2: grades the steps the student confirmed (or fixed). */
export async function fetchCheckWorkGrade(payload: CheckWorkGradePayload, signal?: AbortSignal): Promise<CheckWorkResult> {
  const body = await postJson<CheckWorkErrorCode>('/api/check-work', { mode: 'grade', ...payload }, KNOWN, signal)
  const result = toCheckWorkResult(body)
  if (!result) throw new SolveExtraApiError<CheckWorkErrorCode>('parse')
  return result
}
