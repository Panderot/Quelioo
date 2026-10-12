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

/** The right column of a matching question in stored order: the pairs' rights, then the extra items. */
export function rightItems(question: Pick<ExamQuestion, 'pairs' | 'extras'>): string[] {
  return [...(question.pairs ?? []).map((pair) => pair.right), ...(question.extras ?? [])]
}

/** Matching: the item shown at each position of the right column, as an index into `rightItems` (a valid order, else a rotation). */
export function matchingOrder(question: Pick<ExamQuestion, 'pairs' | 'extras' | 'rightOrder'>): number[] {
  const count = rightItems(question).length
  const order = question.rightOrder
  if (order && order.length === count && new Set(order).size === count && order.every((index) => index >= 0 && index < count)) return order
  return Array.from({ length: count }, (_, index) => (index + 1) % Math.max(count, 1))
}

/** The text of the right column, top to bottom (one entry per position). */
export function rightColumn(question: Pick<ExamQuestion, 'pairs' | 'extras' | 'rightOrder'>): string[] {
  const items = rightItems(question)
  return matchingOrder(question).map((index) => items[index] ?? '')
}

/** "1-C, 2-A …": the right-column letter of each left item. */
export function matchingKey(question: Pick<ExamQuestion, 'pairs' | 'extras' | 'rightOrder'>): string {
  const order = matchingOrder(question)
  return (question.pairs ?? []).map((_, left) => `${left + 1}-${answerLetter(order.indexOf(left))}`).join(', ')
}

export interface KeyAnswer {
  /** Short answer (a letter, True/False, pair letters, the blank's word) */
  answer: string
  /** Fuller expected answer for written questions */
  expected: string | null
  /** "Beklenen cevap", or "Örnek cevap" when the question accepts other valid answers (evaluation and creation). */
  expectedLabel: string
  /** Other accepted answers, each without trailing punctuation. */
  accepted: string[]
}

/** Accepted answers other than the answer itself (the model often repeats it), without ".", ";" and the like at the end. */
const otherAccepted = (question: ExamQuestion): string[] => {
  const clean = (value: string) => value.trim().replace(/[\s.;,:!]+$/u, '')
  const same = (value: string) => value.toLocaleLowerCase('tr-TR') === clean(question.answer).toLocaleLowerCase('tr-TR')
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of question.acceptableAnswers ?? []) {
    const value = clean(raw)
    const key = value.toLocaleLowerCase('tr-TR')
    if (!value || same(value) || seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

/** Accepted answers as one line: "a / b / c". */
export const acceptedLine = (accepted: string[]): string => accepted.join(' / ')

export function keyAnswer(question: ExamQuestion, labels: PaperLabels): KeyAnswer {
  const sample = question.type === 'open-ended' && (question.bloomLevel ?? 0) >= 5
  const expectedLabel = sample ? labels.sample : labels.expected
  switch (question.type) {
    case 'mcq': {
      const index = question.answerIndex ?? 0
      return { answer: `${answerLetter(index)}) ${question.options?.[index] ?? ''}`, expected: null, expectedLabel, accepted: [] }
    }
    case 'true-false':
      return { answer: question.answerBool ? labels.true : labels.false, expected: null, expectedLabel, accepted: [] }
    case 'matching':
      return { answer: matchingKey(question), expected: null, expectedLabel, accepted: [] }
    case 'fill-blanks':
      return { answer: question.answer, expected: null, expectedLabel, accepted: otherAccepted(question) }
    default:
      return { answer: '', expected: question.answer, expectedLabel, accepted: question.type === 'short-answer' ? otherAccepted(question) : [] }
  }
}

/** Slug for file names and the document title: ASCII only. */
export function asciiSlug(value: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (char) => map[char] ?? char)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** "Biyoloji-9-Sinif-Yazili-A-Grubu-Cevap-Anahtari": the name a saved paper gets (title of the print page, name of the Word file). */
export function examFileBase(exam: Pick<WrittenExam, 'settings'>, part: 'exam' | 'key', group: ExamGroup | 'both'): string {
  const { header, groups } = exam.settings
  const cap = (value: string) => value.replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => `${dash}${letter.toUpperCase()}`)
  const grade = asciiSlug(header.grade)
  const bits = [cap(asciiSlug(header.course)), grade ? (/^\d+$/.test(grade) ? `${grade}-Sinif` : cap(grade)) : '', 'Yazili'].filter(Boolean)
  if (groups && group !== 'both') bits.push(`${group}-Grubu`)
  if (part === 'key') bits.push('Cevap-Anahtari')
  return bits.join('-')
}
