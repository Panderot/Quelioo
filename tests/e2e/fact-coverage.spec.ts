import { expect, test } from '@playwright/test'

import {
  MAX_LIST_ITEMS,
  MAX_QUESTION_COUNT,
  WORDS_PER_FACT,
  computeCoverage,
  estimateAutoQuestionCount,
  missingEntries,
  packEntries,
  parseCoverageFacts,
  planSlots,
  sentenceCoverage,
  slotsNeededFor,
  splitSourceSentences,
} from '../../src/lib/factCoverage'
import type { CoverageFact, PlannedFact, QuizCoverage } from '../../src/lib/factCoverage'
import type { QuizQuestion } from '../../src/lib/quiz'
import { findDuplicates, markUsedBefore } from '../../src/lib/quizQuality'

// Pure unit tests (no browser) for full fact coverage: plan validation, sentence coverage, slot
// assignment per type, coverage state and its updates, the Auto count and the words-per-fact guess.

const fact = (id: number, extra: Partial<PlannedFact> = {}): PlannedFact => ({
  id,
  label: `Topic ${id}`,
  statement: `Statement ${id}`,
  span: `Source sentence ${id}.`,
  importance: 'core',
  position: (id - 1) / 10,
  focus: false,
  usedBefore: false,
  ...extra,
})

/** The photosynthesis plan: inputs (3 items), rate factors (4 items) and single facts. */
const PLAN: PlannedFact[] = [
  fact(1, { label: 'Definition' }),
  fact(2, { label: 'Location' }),
  fact(3, { label: 'Inputs', items: ['carbon dioxide', 'water', 'light'] }),
  fact(4, { label: 'Products', items: ['glucose', 'oxygen'] }),
  fact(5, { label: 'Rate factors', items: ['light intensity', 'carbon dioxide amount', 'temperature', 'water amount'] }),
  fact(6, { label: 'Storage', importance: 'supporting' }),
]

const coverage: QuizCoverage = { version: 1, facts: PLAN }

const q = (id: string, factIds: number[], factItems?: Record<string, number[]>, extra: Partial<QuizQuestion> = {}): QuizQuestion =>
  ({ id, type: 'fill-blanks', question: `Question ${id} ___`, explanation: '', answer: id, acceptableAnswers: [id], factIds, ...(factItems ? { factItems } : {}), ...extra }) as QuizQuestion

test.describe('plan validation and sentence coverage', () => {
  test('parses a stored plan, dropping invalid and duplicate ids and one-item lists', () => {
    const parsed = parseCoverageFacts([
      { id: 1, label: 'A', statement: 'Fact A', span: 'x', importance: 'supporting', position: 0.2, items: ['only one'] },
      { id: 1, label: 'Again', statement: 'Duplicate id' },
      { id: 2, label: '', statement: 'No label' },
      { id: 3, label: 'C', statement: 'Fact C', items: ['a', 'b'], position: 7 },
      'junk',
    ])
    expect(parsed?.map((entry) => entry.id)).toEqual([1, 3])
    expect(parsed?.[0].items).toBeUndefined()
    expect(parsed?.[0].importance).toBe('supporting')
    expect(parsed?.[1]).toMatchObject({ items: ['a', 'b'], position: 0, importance: 'core' })
    expect(parseCoverageFacts([])).toBeNull()
  })

  test('every sentence is linked to a fact or marked as having no testable content', () => {
    const sentences = splitSourceSentences('Hello class. Plants make food. They need light.\nThat is all.')
    expect(sentences).toHaveLength(4)
    const check = sentenceCoverage(sentences, new Set([1]), new Set([0]))
    expect(check.gaps).toEqual([2, 3])
    expect(check.coveredWordShare).toBeCloseTo(3 / 11, 5)
    expect(sentenceCoverage(sentences, new Set([1, 2]), new Set([0, 3])).gaps).toEqual([])
  })

  test('facts asked by an earlier quiz are found deterministically (cached plans work with any avoid list)', () => {
    const facts: CoverageFact[] = [
      { ...fact(1), statement: 'Chlorophyll is the green pigment that absorbs light.' },
      { ...fact(2), statement: 'Glucose is stored as starch.' },
    ]
    const marked = markUsedBefore(facts, ['Which green pigment absorbs light in the leaf?'], 'en')
    expect(marked.map((entry) => entry.usedBefore)).toEqual([true, false])
  })
})

