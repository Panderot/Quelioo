import type { QuizQuestion, QuizQuestionType } from './quiz.js'
import type { QuestionType } from './quizTypes.js'

/**
 * Full fact coverage (pure, shared by the server and the client): the facts plan of a source, how its
 * facts become question slots per type, and which facts a quiz covers. Every fact must be asked at
 * least once; a list fact counts only when ALL its items are tested.
 */

/** The app's maximum question count (the server rejects more). Auto never exceeds it. */
export const MAX_QUESTION_COUNT = 30
/** Source words per key fact, calibrated on real plans (tests/accuracy/fact-coverage.ts: 75 words →
 * 8-9 facts, 296 → 35-40). */
export const WORDS_PER_FACT = 8
/** A list fact is tested item by item (single-answer types) up to this many items. */
export const MAX_LIST_ITEMS = 6
/** One short-answer/open-ended question asks for at most this many list items. */
const MAX_ALL_ITEMS = 5
export const MAX_PLAN_FACTS = 200
export const COVERAGE_VERSION = 1

type FactImportance = 'core' | 'supporting'

export interface CoverageFact {
  id: number
  /** 2-5 word topic label (shown to the student even while answers are hidden). */
  label: string
  /** The fact as one short statement (reveals answers: shown only with Show answers on). */
  statement: string
  /** The exact supporting source text. */
  span: string
  importance: FactImportance
  /** Relative position of the fact in the source, 0 (start) to 1 (end). */
  position: number
  /** List facts only (2+ items): the items; the fact is covered only when every item is tested. */
  items?: string[]
}

/** Stored on the quiz (and so in the Archive entry); absent on older quizzes. */
export interface QuizCoverage {
  version: number
  facts: CoverageFact[]
}

export interface PlannedFact extends CoverageFact {
  /** Comes from a part the student marked as focus. */
  focus: boolean
  /** Already asked by a question the student saw before (avoid list). */
  usedBefore: boolean
}

export interface QuestionSlot {
  type: QuizQuestionType
  factIds: number[]
  /** List facts: the item indices this slot tests. */
  items?: Record<number, number[]>
}

/** A fact to cover, optionally restricted to some of its list items. */
export interface FactEntry {
  fact: CoverageFact
  items?: number[]
}

export function isListFact(fact: Pick<CoverageFact, 'items'>): boolean {
  return (fact.items?.length ?? 0) >= 2
}

function allItems(fact: CoverageFact): number[] {
  return isListFact(fact) ? fact.items!.map((_, index) => index) : []
}

function entryItems(entry: FactEntry): number[] {
  return entry.items ?? allItems(entry.fact)
}

const SINGLE_TYPES = new Set<QuizQuestionType>(['mcq', 'true-false', 'fill-blanks'])
const MIXED_CYCLE: QuizQuestionType[] = ['mcq', 'true-false', 'fill-blanks', 'short-answer', 'matching', 'open-ended']
const MAX_MATCHING_PAIRS = 6

function slotOf(type: QuizQuestionType, parts: { id: number; items?: number[] }[]): QuestionSlot {
  const factIds: number[] = []
  const items: Record<number, number[]> = {}
  for (const part of parts) {
    if (!factIds.includes(part.id)) factIds.push(part.id)
    if (part.items && part.items.length > 0) items[part.id] = [...(items[part.id] ?? []), ...part.items]
  }
  return Object.keys(items).length > 0 ? { type, factIds, items } : { type, factIds }
}

/** How a list fact is asked: `split` one question per item (a fixed count with room), `whole` one question
 * that needs ALL items (Auto: a short-answer question, the single-answer types cannot ask a list). */
export type ListMode = 'split' | 'whole'

/** One question per fact; a list fact one question per item (at most MAX_LIST_ITEMS), or in `whole` mode
 * one short-answer question per MAX_ALL_ITEMS items that needs every one of them. */
