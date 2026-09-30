import { computeDerangement } from './matching.js'

export type QuizQuestionType = 'mcq' | 'true-false' | 'fill-blanks' | 'short-answer' | 'matching' | 'open-ended'

export interface QuizPair {
  left: string
  right: string
}

interface QuizQuestionBase {
  id: string
  question: string
  explanation: string
  /** Seconds a typical student needs to read, think and answer this question — AI-provided and
   * server-clamped per type, or computed from the shared formula for questions saved before this
   * existed. See src/lib/estimateTime.ts. */
  estimatedSeconds?: number
}

export interface McqQuestion extends QuizQuestionBase {
  type: 'mcq'
  options: string[]
  answerIndex: number
}

export interface TrueFalseQuestion extends QuizQuestionBase {
  type: 'true-false'
  answerBool: boolean
}

export interface FillBlankQuestion extends QuizQuestionBase {
  type: 'fill-blanks'
  answer: string
  /** Up to 4 alternative correct phrasings, checked leniently alongside `answer`. Optional only
   * for backward compatibility with questions saved before this existed. */
  acceptableAnswers?: string[]
}

export interface ShortAnswerQuestion extends QuizQuestionBase {
  type: 'short-answer'
  answer: string
  acceptableAnswers?: string[]
  /** One short sentence/excerpt from the source text supporting the answer — sent to the AI
   * grader as context, never shown to the student. Optional for backward compatibility. */
  evidence?: string
}

export interface MatchingQuestion extends QuizQuestionBase {
  type: 'matching'
  pairs: QuizPair[]
  /** Display order for the right-hand column: rightOrder[position] is the index into `pairs`
   * shown at that position. Always a derangement (no position shows its own pair's right value).
   * Optional only for backward compatibility with archived questions saved before this existed —
   * see getRightOrder() in lib/matching.ts, which computes a stable stand-in when absent. */
  rightOrder?: number[]
}

export interface OpenEndedQuestion extends QuizQuestionBase {
  type: 'open-ended'
  answer: string
  /** 2-4 short essential ideas the AI grader checks coverage against. Optional for backward
   * compatibility with questions saved before this existed — see getKeyPoints(). */
  keyPoints?: string[]
  evidence?: string
}

/** Every essential idea the AI grader should check for — the question's own keyPoints when
 * present, else the model answer treated as a single point (for questions saved before keyPoints
 * existed). */
export function getKeyPoints(question: Pick<OpenEndedQuestion, 'answer' | 'keyPoints'>): string[] {
  return question.keyPoints && question.keyPoints.length > 0 ? question.keyPoints : [question.answer]
}

/** Alternative correct phrasings for a fill-blanks/short-answer question, or an empty list for
 * questions saved before acceptableAnswers existed. */
export function getAcceptableAnswers(question: Pick<FillBlankQuestion | ShortAnswerQuestion, 'acceptableAnswers'>): string[] {
  return question.acceptableAnswers ?? []
}

export type QuizQuestion =
  | McqQuestion
  | TrueFalseQuestion
  | FillBlankQuestion
  | ShortAnswerQuestion
  | MatchingQuestion
  | OpenEndedQuestion

export interface GeneratedQuiz {
  title: string
  questions: QuizQuestion[]
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))
}

/** Trims, drops empty entries and caps a raw model-provided string list at `max` entries. */
function sanitizeStringList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, max)
}

/** Strict shape check for a question that has already gone through sanitizeQuizQuestion (or came from a trusted server response). */
export function isQuizQuestion(value: unknown): value is QuizQuestion {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || !value.id) return false
  if (!isNonEmptyString(value.question)) return false
  if (typeof value.explanation !== 'string') return false
  if (value.estimatedSeconds !== undefined && (typeof value.estimatedSeconds !== 'number' || !Number.isFinite(value.estimatedSeconds))) return false

  switch (value.type) {
    case 'mcq':
      return (
        Array.isArray(value.options) &&
        value.options.length >= 2 &&
        value.options.every((option) => typeof option === 'string' && option.trim().length > 0) &&
        typeof value.answerIndex === 'number' &&
        value.answerIndex >= 0 &&
        value.answerIndex < value.options.length
      )
    case 'true-false':
      return typeof value.answerBool === 'boolean'
    case 'fill-blanks':
    case 'short-answer':
    case 'open-ended':
      return (
        isNonEmptyString(value.answer) &&
        isOptionalStringArray(value.acceptableAnswers) &&
        (value.evidence === undefined || typeof value.evidence === 'string') &&
        isOptionalStringArray(value.keyPoints)
      )
    case 'matching': {
      const pairs = value.pairs
      if (
        !Array.isArray(pairs) ||
        pairs.length < 3 ||
        !pairs.every((pair) => isRecord(pair) && isNonEmptyString(pair.left) && isNonEmptyString(pair.right))
      ) {
        return false
      }
      const rightOrder = value.rightOrder
      if (rightOrder === undefined) return true
      return (
        Array.isArray(rightOrder) &&
        rightOrder.length === pairs.length &&
        rightOrder.every((n) => typeof n === 'number' && n >= 0 && n < pairs.length)
      )
    }
    default:
      return false
  }
}

