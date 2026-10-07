/** Shared types for the AI grader (api/grade.ts) — imported by both the server handler and the
 * client caller, same pattern as lib/quiz.ts for generate. */

export type GradeQuestionType = 'short-answer' | 'open-ended'
type GradeVerdict = 'correct' | 'partial' | 'incorrect'
export type GradeErrorCode = 'empty' | 'too_long' | 'upstream' | 'parse' | 'not_configured'

export const MAX_STUDENT_ANSWER_CHARS = 1000

export interface GradeResponseBody {
  verdict: GradeVerdict
  feedback: string
  covered: number
  total: number
}

export interface GradeApiErrorBody {
  error: GradeErrorCode
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const VERDICTS: ReadonlySet<string> = new Set(['correct', 'partial', 'incorrect'])

export function isGradeResponseBody(value: unknown): value is GradeResponseBody {
  return (
    isRecord(value) &&
    typeof value.verdict === 'string' &&
    VERDICTS.has(value.verdict) &&
    typeof value.feedback === 'string' &&
    typeof value.covered === 'number' &&
    typeof value.total === 'number'
  )
}