function packSingle(entries: FactEntry[], type: QuizQuestionType, listMode: ListMode): QuestionSlot[] {
  return entries.flatMap((entry) => {
    if (!isListFact(entry.fact)) return [slotOf(type, [{ id: entry.fact.id }])]
    const items = entryItems(entry)
    if (listMode === 'whole') {
      const chunks = Math.ceil(items.length / MAX_ALL_ITEMS)
      const size = Math.ceil(items.length / chunks)
      return Array.from({ length: chunks }, (_, index) => slotOf('short-answer', [{ id: entry.fact.id, items: items.slice(index * size, (index + 1) * size) }]))
    }
    return items.slice(0, MAX_LIST_ITEMS).map((item) => slotOf(type, [{ id: entry.fact.id, items: [item] }]))
  })
}

/** A list fact is one question that needs all its items; two neighbouring facts of the same topic share one. */
function packShort(entries: FactEntry[]): QuestionSlot[] {
  const slots: QuestionSlot[] = []
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    if (isListFact(entry.fact)) {
      slots.push(slotOf('short-answer', [{ id: entry.fact.id, items: entryItems(entry).slice(0, MAX_ALL_ITEMS) }]))
      continue
    }
    const next = entries[index + 1]
    if (next && !isListFact(next.fact) && sameLabel(next.fact, entry.fact)) {
      slots.push(slotOf('short-answer', [{ id: entry.fact.id }, { id: next.fact.id }]))
      index++
    } else {
      slots.push(slotOf('short-answer', [{ id: entry.fact.id }]))
    }
  }
  return slots
}

function sameLabel(a: CoverageFact, b: CoverageFact): boolean {
  return a.label.trim().toLocaleLowerCase() === b.label.trim().toLocaleLowerCase()
}

/** Up to 3 neighbouring facts (at most MAX_ALL_ITEMS key points) per open-ended question. */
function packOpen(entries: FactEntry[]): QuestionSlot[] {
  const slots: QuestionSlot[] = []
  let group: { id: number; items?: number[] }[] = []
  let points = 0
  let lastFact: CoverageFact | null = null
  const flush = () => {
    if (group.length > 0) slots.push(slotOf('open-ended', group))
    group = []
    points = 0
  }
  for (const entry of entries) {
    const items = isListFact(entry.fact) ? entryItems(entry).slice(0, MAX_ALL_ITEMS) : undefined
    const weight = items ? items.length : 1
    const newTopic = lastFact !== null && !sameLabel(lastFact, entry.fact) && points >= 2
    if (group.length >= 3 || points + weight > MAX_ALL_ITEMS || newTopic) flush()
    group.push(items ? { id: entry.fact.id, items } : { id: entry.fact.id })
    points += weight
    lastFact = entry.fact
  }
  flush()
  return slots
}

/** One pair per fact or list item, 3-6 pairs per question, in source order. */
function packMatching(entries: FactEntry[]): QuestionSlot[] {
  const units = entries.flatMap((entry) =>
    isListFact(entry.fact) ? entryItems(entry).map((item) => ({ id: entry.fact.id, items: [item] })) : [{ id: entry.fact.id }],
  )
  if (units.length === 0) return []
  const count = Math.max(1, Math.ceil(units.length / MAX_MATCHING_PAIRS))
  const base = Math.floor(units.length / count)
  const extra = units.length % count
  const slots: QuestionSlot[] = []
  let start = 0
  for (let index = 0; index < count; index++) {
    const size = base + (index < extra ? 1 : 0)
    slots.push(slotOf('matching', units.slice(start, start + size)))
    start += size
  }
  return slots
}