export function isGeneratedQuiz(value: unknown): value is GeneratedQuiz {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    Array.isArray(value.questions) &&
    value.questions.length > 0 &&
    value.questions.every(isQuizQuestion)
  )
}

/** Normalizes and validates a single raw model-provided question. Returns null if it can't be salvaged. */
export function sanitizeQuizQuestion(raw: unknown, makeId: () => string): QuizQuestion | null {
  if (!isRecord(raw)) return null

  const question = typeof raw.question === 'string' ? raw.question.trim() : ''
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : ''
  if (!question) return null

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : makeId()
  const estimatedSeconds = typeof raw.estimatedSeconds === 'number' && Number.isFinite(raw.estimatedSeconds) ? raw.estimatedSeconds : undefined

  switch (raw.type) {
    case 'mcq': {
      const options = Array.isArray(raw.options)
        ? raw.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0).map((o) => o.trim())
        : []
      const answerIndex = typeof raw.answerIndex === 'number' ? raw.answerIndex : -1
      if (options.length < 2 || answerIndex < 0 || answerIndex >= options.length) return null
      return { id, type: 'mcq', question, explanation, options, answerIndex, estimatedSeconds }
    }
    case 'true-false': {
      if (typeof raw.answerBool !== 'boolean') return null
      return { id, type: 'true-false', question, explanation, answerBool: raw.answerBool, estimatedSeconds }
    }
    case 'fill-blanks': {
      const answer = typeof raw.answer === 'string' ? raw.answer.trim() : ''
      if (!answer) return null
      const acceptableAnswers = sanitizeStringList(raw.acceptableAnswers, 4)
      return { id, type: 'fill-blanks', question, explanation, answer, acceptableAnswers, estimatedSeconds }
    }
    case 'short-answer': {
      const answer = typeof raw.answer === 'string' ? raw.answer.trim() : ''
      if (!answer) return null
      const acceptableAnswers = sanitizeStringList(raw.acceptableAnswers, 4)
      const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim().slice(0, 200) : ''
      return { id, type: 'short-answer', question, explanation, answer, acceptableAnswers, evidence, estimatedSeconds }
    }
    case 'open-ended': {
      const answer = typeof raw.answer === 'string' ? raw.answer.trim() : ''
      if (!answer) return null
      const keyPoints = sanitizeStringList(raw.keyPoints, 4)
      const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim().slice(0, 200) : ''
      return { id, type: 'open-ended', question, explanation, answer, keyPoints, evidence, estimatedSeconds }
    }
    case 'matching': {
      const pairs = Array.isArray(raw.pairs)
        ? raw.pairs
            .filter((pair): pair is Record<string, unknown> => isRecord(pair))
            .map((pair) => ({
              left: typeof pair.left === 'string' ? pair.left.trim() : '',
              right: typeof pair.right === 'string' ? pair.right.trim() : '',
            }))
            .filter((pair) => pair.left && pair.right)
        : []
      if (pairs.length < 3) return null
      return { id, type: 'matching', question, explanation, pairs, rightOrder: computeDerangement(pairs.length, id), estimatedSeconds }
    }
    default:
      return null
  }
}

/** Normalizes and validates a raw model response into a GeneratedQuiz, dropping any question that can't be salvaged. */
export function sanitizeGeneratedQuiz(raw: unknown): GeneratedQuiz | null {
  if (!isRecord(raw)) return null

  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Quiz'
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : []

  let counter = 0
  const makeId = () => `q_${Date.now().toString(36)}_${counter++}`

  const questions = rawQuestions
    .map((question) => sanitizeQuizQuestion(question, makeId))
    .filter((question): question is QuizQuestion => question !== null)

  if (questions.length === 0) return null
  return { title, questions }
}
