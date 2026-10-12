import { computeRightOrder } from './factory'
import { rightItems } from './paperText'
import type { ExamGroup, ExamQuestion, ExamQuestionType, PaperQuestion, WrittenExam } from './types'

export interface ExamSection {
  type: ExamQuestionType
  /** Index of the first question of the run, and one past the last (so `end - start` questions). */
  start: number
  end: number
}

/** Maximal runs of consecutive questions of the same type, in paper order. */
export function examSections(questions: Pick<ExamQuestion, 'type'>[]): ExamSection[] {
  const sections: ExamSection[] = []
  questions.forEach((question, index) => {
    const last = sections[sections.length - 1]
    if (last && last.type === question.type) last.end = index + 1
    else sections.push({ type: question.type, start: index, end: index + 1 })
  })
  return sections
}

/** "A", "B", "C" … for option and column letters. */
export function answerLetter(index: number): string {
  return String.fromCharCode(65 + index)
}

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seeded permutation of 0..n-1 that is not the identity (n >= 2) and passes `accept`. */
function permutation(n: number, rng: () => number, accept: (order: number[]) => boolean): number[] {
  const identity = Array.from({ length: n }, (_, i) => i)
  if (n < 2) return identity
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const order = [...identity]
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    if (accept(order)) return order
  }
  for (let k = 1; k < n; k += 1) {
    const rotated = identity.map((i) => (i + k) % n)
    if (accept(rotated)) return rotated
  }
  return identity.map((i) => (i + 1) % n)
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((value, index) => value === b[index])

/** The stored shuffle of a matching question's right column when it fits the column, else a stable one from the question id. */
function storedRightOrder(question: ExamQuestion): number[] {
  const size = rightItems(question).length
  const order = question.rightOrder
  if (order && order.length === size && new Set(order).size === size && order.every((value) => Number.isInteger(value) && value >= 0 && value < size)) return order
  return computeRightOrder(question.pairs?.length ?? 0, question.extras?.length ?? 0, question.id)
}

/** The questions as printed on paper A or B. B keeps every question and its points; inside each run
 * of one type the order differs, multiple choice options and the matching right column are shuffled.
 * Deterministic from the exam id, so the paper, the key, the print view and Word agree. */
export function buildGroup(exam: WrittenExam, group: ExamGroup): PaperQuestion[] {
  const questions = exam.questions
  if (group === 'A') {
    return questions.map((question, index) => ({
      ...question,
      ...(question.type === 'matching' && question.pairs ? { rightOrder: storedRightOrder(question) } : {}),
      number: index + 1,
      aNumber: index + 1,
    }))
  }

  const rng = mulberry32(hashString(`${exam.id}:B`))
  const ordered: number[] = []
  for (const section of examSections(questions)) {
    const size = section.end - section.start
    const order = permutation(size, rng, (candidate) => candidate.some((value, index) => value !== index))
    for (const offset of order) ordered.push(section.start + offset)
  }

  return ordered.map((sourceIndex, position) => {
    const question = questions[sourceIndex]
    const paper: PaperQuestion = { ...question, number: position + 1, aNumber: sourceIndex + 1 }
    if (question.type === 'mcq' && question.options) {
      const order = permutation(question.options.length, rng, (candidate) => candidate.some((value, index) => value !== index))
      paper.options = order.map((optionIndex) => question.options![optionIndex])
      paper.answerIndex = order.indexOf(question.answerIndex ?? 0)
    }
    if (question.type === 'matching' && question.pairs) {
      const n = rightItems(question).length
      const aOrder = storedRightOrder(question)
      paper.rightOrder = permutation(n, rng, (candidate) => candidate.every((value, index) => value !== index) && (n < 3 || !same(candidate, aOrder)))
    }
    return paper
  })
}