/** Mixed: the type cycle spread over the facts in source order; list facts go to a type that tests all items. */
function packMixed(entries: FactEntry[]): QuestionSlot[] {
  const slots: QuestionSlot[] = []
  const queue = [...entries]
  let cycle = 0
  while (queue.length > 0) {
    const type = MIXED_CYCLE[cycle % MIXED_CYCLE.length]
    cycle++
    const head = queue[0]
    if (isListFact(head.fact)) {
      queue.shift()
      const items = entryItems(head)
      if (type === 'matching' && items.length >= 3) slots.push(slotOf('matching', items.slice(0, MAX_MATCHING_PAIRS).map((item) => ({ id: head.fact.id, items: [item] }))))
      else slots.push(slotOf(type === 'open-ended' ? 'open-ended' : 'short-answer', [{ id: head.fact.id, items: items.slice(0, MAX_ALL_ITEMS) }]))
      continue
    }
    if (type === 'matching' || type === 'open-ended') {
      const take = type === 'matching' ? 4 : 2
      const run: FactEntry[] = []
      while (run.length < take && queue.length > 0 && !isListFact(queue[0].fact)) run.push(queue.shift()!)
      if (type === 'matching' && run.length < 3) {
        slots.push(...run.map((entry) => slotOf('mcq', [{ id: entry.fact.id }])))
        continue
      }
      slots.push(slotOf(type, run.map((entry) => ({ id: entry.fact.id }))))
      continue
    }
    queue.shift()
    slots.push(slotOf(type, [{ id: head.fact.id }]))
  }
  return slots
}

/** Question slots that cover `entries` (in the given order) with the question type. */
export function packEntries(entries: FactEntry[], questionType: QuestionType, listMode: ListMode = 'split'): QuestionSlot[] {
  if (entries.length === 0) return []
  if (questionType === 'mixed') return packMixed(entries)
  if (SINGLE_TYPES.has(questionType)) return packSingle(entries, questionType, listMode)
  if (questionType === 'short-answer') return packShort(entries)
  if (questionType === 'open-ended') return packOpen(entries)
  return packMatching(entries)
}

/** Van der Corput sequence: 0, 1/2, 1/4, 3/4, … — picks evenly spread positions first. */
function vanDerCorput(index: number): number {
  let value = 0
  let base = 0.5
  let rest = index
  while (rest > 0) {
    if (rest & 1) value += base
    base /= 2
    rest >>= 1
  }
  return value
}

/** Facts reordered so that any prefix is spread over the whole source. */
function spreadOrder<T extends { position: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.position - b.position)
  const used = new Set<number>()
  const result: T[] = []
  for (let k = 0; result.length < sorted.length && k < sorted.length * 64; k++) {
    const index = Math.min(sorted.length - 1, Math.floor(vanDerCorput(k) * sorted.length))
    if (used.has(index)) continue
    used.add(index)
    result.push(sorted[index])
  }
  sorted.forEach((item, index) => {
    if (!used.has(index)) result.push(item)
  })
  return result
}

/** Most important first: fresh core, fresh supporting, then facts earlier quizzes already asked; each
 * group spread over the source; with focus facts about `focusShare` of every prefix is focus. */
function factPriority(facts: PlannedFact[], focusShare = 0.7): PlannedFact[] {
  const rank = (fact: PlannedFact) => (fact.usedBefore ? 2 : 0) + (fact.importance === 'core' ? 0 : 1)
  const ordered = (list: PlannedFact[]) =>
    [0, 1, 2, 3].flatMap((value) => spreadOrder(list.filter((fact) => rank(fact) === value)))
  const focus = ordered(facts.filter((fact) => fact.focus))
  const other = ordered(facts.filter((fact) => !fact.focus))
  if (focus.length === 0) return other
  const result: PlannedFact[] = []
  let fromFocus = 0
  let fromOther = 0
  while (fromFocus < focus.length || fromOther < other.length) {
    const wantFocus = fromFocus < Math.ceil(focusShare * (result.length + 1))
    if (fromFocus < focus.length && (wantFocus || fromOther >= other.length)) result.push(focus[fromFocus++])
    else result.push(other[fromOther++])
  }
  return result
}

export interface SlotPlan {
  slots: QuestionSlot[]
  /** Facts the slots cover (fully or, for very long lists, partly). */
  coveredFactIds: number[]
  /** Facts left out because the count (or the maximum count) has no room for them. */
  uncoveredFactIds: number[]
}

