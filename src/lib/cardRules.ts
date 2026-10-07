import { scriptCounts, textMatchesLanguage } from './cardLanguage.js'
import type { CardStyle } from './cardGeneration.js'
import { normalizeFront } from './flashcardText.js'

/** Per-type rules and duplicate detection for generated cards (pure; the server enforces them, tests cover them). */

export type CardViolation =
  | 'front_not_question'
  | 'front_is_question'
  | 'front_too_long'
  | 'front_is_topic'
  | 'back_too_long'
  | 'back_no_example'
  | 'wrong_language'

export interface RuleContext {
  style: CardStyle
  /** Language the card text must be written in (the translation for the foreign-word type). */
  outputLanguage: string
  /** Typed topic or deck name: a term card must not be titled with it. */
  topic?: string
}

const QUESTION_END = /[?？؟;]["')\]»”]?\s*$/
/** Armenian puts the question mark (՞) on the question word and ends the sentence with "։", so it never ends with one. */
const isQuestion = (front: string) => QUESTION_END.test(front) || front.includes('՞')

function isCjk(text: string): boolean {
  const counts = scriptCounts(text)
  return counts.han + counts.kana + counts.hangul > counts.latin
}

/** Words of a text; CJK text has no spaces, so two characters count as one word. */
function cardWordCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  if (isCjk(trimmed)) return Math.ceil(trimmed.replace(/\s+/g, '').length / 2)
  return trimmed.split(/\s+/).length
}

/** Splits a foreign-word back "translation — example sentence" at the first dash or line break. */
export function splitTranslationBack(back: string): { translation: string; example: string } {
  const match = /\s[—–]\s|\s-\s|\n+/.exec(back)
  if (!match) return { translation: back.trim(), example: '' }
  return { translation: back.slice(0, match.index).trim(), example: back.slice(match.index + match[0].length).trim() }
}

const TERM_MAX_WORDS = 4
const FOREIGN_MAX_WORDS = 6
const QA_BACK_MAX_LINES = 2

/** The first rule a card breaks for its type, or null when it is fine. */
export function cardViolation(card: { front: string; back: string }, context: RuleContext): CardViolation | null {
  const front = card.front.trim()
  const back = card.back.trim()
  if (context.style === 'qa') {
    const cjkLike = ['ja', 'zh', 'ko'].some((code) => context.outputLanguage.startsWith(code))
    if (!isQuestion(front) && !(cjkLike && front.length >= 4)) return 'front_not_question'
    if (back.split(/\n+/).length > QA_BACK_MAX_LINES) return 'back_too_long'
  } else if (context.style === 'term') {
    if (isQuestion(front)) return 'front_is_question'
    if (cardWordCount(front) > TERM_MAX_WORDS) return 'front_too_long'
    if (context.topic && normalizeFront(front) === normalizeFront(context.topic)) return 'front_is_topic'
    if (/:\s*$/.test(front)) return 'front_too_long'
  } else {
    if (isQuestion(front)) return 'front_is_question'
    if (cardWordCount(front) > FOREIGN_MAX_WORDS) return 'front_too_long'
    const { translation, example } = splitTranslationBack(back)
    if (!translation || cardWordCount(example) < 3) return 'back_no_example'
  }
  const checked = context.style === 'translation' ? [splitTranslationBack(back).translation] : [front, back]
  for (const text of checked) if (textMatchesLanguage(text, context.outputLanguage) === false) return 'wrong_language'
  return null
}

export const VIOLATION_HINTS: Record<CardViolation, string> = {
  front_not_question: 'the front must be a complete question that ends with a question mark',
  front_is_question: 'the front must be a bare term or word, not a question',
  front_too_long: 'the front must be a short term of 1 to 4 words (a word or short phrase for foreign words), not a title or a sentence',
  front_is_topic: 'the front must not be the topic or the deck name; use a real term from the content',
  back_too_long: 'the back must be the short answer first and at most one more short line',
  back_no_example: 'the back must be "translation — one short example sentence in the studied language"',
  wrong_language: 'the card is not written in the required output language; write every part in it',
}

// --- duplicates --------------------------------------------------------------------------------

function tokens(text: string): Set<string> {
  const lower = text.toLocaleLowerCase()
  if (isCjk(lower)) {
    const chars = [...lower.replace(/[\s\p{P}\p{S}]/gu, '')]
    return new Set(chars.slice(0, -1).map((char, index) => char + chars[index + 1]))
  }
  const words = lower.match(/[\p{L}\p{N}]+/gu) ?? []
  // A five-letter stem makes "dışta"/"dış" and "colour"/"colours" one token, a cheap fit for suffix languages.
  return new Set(words.filter((word) => word.length >= 3).map((word) => word.slice(0, 5)))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  return shared / (a.size + b.size - shared)
}

/** Two cards that ask the same thing: nearly the same front, or similar fronts with the same answer. */
export function isNearDuplicate(a: { front: string; back: string }, b: { front: string; back: string }): boolean {
  if (normalizeFront(a.front) === normalizeFront(b.front)) return true
  const front = jaccard(tokens(a.front), tokens(b.front))
  if (front >= 0.7) return true
  const back = jaccard(tokens(a.back), tokens(b.back))
  return (front >= 0.35 && back >= 0.6) || (normalizeFront(a.back) === normalizeFront(b.back) && front >= 0.2)
}

/** A front compared with deck fronts only (no back known). */
function repeatsFront(front: string, existing: string[]): boolean {
  const mine = tokens(front)
  const key = normalizeFront(front)
  return existing.some((other) => normalizeFront(other) === key || jaccard(mine, tokens(other)) >= 0.75)
}

/** Keeps the first of every group of near-duplicates, also against `existing` cards and deck fronts. Returns what was dropped. */
export function dropNearDuplicates<T extends { front: string; back: string }>(cards: T[], existing: { front: string; back: string }[] = [], deckFronts: string[] = []): { kept: T[]; dropped: T[] } {
  const kept: T[] = []
  const dropped: T[] = []
  for (const card of cards) {
    if (repeatsFront(card.front, deckFronts) || existing.some((other) => isNearDuplicate(card, other)) || kept.some((other) => isNearDuplicate(card, other))) dropped.push(card)
    else kept.push(card)
  }
  return { kept, dropped }
}

// --- angles ------------------------------------------------------------------------------------

/** Ways to look at one fact. Cards in a batch use different angles; a repeat run shuffles them. */
export const CARD_ANGLES = [
  'definition: what it is',
  'cause: why or how it happens',
  'condition: what must be true for it to happen',
  'number or measure: a figure, date, size or count',
  'order or sequence: what comes first, next or last',
  'comparison: how it differs from something similar',
  'what happens if: a consequence or a changed condition',
  'application: where it is used or seen',
  'misconception: a common wrong belief and the truth',
  'reverse direction: start from the answer and ask for the term',
] as const

/** A seeded shuffle so a prompt can carry a different angle order each run without a random source in tests. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items]
  let state = seed >>> 0 || 1
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = state % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
