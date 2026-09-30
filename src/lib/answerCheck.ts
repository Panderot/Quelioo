import type { QuizQuestion } from './quiz.js'

/** Lenient local answer checking for fill-blanks and short-answer questions — normalizes both the
 * student's text and the correct answer(s) the same way, then allows a tiny typo tolerance, so a
 * student isn't marked wrong for case, Turkish dotted/dotless i, accents or a stray keystroke. */

/** Turkish-aware lowercase + diacritic stripping + whitespace/punctuation cleanup. Deliberately
 * aggressive (removes ç/ş/ö/ü/ğ diacritics too) since this is only used to compare short answers
 * leniently, never to display text. */
export function normalizeAnswer(input: string): string {
  return input
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?;:,]+$/, '')
}

/** Levenshtein edit distance between two already-normalized strings. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const rows = a.length + 1
  const cols = b.length + 1
  const distances = Array.from({ length: rows }, (_, i) => [i, ...Array<number>(cols - 1).fill(0)])
  for (let j = 1; j < cols; j++) distances[0][j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      if (a[i - 1] === b[j - 1]) {
        distances[i][j] = distances[i - 1][j - 1]
      } else {
        distances[i][j] = 1 + Math.min(distances[i - 1][j], distances[i][j - 1], distances[i - 1][j - 1])
      }
    }
  }
  return distances[rows - 1][cols - 1]
}

/** Edit-distance tolerance for a normalized answer of this length: none below 6 characters, 1 from
 * 6, 2 from 12 — long enough answers can absorb a small typo without being marked wrong. */
function toleranceForLength(length: number): number {
  if (length >= 12) return 2
  if (length >= 6) return 1
  return 0
}

/** True if `candidate` matches `correctAnswer` exactly after normalization, or is within the
 * length-scaled typo tolerance of it. */
function isLenientMatchOne(normalizedCandidate: string, correctAnswer: string): boolean {
  const normalizedCorrect = normalizeAnswer(correctAnswer)
  if (!normalizedCorrect) return false
  if (normalizedCandidate === normalizedCorrect) return true
  const tolerance = toleranceForLength(normalizedCorrect.length)
  if (tolerance === 0) return false
  return editDistance(normalizedCandidate, normalizedCorrect) <= tolerance
}

/** True if the student's answer leniently matches the model answer or any acceptable alternative. */
export function isLenientMatch(studentAnswer: string, correctAnswers: string[]): boolean {
  const normalizedCandidate = normalizeAnswer(studentAnswer)
  if (!normalizedCandidate) return false
  return correctAnswers.some((correct) => isLenientMatchOne(normalizedCandidate, correct))
}

/** A stable string capturing exactly the content that determines correctness for a question —
 * used to reset a student's in-progress check state (value, result, error) whenever that content
 * actually changes (edit, regenerate, replace), without resetting on unrelated re-renders. Two
 * questions with the same id but different correctness-relevant content produce different
 * signatures; unrelated field changes (e.g. explanation text) don't affect it. */
function baseAnswerSignature(question: QuizQuestion): string {
  switch (question.type) {
    case 'mcq':
      return `mcq|${question.options.join('\u0000')}|${question.answerIndex}`
    case 'true-false':
      return `tf|${question.answerBool}`
    case 'fill-blanks':
      return `fill|${question.answer}|${(question.acceptableAnswers ?? []).join('\u0000')}`
    case 'short-answer':
      return `short|${question.answer}|${(question.acceptableAnswers ?? []).join('\u0000')}|${question.evidence ?? ''}`
    case 'open-ended':
      return `open|${question.answer}|${(question.keyPoints ?? []).join('\u0000')}|${question.evidence ?? ''}`
    case 'matching':
      return `matching|${question.pairs.map((pair) => `${pair.left}\u0000${pair.right}`).join('\u0001')}|${(question.rightOrder ?? []).join(',')}`
  }
}

/** Same as baseAnswerSignature, plus the question's hints — so hint-reveal state (useHints) also
 * resets whenever hints change (edit, regenerate, replace), the same triggers as the rest of the
 * per-question check state built on this signature. */
export function answerSignature(question: QuizQuestion): string {
  return `${baseAnswerSignature(question)}|hints:${(question.hints ?? []).join('\u0000')}`
}