/**
 * Assigns facts to question slots. `auto`: every fact, up to MAX_QUESTION_COUNT questions (core facts
 * first when they do not all fit). A number: the most important facts that fit in that many
 * questions, combining facts where the type allows; never padded (fewer slots when the facts run out).
 */
export function planSlots(facts: PlannedFact[], questionType: QuestionType, target: number | 'auto', focusShare = 0.7): SlotPlan {
  const limit = target === 'auto' ? MAX_QUESTION_COUNT : Math.max(1, Math.min(target, MAX_QUESTION_COUNT))
  const byPosition = (list: PlannedFact[]) => [...list].sort((a, b) => a.position - b.position || a.id - b.id)
  // Auto asks a list with one question that needs all its items; a fixed count may spread the items.
  const listMode: ListMode = target === 'auto' ? 'whole' : 'split'
  const pack = (list: PlannedFact[]) => packEntries(byPosition(list).map((fact) => ({ fact })), questionType, listMode)
  let chosen: PlannedFact[] = []
  if (pack(facts).length <= limit) {
    chosen = facts
  } else {
    // A fixed count spreads over as many different facts as possible: a fact that needs several
    // questions on its own (a list asked item by item) only gets room after every single-question
    // fact that fits was taken. `auto` keeps the plain priority order.
    const ordered = factPriority(facts, focusShare)
    const passes = target === 'auto' ? [false] : [true, false]
    let used = pack(chosen).length
    for (const singleOnly of passes) {
      for (const fact of ordered) {
        if (chosen.includes(fact)) continue
        const trial = [...chosen, fact]
        const size = pack(trial).length
        if (size > limit || (singleOnly && size - used > 1)) continue
        chosen = trial
        used = size
      }
    }
  }
  const chosenIds = new Set(chosen.map((fact) => fact.id))
  return {
    slots: pack(chosen),
    coveredFactIds: facts.filter((fact) => chosenIds.has(fact.id)).map((fact) => fact.id),
    uncoveredFactIds: facts.filter((fact) => !chosenIds.has(fact.id)).map((fact) => fact.id),
  }
}

// ---------------------------------------------------------------------------------------------
// Coverage of a quiz
// ---------------------------------------------------------------------------------------------

export type FactStatus = 'covered' | 'partial' | 'missing'

export interface FactCoverageRow {
  fact: CoverageFact
  status: FactStatus
  /** 1-based numbers of the questions that test the fact. */
  questionNumbers: number[]
  /** Tested by a question the student edited (counted as covered, cannot be verified). */
  edited: boolean
  /** List facts: the item indices that are not tested yet. */
  missingItems: number[]
}

export interface CoverageSummary {
  rows: FactCoverageRow[]
  covered: number
  total: number
  complete: boolean
}

/** Item indices a question tests of a list fact (all when the question does not say). */
export function testedItems(question: QuizQuestion, fact: CoverageFact): number[] {
  const own = question.factItems?.[String(fact.id)]
  return own && own.length > 0 ? own : allItems(fact)
}

export function computeCoverage(coverage: QuizCoverage, questions: QuizQuestion[]): CoverageSummary {
  const rows = coverage.facts.map((fact): FactCoverageRow => {
    const questionNumbers: number[] = []
    const tested = new Set<number>()
    let edited = false
    questions.forEach((question, index) => {
      if (!question.factIds?.includes(fact.id)) return
      questionNumbers.push(index + 1)
      if (question.edited) edited = true
      for (const item of testedItems(question, fact)) tested.add(item)
    })
    const missingItems = allItems(fact).filter((item) => !tested.has(item))
    const status: FactStatus = questionNumbers.length === 0 ? 'missing' : missingItems.length > 0 ? 'partial' : 'covered'
    return { fact, status, questionNumbers, edited, missingItems }
  })
  const covered = rows.filter((row) => row.status === 'covered').length
  return { rows, covered, total: rows.length, complete: rows.length > 0 && covered === rows.length }
}

