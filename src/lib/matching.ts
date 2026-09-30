import type { MatchingQuestion } from './quiz.js'

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0
  }
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

function isFixedPointFree(order: number[]): boolean {
  return order.every((value, index) => value !== index)
}

/** True if `order` is `identity` rotated by a constant step (order[i] === (i + k) % n for every i). */
function isRotationOfIdentity(order: number[], n: number): boolean {
  const k = order[0]
  for (let i = 0; i < n; i++) {
    if (order[i] !== (i + k) % n) return false
  }
  return true
}

/** True if `order` is the reversed identity ([n-1, n-2, ..., 0]) rotated by a constant step. */
function isRotationOfReverse(order: number[], n: number): boolean {
  const k = (((order[0] - (n - 1)) % n) + n) % n
  for (let i = 0; i < n; i++) {
    const expected = (((n - 1 + k - i) % n) + n) % n
    if (order[i] !== expected) return false
  }
  return true
}

// Hand-picked derangements for the only case the 50-attempt random search could plausibly (if
// astronomically unlikely) exhaust: n >= 4 where plain rotations are also rejected. Each was
// verified by hand to have no fixed point and to not be a rotation of the identity or its reverse.
const GUARANTEED_NON_ROTATION_DERANGEMENT: Record<number, number[]> = {
  4: [1, 3, 0, 2],
  5: [1, 3, 0, 4, 2],
  6: [1, 3, 5, 0, 2, 4],
}

/**
 * A permutation of [0..n) with no fixed point (index i never maps to i) — this is what keeps a
 * matching card's shuffled right-hand column from ever lining up with its own left-hand row. For
 * n >= 4 it additionally rejects a plain rotation of the identity order or of its reverse, since
 * either would still look too predictable/guessable. Deterministic from `seed` (the question id)
 * so the same question always renders the same shuffle across renders, reloads, Archive and print,
 * without needing to persist anything extra.
 */
export function computeDerangement(n: number, seed: string): number[] {
  const identity = Array.from({ length: n }, (_, i) => i)
  if (n <= 1) return identity

  const rejectRotations = n >= 4
  const rng = mulberry32(hashString(seed))
  const order = [...identity]

  for (let attempt = 0; attempt < 50; attempt++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    if (!isFixedPointFree(order)) continue
    if (rejectRotations && (isRotationOfIdentity(order, n) || isRotationOfReverse(order, n))) continue
    return order
  }

  if (rejectRotations) return GUARANTEED_NON_ROTATION_DERANGEMENT[n] ?? identity.map((_, index) => (index + 1) % n)
  // n <= 3: every derangement of 3 elements IS a rotation, so a plain rotation is the correct,
  // only-possible fallback here (and is never reached for n <= 1 since those return above).
  return identity.map((_, index) => (index + 1) % n)
}

/** The stored shuffle order if present and still the right length, else a stable order computed
 * from the question id — so legacy archived questions (saved before rightOrder existed) still
 * render a consistent, non-identity shuffle without a data migration. */
export function getRightOrder(question: Pick<MatchingQuestion, 'id' | 'pairs' | 'rightOrder'>): number[] {
  if (question.rightOrder && question.rightOrder.length === question.pairs.length) return question.rightOrder
  return computeDerangement(question.pairs.length, question.id)
}

export function letterFor(index: number): string {
  return String.fromCharCode(65 + index)
}

/** positionForPairIndex[pairIndex] = the right-column position (letter index) showing that pair's right value — the inverse of rightOrder. */
export function invertRightOrder(rightOrder: number[]): number[] {
  const positionForPairIndex: number[] = []
  rightOrder.forEach((pairIndex, position) => {
    positionForPairIndex[pairIndex] = position
  })
  return positionForPairIndex
}

/** "1 → C · 2 → A · 3 → B" — for each left row (in order), which letter its correct match landed on. */
export function buildAnswerKeyLine(rightOrder: number[]): string {
  return invertRightOrder(rightOrder)
    .map((position, pairIndex) => `${pairIndex + 1} → ${letterFor(position)}`)
    .join(' · ')
}

// ---- Student answer parsing/checking (matching answer-check field) ----

export interface ParsedMatchingPair {
  number: number
  letter: string
}

/**
 * Tolerantly extracts (number, letter) pairs from free-form student input — accepts "1-A, 2-C",
 * "1A 2C", "1=A", "1:A", "1→A", "1) A", lowercase, extra whitespace/line breaks, and reverse
 * order "A-1". Scans the whole string rather than splitting on a fixed delimiter first, since the
 * separator between pairs (comma, space, newline...) and within a pair (-, =, :, →, ), nothing)
 * can both vary independently.
 */
export function parseMatchingAnswerText(text: string): ParsedMatchingPair[] {
  const pattern = /(\d+)\s*[-=:→)]?\s*([a-zA-Z])|([a-zA-Z])\s*[-=:→)]?\s*(\d+)/g
  const results: ParsedMatchingPair[] = []
  for (const match of text.matchAll(pattern)) {
    if (match[1] !== undefined && match[2] !== undefined) {
      results.push({ number: Number.parseInt(match[1], 10), letter: match[2].toUpperCase() })
    } else if (match[3] !== undefined && match[4] !== undefined) {
      results.push({ number: Number.parseInt(match[4], 10), letter: match[3].toUpperCase() })
    }
  }
  return results
}

export type MatchingCheckResult =
  | { status: 'unreadable' }
  | { status: 'incomplete'; answeredCount: number }
  | { status: 'checked'; allCorrect: boolean; perPairCorrect: boolean[] }

/**
 * Parses and validates a student's matching answer against the correct (left-index -> letter)
 * mapping derived from rightOrder. Out-of-range or duplicate numbers are dropped (last write for
 * a given number wins) before judging completeness, so a student correcting themselves mid-string
 * doesn't get penalized for an earlier typo.
 */
export function checkMatchingAnswer(text: string, pairCount: number, rightOrder: number[]): MatchingCheckResult {
  const maxLetter = letterFor(pairCount - 1)
  const byNumber = new Map<number, string>()
  for (const { number, letter } of parseMatchingAnswerText(text)) {
    if (number < 1 || number > pairCount) continue
    if (letter < 'A' || letter > maxLetter) continue
    byNumber.set(number, letter)
  }

  if (byNumber.size === 0) return { status: 'unreadable' }
  if (byNumber.size < pairCount) return { status: 'incomplete', answeredCount: byNumber.size }

  const positionForPairIndex = invertRightOrder(rightOrder)
  const perPairCorrect: boolean[] = []
  for (let leftIndex = 0; leftIndex < pairCount; leftIndex++) {
    const correctLetter = letterFor(positionForPairIndex[leftIndex])
    perPairCorrect.push(byNumber.get(leftIndex + 1) === correctLetter)
  }
  return { status: 'checked', allCorrect: perPairCorrect.every(Boolean), perPairCorrect }
}
