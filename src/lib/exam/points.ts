import { largestRemainder } from './bloom'
import { EXAM_TOTAL_POINTS } from './types'
import type { ExamDifficulty, ExamQuestion, ExamQuestionType, ExamRubricItem } from './types'

/** Whole-number shares of `total` in proportion to `weights` (largest remainder). With `total >= n`
 * every share is at least 1; with fewer points the heaviest weights get 1 each and the rest 0. */
function apportion(weights: number[], total: number): number[] {
  const n = weights.length
  if (n === 0) return []
  const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 1))
  if (total < n) {
    const result = new Array<number>(n).fill(0)
    const order = safe.map((_, index) => index).sort((a, b) => safe[b] - safe[a] || a - b)
    for (let i = 0; i < Math.max(0, total); i += 1) result[order[i]] = 1
    return result
  }
  const rest = total - n
  const sum = safe.reduce((a, b) => a + b, 0)
  const exact = safe.map((weight) => (weight / sum) * rest)
  const result = exact.map((value) => Math.floor(value))
  let left = rest - result.reduce((a, b) => a + b, 0)
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (let i = 0; left > 0; i = (i + 1) % n, left -= 1) result[order[i].index] += 1
  return result.map((value) => value + 1)
}

/** Rubric items rescaled so their points add up to `points` (whole numbers). */
export function scaleRubric(rubric: ExamRubricItem[], points: number): ExamRubricItem[] {
  if (rubric.length === 0) return []
  const shares = apportion(
    rubric.map((item) => item.points),
    Math.max(0, Math.round(points)),
  )
  return rubric.map((item, index) => ({ text: item.text, points: shares[index] }))
}

const TYPE_WEIGHT: Record<ExamQuestionType, number> = {
  'open-ended': 6,
  'short-answer': 3,
  matching: 3,
  'fill-blanks': 2,
  mcq: 2,
  'true-false': 1.5,
}

const DIFFICULTY_WEIGHT: Record<ExamDifficulty, number> = { easy: 0.8, medium: 1, hard: 1.3 }

/** A recall answer is worth less than a reasoning answer (A5: points fit the content). */
const LEVEL_WEIGHT: Record<number, number> = { 1: 0.75, 2: 0.9, 3: 1, 4: 1.15, 5: 1.3, 6: 1.4 }

export function questionWeight(question: Pick<ExamQuestion, 'type' | 'difficulty'> & { bloomLevel?: number }): number {
  return TYPE_WEIGHT[question.type] * DIFFICULTY_WEIGHT[question.difficulty] * (question.bloomLevel ? (LEVEL_WEIGHT[question.bloomLevel] ?? 1) : 1)
}

/** Sets a question's points and rescales its rubric to match. */
export function setQuestionPoints(question: ExamQuestion, points: number): ExamQuestion {
  const whole = Math.max(0, Math.round(points))
  return { ...question, points: whole, rubric: scaleRubric(question.rubric, whole) }
}

/** Points by type and difficulty, whole numbers adding up to exactly `total` (at least 1 per question). */
export function distributePoints(questions: ExamQuestion[], total = EXAM_TOTAL_POINTS): ExamQuestion[] {
  const shares = apportion(questions.map(questionWeight), total)
  return questions.map((question, index) => setQuestionPoints(question, shares[index]))
}

/** The teacher's points scaled to exactly `total`: the same ratios between questions (largest remainder), whole numbers, a question that had points keeps at least 1, every rubric rescaled to its question's new points. */
export function rescalePoints(questions: ExamQuestion[], total = EXAM_TOTAL_POINTS): ExamQuestion[] {
  if (questions.length === 0) return questions
  if (questions.every((question) => !(question.points > 0))) return distributePoints(questions, total)
  const shares = largestRemainder(
    questions.map((question) => Math.max(0, question.points)),
    total,
  )
  // A question that had points never drops to none: the biggest question gives up what it takes.
  for (const [index, question] of questions.entries()) {
    if (question.points > 0 && shares[index] === 0) {
      const biggest = shares.indexOf(Math.max(...shares))
      if (shares[biggest] > 1) {
        shares[biggest] -= 1
        shares[index] = 1
      }
    }
  }
  return questions.map((question, index) => setQuestionPoints(question, shares[index]))
}

export function isTotalValid(questions: Pick<ExamQuestion, 'points'>[], total = EXAM_TOTAL_POINTS): boolean {
  return questions.reduce((sum, question) => sum + question.points, 0) === total && questions.every((question) => Number.isInteger(question.points))
}
