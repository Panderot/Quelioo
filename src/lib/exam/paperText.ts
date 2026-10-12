import type { ExamGroup, ExamQuestion, ExamQuestionType, PaperQuestion, WrittenExam } from './types'
import type { PaperLabels } from './paperLabels'

export { trUpper } from './paperLabels'

export const answerLetter = (index: number): string => String.fromCharCode(65 + index)


/** Pieces of a question text: plain text and $...$ / $$...$$ LaTeX. */
export interface TextPiece {
  math: boolean
  value: string
}

const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g

export function splitMath(text: string): TextPiece[] {
  const pieces: TextPiece[] = []
  let last = 0
  MATH_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MATH_RE.exec(text)) !== null) {
    if (match.index > last) pieces.push({ math: false, value: text.slice(last, match.index) })
    pieces.push({ math: true, value: match[1] ?? match[2] ?? '' })
    last = MATH_RE.lastIndex
  }
  if (last < text.length) pieces.push({ math: false, value: text.slice(last) })
  return pieces
}

/** Text without LaTeX delimiters, for length checks. */
export const withoutMath = (text: string): string => splitMath(text).map((piece) => piece.value).join('')

/** Runs of neighbouring questions of the same type (a "section" of the paper). */
export function paperSections(questions: PaperQuestion[]): { type: ExamQuestionType; questions: PaperQuestion[] }[] {
  const sections: { type: ExamQuestionType; questions: PaperQuestion[] }[] = []
  for (const question of questions) {
    const last = sections[sections.length - 1]
    if (last && last.type === question.type) last.questions.push(question)
    else sections.push({ type: question.type, questions: [question] })
  }
  return sections
}

const SHORT_OPTION_CHARS = 28

/** Options short enough to sit in two columns. */
export const optionsAreShort = (options: string[]): boolean => options.every((option) => withoutMath(option).length <= SHORT_OPTION_CHARS)

/** Matching: pair index shown at each position of the right column (a valid order, else a rotation). */
export function matchingOrder(question: Pick<ExamQuestion, 'pairs' | 'rightOrder'>): number[] {
  const count = question.pairs?.length ?? 0
  const order = question.rightOrder
  if (order && order.length === count && new Set(order).size === count && order.every((index) => index >= 0 && index < count)) return order
  return Array.from({ length: count }, (_, index) => (index + 1) % Math.max(count, 1))
}

/** "1-C, 2-A …": the right-column letter of each left item. */
export function matchingKey(question: Pick<ExamQuestion, 'pairs' | 'rightOrder'>): string {
  const order = matchingOrder(question)
  return (question.pairs ?? []).map((_, left) => `${left + 1}-${answerLetter(order.indexOf(left))}`).join(', ')
}

export interface KeyAnswer {
  /** Short answer (a letter, True/False, pair letters, the blank's word) */
  answer: string
  /** Fuller expected answer for written questions */
  expected: string | null
  accepted: string[]
}

/** Accepted answers other than the answer itself (the model often repeats it). */
const otherAccepted = (question: ExamQuestion): string[] => {
  const same = (value: string) => value.trim().toLocaleLowerCase() === question.answer.trim().toLocaleLowerCase()
  return (question.acceptableAnswers ?? []).filter((value) => value.trim() && !same(value))
}

export function keyAnswer(question: ExamQuestion, labels: PaperLabels): KeyAnswer {
  switch (question.type) {
    case 'mcq': {
      const index = question.answerIndex ?? 0
      return { answer: `${answerLetter(index)}) ${question.options?.[index] ?? ''}`, expected: null, accepted: [] }
    }
    case 'true-false':
      return { answer: question.answerBool ? labels.true : labels.false, expected: null, accepted: [] }
    case 'matching':
      return { answer: matchingKey(question), expected: null, accepted: [] }
    case 'fill-blanks':
      return { answer: question.answer, expected: null, accepted: otherAccepted(question) }
    default:
      return { answer: '', expected: question.answer, accepted: question.type === 'short-answer' ? otherAccepted(question) : [] }
  }
}

export interface TopicRow {
  number: number
  topic: string
  difficulty: string
  points: number
}

export const topicRows = (questions: PaperQuestion[], labels: PaperLabels): TopicRow[] =>
  questions.map((question) => ({ number: question.number, topic: question.topic, difficulty: labels.difficulty[question.difficulty], points: question.points }))

/** Slug for file names and the document title: ASCII only. */
export function asciiSlug(value: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (char) => map[char] ?? char)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function examFileBase(exam: Pick<WrittenExam, 'settings'>, part: 'exam' | 'key', group: ExamGroup | 'both'): string {
  const { header, groups } = exam.settings
  const bits = ['yazili', asciiSlug(header.grade) ? `${asciiSlug(header.grade)}-sinif` : '', asciiSlug(header.course)].filter(Boolean)
  if (part === 'key') bits.push('cevap-anahtari')
  if (groups && group !== 'both') bits.push(group)
  return bits.join('-')
}
