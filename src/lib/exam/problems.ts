import { blankCount } from './contentRules'
import { EXAM_TOTAL_POINTS } from './types'
import type { ExamQuestion, WrittenExam } from './types'

/** What stands between an exam and a good print-out: incomplete questions (B9), a points total other than 100 and an empty course or class (B3, B7). */

export type QuestionProblem =
  | 'stem'
  | 'options'
  | 'optionEmpty'
  | 'correctOption'
  | 'truth'
  | 'blank'
  | 'answer'
  | 'pairs'
  | 'pairEmpty'
  | 'extraEmpty'
  | 'rubricEmpty'

/** The reasons a question is not finished (empty = complete). */
export function questionProblems(question: ExamQuestion): QuestionProblem[] {
  const problems: QuestionProblem[] = []
  if (!question.stem.trim()) problems.push('stem')
  switch (question.type) {
    case 'mcq': {
      const options = question.options ?? []
      if (options.length < 2) problems.push('options')
      if (options.some((option) => !option.trim())) problems.push('optionEmpty')
      if (question.answerIndex === undefined || question.answerIndex < 0 || question.answerIndex >= options.length) problems.push('correctOption')
      break
    }
    case 'true-false':
      if (question.answerBool === undefined) problems.push('truth')
      break
    case 'fill-blanks':
      if (blankCount(question.stem) === 0) problems.push('blank')
      if (!question.answer.trim()) problems.push('answer')
      break
    case 'short-answer':
    case 'open-ended':
      if (!question.answer.trim()) problems.push('answer')
      break
    case 'matching': {
      const pairs = question.pairs ?? []
      if (pairs.length < 2) problems.push('pairs')
      if (pairs.some((pair) => !pair.left.trim() || !pair.right.trim())) problems.push('pairEmpty')
      if ((question.extras ?? []).some((extra) => !extra.trim())) problems.push('extraEmpty')
      break
    }
  }
  if (question.rubric.some((item) => !item.text.trim())) problems.push('rubricEmpty')
  return problems
}

export interface IncompleteQuestion {
  number: number
  problems: QuestionProblem[]
}

export interface ExportIssues {
  /** The points total when it is not 100. */
  points: number | null
  /** The course or the class is empty. */
  header: boolean
  incomplete: IncompleteQuestion[]
}

/** Everything the teacher should know before an export; null when there is nothing to say. */
export function exportIssues(exam: WrittenExam): ExportIssues | null {
  const total = exam.questions.reduce((sum, question) => sum + question.points, 0)
  const incomplete = exam.questions.flatMap((question, index) => {
    const problems = questionProblems(question)
    return problems.length > 0 ? [{ number: index + 1, problems }] : []
  })
  const header = !exam.settings.header.course.trim() || !exam.settings.header.grade.trim()
  const points = total === EXAM_TOTAL_POINTS ? null : total
  return points === null && !header && incomplete.length === 0 ? null : { points, header, incomplete }
}
