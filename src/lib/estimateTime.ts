import type { QuizQuestion } from './quiz.js'

export type EstimateQuestionType = 'mcq' | 'true-false' | 'fill-blanks' | 'short-answer' | 'matching' | 'open-ended'
export type EstimateDifficulty = 'easy' | 'medium' | 'hard'

/**
 * Per-question base seconds at medium difficulty, standard shape (4 mcq options, 5 matching
 * pairs). mcq, true-false and open-ended were recalibrated against real AI-provided
 * estimatedSeconds (see CLAUDE.md/api/_lib/generate.ts check) — the original guesses (45/20/180)
 * ran 25-75% higher than what the model actually reports students need, consistently across
 * providers. fill-blanks/short-answer/matching are untested and keep their original estimate.
 */
const BASE_SECONDS: Record<EstimateQuestionType, number> = {
  mcq: 24,
  'true-false': 15,
  'fill-blanks': 30,
  'short-answer': 60,
  matching: 75, // 15s/pair * 5 assumed pairs
  'open-ended': 45,
}

const MCQ_STANDARD_OPTIONS = 4
const MCQ_OPTION_SECONDS_DELTA = 8

const DIFFICULTY_MULTIPLIER: Record<EstimateDifficulty, number> = {
  easy: 0.75,
  medium: 1,
  hard: 1.4,
}

/** Server-side clamp range for a model-provided estimatedSeconds value, per question type. */
const ESTIMATED_SECONDS_RANGE: Record<EstimateQuestionType, [number, number]> = {
  'true-false': [8, 60],
  mcq: [15, 180],
  'fill-blanks': [10, 120],
  'short-answer': [20, 240],
  matching: [30, 300],
  'open-ended': [60, 600],
}

const MIXED_TYPES: EstimateQuestionType[] = ['mcq', 'true-false', 'fill-blanks', 'short-answer', 'matching', 'open-ended']

function baseSecondsForType(type: EstimateQuestionType, optionsCount?: number): number {
  if (type === 'mcq') {
    const count = optionsCount ?? MCQ_STANDARD_OPTIONS
    return BASE_SECONDS.mcq + (count - MCQ_STANDARD_OPTIONS) * MCQ_OPTION_SECONDS_DELTA
  }
  return BASE_SECONDS[type]
}

/** Base seconds for one question of `type`, difficulty-adjusted — "mixed" averages the base cost
 * across every concrete type the generator can mix in. Shared by the client's pre-generation
 * estimate and the server-side fallback used when the model omits/mangles estimatedSeconds. */
function estimateQuestionSeconds(type: EstimateQuestionType | 'mixed', difficulty: EstimateDifficulty, optionsCount?: number): number {
  const base =
    type === 'mixed'
      ? MIXED_TYPES.reduce((sum, t) => sum + baseSecondsForType(t, optionsCount), 0) / MIXED_TYPES.length
      : baseSecondsForType(type, optionsCount)
  return base * (DIFFICULTY_MULTIPLIER[difficulty] ?? 1)
}

export interface QuizTimeRangeMinutes {
  /** True when the estimate is under a minute — show a "less than a minute" string instead of a range. */
  underAMinute: boolean
  minMinutes: number
  maxMinutes: number
}

/** Pre-generation estimate (no AI call) — a +/-20% range around the formula total, rounded to whole minutes. */
export function estimateQuizTimeRange(params: {
  questionType: EstimateQuestionType | 'mixed'
  questionCount: number
  difficulty: EstimateDifficulty
  optionsCount?: number
}): QuizTimeRangeMinutes {
  const perQuestion = estimateQuestionSeconds(params.questionType, params.difficulty, params.optionsCount)
  const totalSeconds = perQuestion * Math.max(0, params.questionCount)
  if (totalSeconds < 60) return { underAMinute: true, minMinutes: 0, maxMinutes: 0 }
  const minMinutes = Math.max(1, Math.round((totalSeconds * 0.8) / 60))
  const maxMinutes = Math.max(minMinutes, Math.round((totalSeconds * 1.2) / 60))
  return { underAMinute: false, minMinutes, maxMinutes }
}

/** Rounds a total number of seconds (e.g. summed per-question estimatedSeconds) to a display minute count. */
export function secondsToDisplayMinutes(totalSeconds: number): { underAMinute: boolean; minutes: number } {
  if (totalSeconds < 60) return { underAMinute: true, minutes: 0 }
  return { underAMinute: false, minutes: Math.max(1, Math.round(totalSeconds / 60)) }
}

/** Server-side clamp + fallback for a model-provided estimatedSeconds value. */
export function clampEstimatedSeconds(type: EstimateQuestionType, difficulty: EstimateDifficulty, raw: unknown, optionsCount?: number): number {
  const [min, max] = ESTIMATED_SECONDS_RANGE[type]
  const fallback = Math.round(estimateQuestionSeconds(type, difficulty, optionsCount))
  const fallbackClamped = Math.min(max, Math.max(min, fallback))
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallbackClamped
  return Math.min(max, Math.max(min, Math.round(raw)))
}

/** Total seconds for an already-generated quiz — uses each question's own estimatedSeconds when
 * present (the AI-assisted value), falling back to the formula for older questions saved before
 * estimatedSeconds existed. */
export function computeQuizTotalSeconds(questions: QuizQuestion[], difficulty: EstimateDifficulty): number {
  return questions.reduce((sum, question) => {
    const stored = (question as { estimatedSeconds?: number }).estimatedSeconds
    if (typeof stored === 'number' && Number.isFinite(stored)) return sum + stored
    const optionsCount = question.type === 'mcq' ? question.options.length : undefined
    return sum + estimateQuestionSeconds(question.type, difficulty, optionsCount)
  }, 0)
}
