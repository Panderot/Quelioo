import { computeDerangement } from '../matching'
import { newQuestionId } from './factory'
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

/** Matching pairs changed in number: the right column gets a fresh shuffle that never shows a pair opposite its own. */
export function withPairs(question: ExamQuestion, pairs: ExamPair[]): ExamQuestion {
  const sameSize = question.rightOrder && question.rightOrder.length === pairs.length
  return { ...question, pairs, rightOrder: sameSize ? question.rightOrder : computeDerangement(pairs.length, `${question.id}:${pairs.length}`) }
}

export function examTotal(exam: WrittenExam): number {
  return totalPoints(exam.questions)
}

export function copyQuestion(question: ExamQuestion): ExamQuestion {
  return { ...question, id: newQuestionId() }
}
