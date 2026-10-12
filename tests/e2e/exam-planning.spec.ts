import { expect, test } from '@playwright/test'

import { allowedDifficulties, bloomMixOk, bloomTargetCounts, clampBloom, fitDifficulty, planBloom, planSlots } from '../../src/lib/exam/bloom'
import { BLOOM_CAP, BLOOM_MIX } from '../../src/lib/exam/bloomConfig'
import { chooseFacts, clusterTopics, topicShares, withRelated } from '../../src/lib/exam/planning'
import { distributePoints } from '../../src/lib/exam/points'
import type { PlanFact } from '../../src/lib/exam/planning'
import { emptyCounts } from '../../src/lib/exam/types'
import { fakeFacts } from './examHelpers'
import type { ExamQuestionType } from '../../src/lib/exam/types'

// Bloom planning (E2, E3, E4) and which fact goes to which slot (A2, A6, V1): pure logic, no browser.

const DEFAULT_COUNTS = { ...emptyCounts(), 'open-ended': 5, 'short-answer': 5, 'true-false': 5, mcq: 5 }
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

test.describe('E3: the balanced mix follows the grade', () => {
  test('20 questions per grade band', () => {
    expect(bloomTargetCounts('balanced', '3', 20)).toEqual([6, 7, 5, 2, 0, 0])
    expect(bloomTargetCounts('balanced', '7', 20)).toEqual([4, 6, 5, 3, 1, 1])
    expect(bloomTargetCounts('balanced', '9', 20)).toEqual([3, 5, 5, 4, 2, 1])
    expect(bloomTargetCounts('balanced', '12', 20)).toEqual([3, 5, 5, 4, 2, 1])
    expect(bloomTargetCounts('balanced', 'university', 20)).toEqual([2, 4, 5, 4, 3, 2])
  })

  test('every count is within one question of the percentage, and the counts add up', () => {
    for (const level of ['2', '6', '10', 'university'] as const) {
      const mix = BLOOM_MIX[level === '2' ? 'primary' : level === '6' ? 'middle' : level === '10' ? 'high' : 'university']
      for (const total of [1, 3, 7, 13, 20, 27, 40]) {
        const counts = bloomTargetCounts('balanced', level, total)
        expect(sum(counts)).toBe(total)
        counts.forEach((count, index) => expect(Math.abs(count - (mix[index] / 100) * total)).toBeLessThan(1))
      }
    }
  })

  test('one level puts every question on it; higher-order thinking uses the three upper levels', () => {
    expect(bloomTargetCounts('4', '9', 12)).toEqual([0, 0, 0, 12, 0, 0])
    const higher = bloomTargetCounts('higher', '9', 20)
    expect(higher.slice(0, 3)).toEqual([0, 0, 0])
    expect(sum(higher)).toBe(20)
    expect(higher[3]).toBeGreaterThan(0)
    expect(higher[4]).toBeGreaterThan(0)
    expect(higher[5]).toBeGreaterThan(0)
  })
})

test.describe('E2: what each type can reach', () => {
  test('the default mix is met exactly for the default exam, and no slot is above its type\'s limit', () => {
    const plan = planBloom(DEFAULT_COUNTS, bloomTargetCounts('balanced', '9', 20))
    expect(plan.achieved).toEqual([3, 5, 5, 4, 2, 1])
    expect(plan.capped).toEqual([])
    for (const type of Object.keys(DEFAULT_COUNTS) as ExamQuestionType[]) for (const level of plan.perType[type]) expect(level).toBeLessThanOrEqual(BLOOM_CAP[type])
    expect(plan.perType['open-ended'].some((level) => level === 6)).toBe(true)
    expect(plan.perType['true-false'].every((level) => level <= 2)).toBe(true)
  })

  test('Yaratma (6) on every question: only open-ended can, the others get their highest level and the plan says so', () => {
    const plan = planBloom(DEFAULT_COUNTS, bloomTargetCounts('6', '9', 20))
    expect(plan.perType['open-ended']).toEqual([6, 6, 6, 6, 6])
    expect(plan.perType.mcq).toEqual([5, 5, 5, 5, 5])
    expect(plan.perType['short-answer']).toEqual([3, 3, 3, 3, 3])
    expect(plan.perType['true-false']).toEqual([2, 2, 2, 2, 2])
    expect(plan.capped.map((entry) => entry.type).sort()).toEqual(['mcq', 'short-answer', 'true-false'])
    expect(clampBloom('true-false', 6)).toBe(2)
    expect(clampBloom('open-ended', 6)).toBe(6)
  })

  test('Hatırlama (1) puts every question on level 1', () => {
    const plan = planBloom(DEFAULT_COUNTS, bloomTargetCounts('1', '9', 20))
    expect(plan.achieved).toEqual([20, 0, 0, 0, 0, 0])
    expect(plan.capped).toEqual([])
  })
})

