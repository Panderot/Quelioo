/** Leitner spaced repetition — pure functions only, so they stay unit-testable with a fixed clock.
 * Practice mode never calls `gradeCard`: practice is not scheduling. */

export type LeitnerBox = 1 | 2 | 3 | 4 | 5

/** Days until a card in each box is due again (box 1 = later the same day). */
export const BOX_INTERVAL_DAYS: Record<LeitnerBox, number> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 16 }

export const DEFAULT_NEW_PER_DAY = 20
/** How many times one card may be re-queued after "Don't know" within a single session. */
export const MAX_REQUEUES_PER_SESSION = 3
/** Cards in this box or higher count as mastered (progress ring). */
export const MASTERED_BOX: LeitnerBox = 4

export interface SrsCard {
  id: string
  front: string
  back: string
  box: LeitnerBox
  due: number
  lapses: number
  reviews: number
  lastReviewedAt: number | null
  /** When the card was graded for the first time — counts it against that local day's new-card limit. */
  introducedAt: number | null
  createdAt: number
}

export type SrsProgress = Pick<SrsCard, 'box' | 'due' | 'lapses' | 'reviews' | 'lastReviewedAt' | 'introducedAt'>

export function startOfLocalDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Local midnight `days` calendar days after `time` (DST-safe: steps by calendar date, not by 24h). */
export function addLocalDays(time: number, days: number): number {
  const date = new Date(startOfLocalDay(time))
  date.setDate(date.getDate() + days)
  return date.getTime()
}

/** Known: one box up, due at the start of the new box's day. Unknown: back to box 1, due now. */
export function gradeCard(card: SrsCard, known: boolean, now: number): SrsProgress {
  const introducedAt = card.introducedAt ?? now
  if (!known) {
    return { box: 1, due: now, lapses: card.lapses + 1, reviews: card.reviews + 1, lastReviewedAt: now, introducedAt }
  }
  const box = Math.min(5, card.box + 1) as LeitnerBox
  return { box, due: addLocalDays(now, BOX_INTERVAL_DAYS[box]), lapses: card.lapses, reviews: card.reviews + 1, lastReviewedAt: now, introducedAt }
}

export function resetProgress(now: number): SrsProgress {
  return { box: 1, due: now, lapses: 0, reviews: 0, lastReviewedAt: null, introducedAt: null }
}

/** A card with an empty side can't be studied. */
export function isStudyable(card: Pick<SrsCard, 'front' | 'back'>): boolean {
  return card.front.trim() !== '' && card.back.trim() !== ''
}

export function isNewCard(card: Pick<SrsCard, 'reviews'>): boolean {
  return card.reviews === 0
}

/** New cards introduced (first graded) since local midnight. */
export function newIntroducedToday(cards: SrsCard[], now: number): number {
  const dayStart = startOfLocalDay(now)
  return cards.filter((card) => card.introducedAt !== null && card.introducedAt >= dayStart).length
}

/** The cards to study now: due reviews first (oldest due first), then new cards (oldest first)
 * capped by what's left of today's new-card limit. Empty when nothing is due — never "all cards". */
export function buildStudyQueue(cards: SrsCard[], now: number, newPerDay: number): SrsCard[] {
  const studyable = cards.filter(isStudyable)
  const reviews = studyable
    .filter((card) => !isNewCard(card) && card.due <= now)
    .sort((a, b) => a.due - b.due || a.createdAt - b.createdAt)
  const newAllowance = Math.max(0, newPerDay - newIntroducedToday(cards, now))
  const fresh = studyable
    .filter((card) => isNewCard(card) && card.due <= now)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, newAllowance)
  return [...reviews, ...fresh]
}

/** Earliest future due time among studyable cards, or null when nothing is scheduled ahead. New
 * cards held back only by the daily limit become available at the next local midnight. */
export function nextDueAt(cards: SrsCard[], now: number, newPerDay: number): number | null {
  const studyable = cards.filter(isStudyable)
  let next: number | null = null
  for (const card of studyable) {
    if (!isNewCard(card) && card.due > now && (next === null || card.due < next)) next = card.due
  }
  const blockedNew = studyable.some((card) => isNewCard(card)) && buildStudyQueue(cards, now, newPerDay).every((card) => !isNewCard(card))
  if (blockedNew) {
    const tomorrow = addLocalDays(now, 1)
    if (next === null || tomorrow < next) next = tomorrow
  }
  return next
}

// --- Session ---------------------------------------------------------------------------------

export interface SessionState {
  /** Card ids in the order they will be shown; "Don't know" appends the id again. */
  queue: string[]
  position: number
  requeues: Record<string, number>
  /** Last answer per card id in this session. */
  lastAnswer: Record<string, boolean>
  /** Every answer given, in order — drives the progress dots. */
  answers: boolean[]
}

export function startSession(cardIds: string[]): SessionState {
  return { queue: [...cardIds], position: 0, requeues: {}, lastAnswer: {}, answers: [] }
}

export function currentCardId(state: SessionState): string | null {
  return state.queue[state.position] ?? null
}

export function isSessionDone(state: SessionState): boolean {
  return state.position >= state.queue.length
}

/** Records an answer for the current card; "Don't know" re-queues it at the end (max 3 times). */
export function answerCurrent(state: SessionState, known: boolean): SessionState {
  const id = currentCardId(state)
  if (id === null) return state
  const used = state.requeues[id] ?? 0
  const requeue = !known && used < MAX_REQUEUES_PER_SESSION
  return {
    queue: requeue ? [...state.queue, id] : state.queue,
    position: state.position + 1,
    requeues: requeue ? { ...state.requeues, [id]: used + 1 } : state.requeues,
    lastAnswer: { ...state.lastAnswer, [id]: known },
    answers: [...state.answers, known],
  }
}

export interface SessionSummary {
  total: number
  known: number
  toRepeat: string[]
}

/** Distinct cards seen; "known" = last answer was Know; the rest need repeating. */
export function summarizeSession(state: SessionState): SessionSummary {
  const ids = Object.keys(state.lastAnswer)
  const toRepeat = ids.filter((id) => !state.lastAnswer[id])
  return { total: ids.length, known: ids.length - toRepeat.length, toRepeat }
}