/** The facts (and, for partly covered lists, the items) a quiz still has to ask, in source order. */
export function missingEntries(coverage: QuizCoverage, questions: QuizQuestion[]): FactEntry[] {
  return computeCoverage(coverage, questions)
    .rows.filter((row) => row.status !== 'covered')
    .sort((a, b) => a.fact.position - b.fact.position)
    .map((row) => (row.status === 'partial' ? { fact: row.fact, items: row.missingItems } : { fact: row.fact }))
}

/** How many questions of the type the missing facts need. */
export function slotsNeededFor(entries: FactEntry[], questionType: QuestionType, listMode: ListMode = 'split'): number {
  return packEntries(entries, questionType, listMode).length
}

/** Pre-generation guess of an Auto quiz's size from the word count (before the plan exists). */
export function estimateAutoQuestionCount(wordCount: number, questionType: QuestionType): number {
  const facts = Math.max(3, Math.round(wordCount / WORDS_PER_FACT))
  // Questions per fact (a list is one question that needs all its items).
  const perFact: Record<QuestionType, number> = {
    mcq: 1,
    'true-false': 1,
    'fill-blanks': 1,
    'short-answer': 1,
    'open-ended': 0.8,
    matching: 0.45,
    mixed: 1.2,
  }
  return Math.max(1, Math.min(MAX_QUESTION_COUNT, Math.round(facts * perFact[questionType])))
}

// ---------------------------------------------------------------------------------------------
// Source sentences (shared with the Audio Lesson key points)
// ---------------------------------------------------------------------------------------------

export function splitSourceSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

export interface SentenceCoverage {
  /** 0-based indices of sentences linked to no fact and not marked as having no testable content. */
  gaps: number[]
  /** Share (0-1) of source words in sentences that are linked to a fact. */
  coveredWordShare: number
}

/** Every sentence must be linked to at least one fact or marked "no testable content". */
export function sentenceCoverage(sentences: string[], linked: Set<number>, noTestable: Set<number>): SentenceCoverage {
  const words = sentences.map((sentence) => sentence.split(/\s+/).filter(Boolean).length)
  const total = words.reduce((sum, count) => sum + count, 0)
  const covered = sentences.reduce((sum, _, index) => sum + (linked.has(index) ? words[index] : 0), 0)
  const gaps = sentences.map((_, index) => index).filter((index) => !linked.has(index) && !noTestable.has(index))
  return { gaps, coveredWordShare: total > 0 ? covered / total : 0 }
}

// ---------------------------------------------------------------------------------------------
// Validation of a plan sent back by the client (cache) or stored in the Archive
// ---------------------------------------------------------------------------------------------

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export function parseCoverageFacts(value: unknown): CoverageFact[] | null {
  if (!Array.isArray(value)) return null
  const facts: CoverageFact[] = []
  const seen = new Set<number>()
  for (const raw of value.slice(0, MAX_PLAN_FACTS)) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Record<string, unknown>
    const id = typeof entry.id === 'number' && Number.isInteger(entry.id) && entry.id > 0 ? entry.id : null
    const label = cleanText(entry.label, 60)
    const statement = cleanText(entry.statement, 300)
    if (id === null || seen.has(id) || !label || !statement) continue
    seen.add(id)
    const items = Array.isArray(entry.items) ? entry.items.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 12) : []
    const position = typeof entry.position === 'number' && entry.position >= 0 && entry.position <= 1 ? entry.position : 0
    facts.push({
      id,
      label,
      statement,
      span: cleanText(entry.span, 600),
      importance: entry.importance === 'supporting' ? 'supporting' : 'core',
      position,
      ...(items.length >= 2 ? { items } : {}),
    })
  }
  return facts.length > 0 ? facts : null
}

export function parseQuizCoverage(value: unknown): QuizCoverage | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const facts = parseCoverageFacts((value as { facts?: unknown }).facts)
  return facts ? { version: COVERAGE_VERSION, facts } : undefined
}