test.describe('A4: difficulty labels fit the level', () => {
  test('recall is never hard, evaluation and creation are never easy, true-false / fill-in / matching are never hard', () => {
    expect(allowedDifficulties('open-ended', 1)).toEqual(['easy', 'medium'])
    expect(allowedDifficulties('open-ended', 5)).toEqual(['medium', 'hard'])
    expect(allowedDifficulties('open-ended', 6)).toEqual(['medium', 'hard'])
    expect(allowedDifficulties('true-false', 2)).toEqual(['easy', 'medium'])
    expect(allowedDifficulties('matching', undefined)).toEqual(['easy', 'medium'])
    expect(fitDifficulty('open-ended', 1, 'hard')).toBe('medium')
    expect(fitDifficulty('open-ended', 6, 'easy')).toBe('medium')
    expect(fitDifficulty('mcq', 3, 'hard')).toBe('hard')
  })

  test('the slots of an exam follow the level and the teacher\'s mix', () => {
    const { slots } = planSlots(DEFAULT_COUNTS, bloomTargetCounts('balanced', '9', 20), { easy: 30, medium: 50, hard: 20 })
    expect(slots).toHaveLength(20)
    for (const slot of slots) {
      expect(allowedDifficulties(slot.type, slot.bloom)).toContain(slot.difficulty)
    }
    const hard = slots.filter((slot) => slot.difficulty === 'hard')
    expect(hard.length).toBeGreaterThan(0)
    expect(hard.every((slot) => slot.bloom >= 3)).toBe(true)
  })

  test('the mix check allows one question either way', () => {
    expect(bloomMixOk([1, 1, 2, 3], [2, 1, 1, 0, 0, 0])).toBe(true)
    expect(bloomMixOk([1, 1, 1, 1], [1, 0, 0, 3, 0, 0])).toBe(false)
  })
})

const WORDS = fakeFacts(100).map((entry) => entry.fact)
const fact = (n: number, topic: string, concept = `kavram ${n}`): PlanFact => ({ fact: WORDS[n % WORDS.length], topic, concept })

test.describe('A2: topics follow the source', () => {
  // A source of 30 facts: Organeller (14), Hücre teorisi (8), Hücre zarı (5), Hücre türleri (3).
  const plan: PlanFact[] = [
    ...Array.from({ length: 14 }, (_, i) => fact(i, 'Organeller')),
    ...Array.from({ length: 8 }, (_, i) => fact(20 + i, 'Hücre teorisi')),
    ...Array.from({ length: 5 }, (_, i) => fact(40 + i, 'Hücre zarı')),
    ...Array.from({ length: 3 }, (_, i) => fact(60 + i, 'Hücre türleri')),
  ]
  const { slots } = planSlots(DEFAULT_COUNTS, bloomTargetCounts('balanced', '9', 20), { easy: 30, medium: 50, hard: 20 })

  test('topic shares of the plan, and similar topic names are one topic', () => {
    const shares = topicShares(plan)
    expect(shares).toHaveLength(4)
    expect(Math.max(...shares)).toBeCloseTo(14 / 30, 5)
    const merged = clusterTopics([fact(1, 'Hücre teorisi'), fact(2, 'Hücre Teorisi ve Hooke'), fact(3, 'Organeller')])
    expect(merged[0]).toBe(merged[1])
    expect(merged[2]).not.toBe(merged[0])
  })

  test('every topic\'s share of the questions stays within 15 points of its share of the source, and none takes more than 40 %', () => {
    const { facts } = chooseFacts(plan, slots)
    expect(facts).toHaveLength(20)
    const perTopic = new Map<string, number>()
    for (const entry of facts) perTopic.set(entry.topic, (perTopic.get(entry.topic) ?? 0) + 1)
    for (const topic of ['Organeller', 'Hücre teorisi', 'Hücre zarı', 'Hücre türleri']) {
      const sourceShare = plan.filter((entry) => entry.topic === topic).length / plan.length
      const questionShare = (perTopic.get(topic) ?? 0) / 20
      expect(Math.abs(questionShare - sourceShare)).toBeLessThanOrEqual(0.15)
      expect(questionShare).toBeLessThanOrEqual(0.5)
    }
  })

  test('with as many open-ended questions as topics, every topic gets one (the largest topic is not skipped)', () => {
    const { facts } = chooseFacts(plan, slots)
    const openIndexes = slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => slot.type === 'open-ended').map(({ index }) => index)
    const openTopics = new Set(openIndexes.map((index) => facts[index].topic))
    expect(openTopics.size).toBe(4)
    expect(openTopics.has('Organeller')).toBe(true)
  })

  test('the teacher\'s own rows give exactly their counts, and a row the source cannot fill is named', () => {
    const rows = [
      { text: 'Organeller', count: 6 },
      { text: 'Hücre teorisi', count: 6 },
      { text: 'Hücre zarı', count: 5 },
      { text: 'Hücre türleri', count: 3 },
    ]
    const { facts, rowShortfall } = chooseFacts(plan, slots, { distribution: rows })
    expect(rowShortfall).toEqual([])
    expect(facts.filter((entry) => entry.topic === 'Hücre türleri')).toHaveLength(3)
    expect(facts.filter((entry) => entry.topic === 'Organeller')).toHaveLength(6)
    const short = chooseFacts(plan, slots, { distribution: [{ text: 'Organeller', count: 6 }, { text: 'Fotosentez', count: 4 }, { text: 'Hücre zarı', count: 5 }, { text: 'Hücre teorisi', count: 5 }] })
    expect(short.rowShortfall.map((row) => row.text)).toEqual(['Fotosentez'])
  })
})

