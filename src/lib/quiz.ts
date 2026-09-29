export type QuizQuestionType = 'mcq' | 'true-false' | 'fill-blanks' | 'short-answer' | 'matching' | 'open-ended'

export interface QuizPair {
  left: string
  right: string
}

interface QuizQuestionBase {
  id: string
  question: string
  explanation: string
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
}

export interface ShortAnswerQuestion extends QuizQuestionBase {
  type: 'short-answer'
  answer: string
}

export interface MatchingQuestion extends QuizQuestionBase {
  type: 'matching'
  pairs: QuizPair[]
}

export interface OpenEndedQuestion extends QuizQuestionBase {
  type: 'open-ended'
  answer: string
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

/** Strict shape check for a question that has already gone through sanitizeQuizQuestion (or came from a trusted server response). */
export function isQuizQuestion(value: unknown): value is QuizQuestion {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || !value.id) return false
  if (!isNonEmptyString(value.question)) return false
  if (typeof value.explanation !== 'string') return false

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
      return isNonEmptyString(value.answer)
    case 'matching':
      return (
        Array.isArray(value.pairs) &&
        value.pairs.length >= 2 &&
        value.pairs.every((pair) => isRecord(pair) && isNonEmptyString(pair.left) && isNonEmptyString(pair.right))
      )
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

  switch (raw.type) {
    case 'mcq': {
      const options = Array.isArray(raw.options)
        ? raw.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0).map((o) => o.trim())
        : []
      const answerIndex = typeof raw.answerIndex === 'number' ? raw.answerIndex : -1
      if (options.length < 2 || answerIndex < 0 || answerIndex >= options.length) return null
      return { id, type: 'mcq', question, explanation, options, answerIndex }
    }
    case 'true-false': {
      if (typeof raw.answerBool !== 'boolean') return null
      return { id, type: 'true-false', question, explanation, answerBool: raw.answerBool }
    }
    case 'fill-blanks':
    case 'short-answer':
    case 'open-ended': {
      const answer = typeof raw.answer === 'string' ? raw.answer.trim() : ''
      if (!answer) return null
      return { id, type: raw.type, question, explanation, answer }
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
      if (pairs.length < 2) return null
      return { id, type: 'matching', question, explanation, pairs }
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