test.describe('slot assignment per type (Auto)', () => {
  test('single-fact types: one question per fact; a list is ONE question that needs all its items', () => {
    for (const type of ['mcq', 'true-false', 'fill-blanks'] as const) {
      const { slots, uncoveredFactIds } = planSlots(PLAN, type, 'auto')
      expect(slots).toHaveLength(6) // the plan's 6 facts, lists included (the old split asked 12)
      expect(uncoveredFactIds).toEqual([])
      expect(slots.find((slot) => slot.factIds[0] === 5)).toEqual({ type: 'short-answer', factIds: [5], items: { 5: [0, 1, 2, 3] } })
      expect(slots.filter((slot) => !slot.items).every((slot) => slot.type === type && slot.factIds.length === 1)).toBe(true)
    }
  })

  test('a fixed count may still spread a list over several questions when there is room', () => {
    const { slots } = planSlots(PLAN, 'mcq', 12)
    expect(slots).toHaveLength(12)
    expect(slots.filter((slot) => slot.factIds[0] === 5).map((slot) => slot.items?.[5])).toEqual([[0], [1], [2], [3]])
  })

  test('a fixed count spreads over different facts before a list fact takes several questions', () => {
    const facts = [fact(1, { items: ['a', 'b', 'c'] }), ...[2, 3, 4, 5, 6].map((id) => fact(id))]
    const { slots } = planSlots(facts, 'mcq', 5)
    expect(slots.map((slot) => slot.factIds[0])).toEqual([2, 3, 4, 5, 6])
  })

  test('a fixed count tests a list longer than MAX_LIST_ITEMS in part (shown as partly covered); Auto asks it all in a few questions', () => {
    const long = fact(1, { items: Array.from({ length: MAX_LIST_ITEMS + 2 }, (_, index) => `item ${index}`) })
    const slots = planSlots([long], 'mcq', 30 - 20).slots
    expect(slots).toHaveLength(MAX_LIST_ITEMS)
    const questions = slots.map((slot, index) => q(`q${index}`, slot.factIds, { 1: slot.items![1] }))
    expect(computeCoverage({ version: 1, facts: [long] }, questions).rows[0].status).toBe('partial')
    const auto = planSlots([long], 'mcq', 'auto').slots
    expect(auto).toHaveLength(2) // 8 items: two short answers of 4, every item asked
    expect(auto.flatMap((slot) => slot.items![1]).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  test('matching: one pair per fact or list item, 3-6 pairs per question', () => {
    const { slots } = planSlots(PLAN, 'matching', 'auto')
    const pairs = slots.map((slot) => slot.factIds.reduce((sum, id) => sum + (slot.items?.[id]?.length ?? 1), 0))
    expect(pairs.reduce((sum, count) => sum + count, 0)).toBe(12)
    expect(pairs.every((count) => count >= 3 && count <= 6)).toBe(true)
    expect(new Set(slots.flatMap((slot) => slot.factIds))).toEqual(new Set([1, 2, 3, 4, 5, 6]))
  })

  test('short answer: a list is one question with all its items; neighbours of one topic share one', () => {
    const { slots } = planSlots(PLAN, 'short-answer', 'auto')
    expect(slots.find((slot) => slot.factIds.includes(5))).toEqual({ type: 'short-answer', factIds: [5], items: { 5: [0, 1, 2, 3] } })
    const sameTopic = [fact(1, { label: 'Cells' }), fact(2, { label: 'Cells' }), fact(3, { label: 'Tissues' })]
    expect(planSlots(sameTopic, 'short-answer', 'auto').slots.map((slot) => slot.factIds)).toEqual([[1, 2], [3]])
  })

  test('open-ended: up to 3 facts and at most 5 key points per question', () => {
    const { slots } = planSlots(PLAN, 'open-ended', 'auto')
    for (const slot of slots) {
      expect(slot.factIds.length).toBeLessThanOrEqual(3)
      expect(slot.factIds.reduce((sum, id) => sum + (slot.items?.[id]?.length ?? 1), 0)).toBeLessThanOrEqual(5)
    }
    expect(new Set(slots.flatMap((slot) => slot.factIds)).size).toBe(6)
  })

  test('mixed: types spread over the facts, list facts only in types that test every item', () => {
    const { slots } = planSlots(PLAN, 'mixed', 'auto')
    expect(new Set(slots.map((slot) => slot.type)).size).toBeGreaterThanOrEqual(4)
    for (const slot of slots.filter((entry) => entry.factIds.some((id) => id === 3 || id === 5))) {
      expect(['short-answer', 'open-ended', 'matching']).toContain(slot.type)
    }
    expect(new Set(slots.flatMap((slot) => slot.factIds))).toEqual(new Set([1, 2, 3, 4, 5, 6]))
  })
})

test.describe('counts', () => {
  const many = (count: number) => Array.from({ length: count }, (_, index) => fact(index + 1, { importance: index % 2 === 0 ? 'core' : 'supporting', position: index / count }))

  test('Auto covers everything up to the maximum count, core facts first', () => {
    const plan = planSlots(many(40), 'mcq', 'auto')
    expect(plan.slots).toHaveLength(MAX_QUESTION_COUNT)
    expect(plan.uncoveredFactIds).toHaveLength(10)
    const core = new Set(many(40).filter((entry) => entry.importance === 'core').map((entry) => entry.id))
    expect([...core].every((id) => plan.coveredFactIds.includes(id))).toBe(true)
  })

  test('a manual count combines facts where the type allows and states what is left out', () => {
    const plan = planSlots(PLAN, 'matching', 1)
    expect(plan.slots).toHaveLength(1)
    expect(plan.uncoveredFactIds.length).toBeGreaterThan(0)
    expect(planSlots(PLAN, 'fill-blanks', 3).slots).toHaveLength(3)
  })

  test('the missing facts need this many questions (add-missing or a new quiz)', () => {
    const questions = [q('a', [1]), q('b', [3], { 3: [0] })]
    const missing = missingEntries(coverage, questions)
    expect(missing.map((entry) => [entry.fact.id, entry.items ?? null])).toEqual([
      [2, null],
      [3, [1, 2]],
      [4, null],
      [5, null],
      [6, null],
    ])
    expect(slotsNeededFor(missing, 'fill-blanks')).toBe(1 + 2 + 2 + 4 + 1)
    expect(packEntries(missing, 'short-answer').find((slot) => slot.factIds[0] === 3)?.items).toEqual({ 3: [1, 2] })
  })

  test('the words-per-fact heuristic estimates the Auto count before the plan exists', () => {
    expect(WORDS_PER_FACT).toBeGreaterThan(4)
    expect(estimateAutoQuestionCount(75, 'fill-blanks')).toBe(Math.round(75 / WORDS_PER_FACT))
    expect(estimateAutoQuestionCount(75, 'matching')).toBeLessThan(estimateAutoQuestionCount(75, 'mcq'))
    expect(estimateAutoQuestionCount(5000, 'mcq')).toBe(MAX_QUESTION_COUNT)
    expect(estimateAutoQuestionCount(10, 'mcq')).toBeGreaterThanOrEqual(1)
  })
})

test.describe('coverage state', () => {
  const full = [
    q('q1', [1]),
    q('q2', [2]),
    q('q3', [3], { 3: [0, 1, 2] }),
    q('q4', [4]),
    q('q5', [5], { 5: [0, 1] }),
    q('q6', [5], { 5: [2, 3] }),
    q('q7', [6]),
  ]

  test('covered, partly covered and missing', () => {
    const summary = computeCoverage(coverage, full)
    expect(summary).toMatchObject({ covered: 6, total: 6, complete: true })
    const partial = computeCoverage(coverage, full.filter((question) => question.id !== 'q6'))
    expect(partial.rows.find((row) => row.fact.id === 5)).toMatchObject({ status: 'partial', missingItems: [2, 3], questionNumbers: [5] })
    expect(partial.rows.find((row) => row.fact.id === 6)?.questionNumbers).toEqual([6])
    const missing = computeCoverage(coverage, full.filter((question) => question.id !== 'q1'))
    expect(missing.rows[0]).toMatchObject({ status: 'missing', questionNumbers: [] })
    expect(missing.covered).toBe(5)
  })

  test('delete makes a fact missing, undo restores it, regenerate keeps the factIds, edit counts as covered', () => {
    const deleted = full.filter((question) => question.id !== 'q2')
    expect(computeCoverage(coverage, deleted).rows[1].status).toBe('missing')
    const undone = [...deleted.slice(0, 1), full[1], ...deleted.slice(1)]
    expect(computeCoverage(coverage, undone).complete).toBe(true)
    const regenerated = full.map((question) => (question.id === 'q2' ? q('new', [2]) : question))
    expect(computeCoverage(coverage, regenerated).rows[1]).toMatchObject({ status: 'covered', questionNumbers: [2] })
    const edited = full.map((question) => (question.id === 'q4' ? { ...question, question: 'Changed ___', edited: true } : question))
    expect(computeCoverage(coverage, edited).rows[3]).toMatchObject({ status: 'covered', edited: true })
  })

  test('questions on different items of one list, or on different facts, are not duplicates', () => {
    const siblings = [
      q('a', [3], { 3: [0] }, { question: 'Green plants take this gas from the air: ___', answer: 'carbon dioxide', acceptableAnswers: ['carbon dioxide'] }),
      q('b', [3], { 3: [1] }, { question: 'Green plants take this liquid from the soil: ___', answer: 'water', acceptableAnswers: ['water'] }),
      q('c', [5], { 5: [3] }, { question: 'This moisture factor changes the rate: ___', answer: 'water amount', acceptableAnswers: ['water amount'] }),
    ]
    expect(findDuplicates(siblings, 'en')).toEqual([])
    const unplanned = siblings.map(({ factIds: _ids, factItems: _items, ...rest }) => rest as QuizQuestion)
    expect(findDuplicates(unplanned, 'en').map((issue) => issue.code)).toContain('duplicate_answer')
  })
})
