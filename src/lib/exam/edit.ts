import { computeRightOrder, newQuestionId } from './factory'
import { scaleRubric, setQuestionPoints } from './points'
import { totalPoints } from './types'
import type { ExamPair, ExamQuestion, WrittenExam } from './types'

/** Pure edits of an exam, used by the editor (each returns a new exam). */

export function updateQuestion(exam: WrittenExam, id: string, update: (question: ExamQuestion) => ExamQuestion): WrittenExam {
  return { ...exam, questions: exam.questions.map((question) => (question.id === id ? update(question) : question)) }
}

export function moveQuestion(exam: WrittenExam, id: string, delta: number): WrittenExam {
  const from = exam.questions.findIndex((question) => question.id === id)
  return moveQuestionTo(exam, id, from + delta)
}

export function moveQuestionTo(exam: WrittenExam, id: string, to: number): WrittenExam {
  const from = exam.questions.findIndex((question) => question.id === id)
  const target = Math.min(exam.questions.length - 1, Math.max(0, to))
  if (from === -1 || from === target) return exam
  const questions = [...exam.questions]
  const [moved] = questions.splice(from, 1)
  questions.splice(target, 0, moved)
  return { ...exam, questions }
}

export function removeQuestion(exam: WrittenExam, id: string): WrittenExam {
  return { ...exam, questions: exam.questions.filter((question) => question.id !== id) }
}

export function appendQuestion(exam: WrittenExam, question: ExamQuestion): WrittenExam {
  return { ...exam, questions: [...exam.questions, question] }
}

/** A question the teacher added by hand starts with a modest score so the total stays close to 100. */
export function withStartingPoints(question: ExamQuestion, points = 5): ExamQuestion {
  return question.points > 0 ? question : setQuestionPoints(question, points)
}

export function rubricTotal(question: Pick<ExamQuestion, 'rubric'>): number {
  return question.rubric.reduce((sum, item) => sum + item.points, 0)
}

/** The grading criteria rescaled so they add up to the question's points. */
export function fitRubric(question: ExamQuestion): ExamQuestion {
  return { ...question, rubric: scaleRubric(question.rubric, question.points) }
}

/** The right column's shuffle after the pairs or the extras changed in number: a fresh one that never shows an item opposite its own index. */
function reshuffle(question: ExamQuestion, pairs: ExamPair[], extras: string[]): number[] {
  const size = pairs.length + extras.length
  const same = question.rightOrder && question.rightOrder.length === size && (question.pairs?.length ?? 0) === pairs.length
  return same ? (question.rightOrder as number[]) : computeRightOrder(pairs.length, extras.length, `${question.id}:${pairs.length}:${extras.length}`)
}

/** Matching pairs changed in number: the right column gets a fresh shuffle that never shows a pair opposite its own. */
export function withPairs(question: ExamQuestion, pairs: ExamPair[]): ExamQuestion {
  const extras = question.extras ?? []
  return { ...question, pairs, rightOrder: reshuffle(question, pairs, extras) }
}

/** The extra right-column items (matching distractors) changed. */
export function withExtras(question: ExamQuestion, extras: string[]): ExamQuestion {
  const pairs = question.pairs ?? []
  const next: ExamQuestion = { ...question, extras }
  const sameSize = (question.extras ?? []).length === extras.length
  return { ...next, rightOrder: sameSize && question.rightOrder ? question.rightOrder : computeRightOrder(pairs.length, extras.length, `${question.id}:${pairs.length}:${extras.length}`) }
}

/** A list with the item at `index` moved by `delta` places (the list itself when it cannot move). */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

export function examTotal(exam: WrittenExam): number {
  return totalPoints(exam.questions)
}

export function copyQuestion(question: ExamQuestion): ExamQuestion {
  return { ...question, id: newQuestionId() }
}
