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
    .replace(/[.!?;:,。؟]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Levenshtein edit distance between two already-normalized strings. */
function editDistance(a: string, b: string): number {
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

/** Turkish nominal suffixes (already normalized: no diacritics, ı→i), stripped from the outside in:
 * copula, then case, then possessive, then plural — each category at most once. Verb suffixes are
 * never stripped (a verb's degree/tense is part of the answer). */
const TR_SUFFIX_LAYERS: readonly (readonly string[])[] = [
  ['dir', 'dur', 'tir', 'tur'],
  ['ndeki', 'ndaki', 'deki', 'daki', 'teki', 'taki', 'nden', 'ndan', 'nin', 'nun', 'yle', 'yla', 'den', 'dan', 'ten', 'tan', 'nde', 'nda', 'de', 'da', 'te', 'ta', 'le', 'la', 'ye', 'ya', 'yi', 'yu', 'in', 'un', 'ne', 'na', 'ni', 'nu', 'ce', 'ca', 'e', 'a', 'i', 'u'],
  ['imiz', 'umuz', 'iniz', 'unuz', 'leri', 'lari', 'si', 'su', 'im', 'um', 'i', 'u'],
  ['ler', 'lar'],
]

const MIN_STEM_LETTERS = 3
/** A single-vowel suffix (e.g. dative -a in "glikoza") may only be stripped when at least this many
 * letters remain — so "kara" never yields "kar" and "masa" never yields "mas". */
const MIN_STEM_AFTER_VOWEL = 4
/** Two-letter suffixes that are also common word endings ("yakın", "dakika"): same 4-letter minimum. */
const AMBIGUOUS_ENDINGS = new Set(['in', 'un', 'im', 'um', 'ni', 'nu', 'na', 'ne', 'ca', 'ce'])

/** Final-consonant hardening that undoes Turkish softening before a vowel suffix (ışığı → ışık). */
const HARDEN: Record<string, string> = { g: 'k', b: 'p', d: 't', c: 'c' }

/**
 * Conservative base forms of an EXPECTED Turkish answer (already normalized) — only its last word is
 * stripped, one suffix per layer, never below 3 letters. Never applied to the student's input.
 * Example: "organellerde" → ["organeller", "organel"]; "kökleriyle" → ["kokleri", "kokler", "kok"].
 */
export function turkishBaseForms(normalizedAnswer: string): string[] {
  const words = normalizedAnswer.split(' ')
  const last = words.pop() ?? ''
  const prefix = words.length > 0 ? `${words.join(' ')} ` : ''
  const forms: string[] = []
  let current = last
  for (const layer of TR_SUFFIX_LAYERS) {
    const suffix = layer.find((entry) => {
      if (!current.endsWith(entry)) return false
      const remaining = current.length - entry.length
      return remaining >= (entry.length === 1 || AMBIGUOUS_ENDINGS.has(entry) ? MIN_STEM_AFTER_VOWEL : MIN_STEM_LETTERS)
    })
    if (!suffix) continue
    current = current.slice(0, -suffix.length)
    forms.push(current)
    const hardened = HARDEN[current.slice(-1)]
    if (hardened && suffix.length <= 2 && /^[aeiu]/.test(suffix)) forms.push(current.slice(0, -1) + hardened)
  }
  return [...new Set(forms)].filter((form) => form.length >= MIN_STEM_LETTERS && form !== last).map((form) => prefix + form)
}

const TURKISH_HINT = /[çğışöüÇĞİŞÖÜ]|\b(ve|bir|bu|ile|için|nedir|hangi|olarak|değil)\b/i

/** True when Turkish matching rules apply: the quiz language is Turkish, or it was auto-detected and
 * the question text looks Turkish. */
export function usesTurkishRules(outputLanguage: string | undefined, sampleText: string): boolean {
  if (outputLanguage === 'tr') return true
  if (outputLanguage && outputLanguage !== 'auto') return false
  return TURKISH_HINT.test(sampleText)
}

export interface FillBlankMatchOptions {
  /** Apply the conservative Turkish base-form rule to the expected answers. */
  turkish?: boolean
  /** Answers of the OTHER questions in the quiz — a one-letter typo is never forgiven when it turns the
   * student's word into one of these. */
  otherAnswers?: string[]
}

/**
 * Fill-in-the-blank checking: exact match after normalization against the answer, any accepted
 * answer, and (Turkish only) the conservative base forms of those; then at most ONE typo for forms of
 * 6+ letters, never when the typed word is another question's answer or one of the accepted forms of
 * a different word. No other fuzzy matching.
 */
export function isFillBlankMatch(studentAnswer: string, correctAnswers: string[], options: FillBlankMatchOptions = {}): boolean {
  const candidate = normalizeAnswer(studentAnswer)
  if (!candidate) return false
  const accepted = new Set<string>()
  for (const answer of correctAnswers) {
    const normalized = normalizeAnswer(answer)
    if (!normalized) continue
    accepted.add(normalized)
    if (options.turkish) for (const form of turkishBaseForms(normalized)) accepted.add(form)
  }
  if (accepted.has(candidate)) return true

  const others = new Set((options.otherAnswers ?? []).map(normalizeAnswer).filter(Boolean))
  if (others.has(candidate)) return false
  for (const form of accepted) {
    if (form.length >= 6 && Math.abs(form.length - candidate.length) <= 1 && editDistance(candidate, form) <= 1) return true
  }
  return false
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