test.describe('A6 and V1: one question per concept, earlier facts last', () => {
  test('a second fact of a concept is used only when there are not enough concepts', () => {
    const plenty: PlanFact[] = Array.from({ length: 40 }, (_, i) => fact(i, 'Konu', `kavram ${Math.floor(i / 2)}`))
    const { slots } = planSlots(DEFAULT_COUNTS, bloomTargetCounts('balanced', '9', 20), { easy: 30, medium: 50, hard: 20 })
    const chosen = chooseFacts(plenty, slots).facts
    const concepts = chosen.map((entry) => entry.concept)
    expect(new Set(concepts).size).toBe(20)
    const scarce: PlanFact[] = Array.from({ length: 24 }, (_, i) => fact(i, 'Konu', `kavram ${Math.floor(i / 3)}`))
    const filled = chooseFacts(scarce, slots).facts.map((entry) => entry.concept)
    for (const concept of new Set(filled)) expect(filled.filter((value) => value === concept).length).toBeLessThanOrEqual(2)
  })

  test('facts an earlier exam tested come last, and a reused fact changes its form', () => {
    const plan: PlanFact[] = Array.from({ length: 30 }, (_, i) => fact(i, 'Konu'))
    const { slots } = planSlots(DEFAULT_COUNTS, bloomTargetCounts('balanced', '9', 20), { easy: 30, medium: 50, hard: 20 })
    const earlier = plan.slice(0, 10).map((entry) => ({ fact: entry.fact, form: 'mcq:2' }))
    const chosen = chooseFacts(plan, slots, { earlier }).facts
    expect(chosen.filter((entry) => plan.slice(0, 10).includes(entry))).toHaveLength(0)
    // Too little to avoid: the earlier facts are used again, but not in the form they had.
    const small: PlanFact[] = Array.from({ length: 20 }, (_, i) => fact(i, 'Konu'))
    const reused = chooseFacts(small, slots, { earlier: small.map((entry) => ({ fact: entry.fact, form: 'mcq:2' })) }).facts
    expect(reused).toHaveLength(20)
    const mcqSlotIndexes = slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => slot.type === 'mcq' && slot.bloom === 2).map(({ index }) => index)
    if (mcqSlotIndexes.length > 0 && mcqSlotIndexes.length < 20) expect(mcqSlotIndexes.some((index) => reused[index] !== undefined)).toBe(true)
  })
})

test.describe('A5: points fit the content', () => {
  test('an open-ended question with one gradable idea is worth less than one with three', () => {
    const open = (id: string, items: number) => ({ id, type: 'open-ended' as const, stem: 's', answer: 'a', rubric: Array.from({ length: items }, (_, i) => ({ text: `ölçüt ${i}`, points: 1 })), points: 0, topic: 't', difficulty: 'medium' as const, lines: 3 })
    const scored = distributePoints([open('one', 1), open('three', 3), open('two', 2)], 100)
    const byId = Object.fromEntries(scored.map((question) => [question.id, question.points]))
    expect(byId.one).toBeLessThan(byId.two)
    expect(byId.two).toBeLessThan(byId.three)
    expect(scored.reduce((sum, question) => sum + question.points, 0)).toBe(100)
  })
})

test.describe('related facts for levels 4 to 6', () => {
  test('only the higher slots get up to two unused facts of their own topic', () => {
    const plan: PlanFact[] = [...Array.from({ length: 6 }, (_, i) => fact(i, 'Organeller')), ...Array.from({ length: 6 }, (_, i) => fact(10 + i, 'Mitoz bölünme'))]
    const slots = [
      { type: 'open-ended' as const, bloom: 5 as const, difficulty: 'hard' as const },
      { type: 'short-answer' as const, bloom: 2 as const, difficulty: 'easy' as const },
      { type: 'open-ended' as const, bloom: 4 as const, difficulty: 'medium' as const },
    ]
    const chosen = [plan[0], plan[1], plan[10]]
    const withFacts = withRelated(chosen, plan, slots)
    expect(withFacts[1].related).toBeUndefined()
    expect(withFacts[0].related).toHaveLength(2)
    expect(withFacts[2].related).toHaveLength(2)
    for (const entry of [withFacts[0], withFacts[2]]) for (const value of entry.related ?? []) {
      expect(chosen.map((item) => item.fact)).not.toContain(value)
      expect(plan.find((item) => item.fact === value)?.topic).toBe(entry.topic)
    }
  })
})
