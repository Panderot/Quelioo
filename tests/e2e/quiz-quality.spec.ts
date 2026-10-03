import { expect, test } from '@playwright/test'

import { isFillBlankMatch, normalizeAnswer, turkishBaseForms, usesTurkishRules } from '../../src/lib/answerCheck'
import { previousStemsForSource, sourceTextHash } from '../../src/lib/archive'
import type { ArchiveEntry } from '../../src/lib/archive'
import type { QuizQuestion } from '../../src/lib/quiz'
import {
  batchSlots,
  checkAgainstOthers,
  checkQuizQuality,
  findDuplicates,
  findLeaks,
  findTrueFalseImbalance,
  planBatches,
} from '../../src/lib/quizQuality'
import { planSlots } from '../../src/lib/factCoverage'
import type { PlannedFact, QualityCheckOptions } from '../../src/lib/quizQuality'

// Pure unit tests (no browser): fill-in checking, deterministic quiz checks, facts plan, batching
// and the source-hash avoid list.

const fill = (id: string, question: string, answer: string, acceptableAnswers: string[] = [answer]): QuizQuestion => ({
  id,
  type: 'fill-blanks',
  question,
  explanation: '',
  answer,
  acceptableAnswers,
})
const mcq = (id: string, question: string, options: string[], answerIndex = 0): QuizQuestion => ({ id, type: 'mcq', question, explanation: '', options, answerIndex })
const tf = (id: string, question: string, answerBool: boolean): QuizQuestion => ({ id, type: 'true-false', question, explanation: '', answerBool })
const TR: QualityCheckOptions = { language: 'tr', difficulty: 'easy' }
const EN: QualityCheckOptions = { language: 'en', difficulty: 'medium', optionsCount: '4' }

test.describe('fill-in answer checking (Turkish fairness)', () => {
  const tr = { turkish: true }

  test('accepts the base form of an inflected expected answer', () => {
    expect(isFillBlankMatch('organel', ['organellerde'], tr)).toBe(true)
    expect(isFillBlankMatch('organeller', ['organellerde'], tr)).toBe(true)
    expect(isFillBlankMatch('kök', ['kökleriyle'], tr)).toBe(true)
    expect(isFillBlankMatch('glikoz', ['glikoza'], tr)).toBe(true)
    expect(isFillBlankMatch('ışık', ['ışığı'], tr)).toBe(true)
  })

  test('a different case form is accepted only when listed', () => {
    expect(isFillBlankMatch('kökle', ['kökleriyle'], tr)).toBe(false)
    expect(isFillBlankMatch('kökle', ['kökleriyle', 'kökle'], tr)).toBe(true)
  })

  test('synonyms come from acceptedAnswers, diacritics and casing are normalized', () => {
    expect(isFillBlankMatch('yavaşlıyor', ['yavaşlar', 'yavaşlıyor'], tr)).toBe(true)
    expect(isFillBlankMatch('yavaşlıyor', ['yavaşlar'], tr)).toBe(false)
    expect(isFillBlankMatch('isik', ['Işık'], tr)).toBe(true)
    expect(isFillBlankMatch('IŞIK', ['ışık'], tr)).toBe(true)
    expect(isFillBlankMatch('  ışık   .', ['ışık'], tr)).toBe(true)
    expect(normalizeAnswer('  Kloroplast  dır . ')).toBe('kloroplast dir')
  })

  test('wrong answers stay wrong', () => {
    expect(isFillBlankMatch('kalem', ['ışık'], tr)).toBe(false)
    expect(isFillBlankMatch('kalem', ['kalemlik'], tr)).toBe(false)
    expect(isFillBlankMatch('klorofil', ['kloroplast'], tr)).toBe(false)
    // The answer of another question is never accepted, not even as a one-letter typo.
    expect(isFillBlankMatch('glikoz', ['glikozu'], { turkish: false, otherAnswers: ['glikoz'] })).toBe(false)
  })

  test('stem rule limits: never below 3 letters, no single-vowel strip below 4, no ambiguous endings', () => {
    expect(turkishBaseForms('organellerde')).toEqual(expect.arrayContaining(['organeller', 'organel']))
    expect(turkishBaseForms('kara')).toEqual([])
    expect(turkishBaseForms('masa')).toEqual([])
    expect(turkishBaseForms('yakin')).toEqual([])
    expect(turkishBaseForms('suda')).toEqual([])
    expect(turkishBaseForms('enzimler')).toEqual(['enzim'])
    expect(isFillBlankMatch('kar', ['kara'], tr)).toBe(false)
    // Only the expected answer is stripped, never the student's input.
    expect(isFillBlankMatch('organellerde', ['organel'], tr)).toBe(false)
  })

  test('one typo for 6+ letters only', () => {
    expect(isFillBlankMatch('kloroplas', ['kloroplast'], tr)).toBe(true)
    expect(isFillBlankMatch('klorplas', ['kloroplast'], tr)).toBe(false)
    expect(isFillBlankMatch('ısık', ['ışığa'], { turkish: false })).toBe(false)
    expect(isFillBlankMatch('kok', ['kök'], { turkish: false })).toBe(true) // diacritics, not a typo
    expect(isFillBlankMatch('kak', ['kök'], { turkish: false })).toBe(false)
  })

  test('Turkish rules apply for tr or auto-detected Turkish only', () => {
    expect(usesTurkishRules('tr', 'anything')).toBe(true)
    expect(usesTurkishRules('en', 'ışık')).toBe(false)
    expect(usesTurkishRules('auto', 'Bitki suyu ___ ile emer')).toBe(true)
    expect(usesTurkishRules('auto', 'Plants absorb water with ___')).toBe(false)
  })
})

test.describe('deterministic quiz checks', () => {
  test('leakage: an answer (any inflected form) inside another question is flagged on its owner', () => {
    const questions = [
      fill('q1', 'Bitkilerin ışık enerjisiyle besin üretmesine ___ denir.', 'fotosentez'),
      fill('q2', 'Fotosentezde kullanılan gaz ___ olarak adlandırılır.', 'karbondioksit'),
      fill('q3', 'Klorofil en çok ___ soğurur.', 'ışık'),
      mcq('q4', 'Işığın enerjisini depolayan molekül hangisidir?', ['glikoz', 'su', 'oksijen', 'azot']),
    ]
    const ids = findLeaks(questions, 'tr').map((issue) => issue.questionId)
    expect(ids).toContain('q1') // "fotosentez" appears in q2 ("Fotosentezde")
    expect(ids).toContain('q3') // "ışık" appears in q1 and q4 ("ışık", "Işığın")
    expect(ids).not.toContain('q2')
  })

  test('duplicates: same answer and near-duplicate stems flag the later question', () => {
    const questions = [
      fill('q1', 'Fotosentez için gereken enerji kaynağı ___ olarak bilinir.', 'ışık'),
      fill('q2', 'Klorofil en çok ___ soğurur.', 'ışığı'),
      tf('q3', 'Bitkiler geceleri fotosentez yapar.', false),
      tf('q4', 'Bitkiler geceleri de fotosentez yapar.', false),
    ]
    const issues = findDuplicates(questions, 'tr')
    expect(issues.find((issue) => issue.questionId === 'q2')?.code).toBe('duplicate_answer')
    expect(issues.find((issue) => issue.questionId === 'q4')?.code).toBe('duplicate_stem')
    expect(issues.some((issue) => issue.questionId === 'q1' || issue.questionId === 'q3')).toBe(false)
  })

  test('same fact in two wordings with sentence answers is a duplicate', () => {
    const questions = [
      mcq('q1', 'Kas hücrelerinde mitokondri sayısının diğer birçok hücreye göre fazla olmasının temel nedeni nedir?', ['Enerji ihtiyaçlarının yüksek olması', 'Protein üretmeleri', 'Bölünmemeleri', 'Su depolamaları']),
      mcq('q2', 'Kas hücrelerinde enerji dönüşümünden sorumlu organellerin sayısının fazla olmasının temel nedeni nedir?', ['Enerji ihtiyaçlarının çok yüksek olması', 'Salgı yapmaları', 'Çekirdeksiz olmaları', 'Işık soğurmaları']),
      mcq('q3', 'Bitki hücresinde su depolayan büyük yapı hangisidir?', ['Merkezi koful', 'Lizozom', 'Ribozom', 'Golgi cisimciği']),
    ]
    const issues = findDuplicates(questions, 'tr')
    expect(issues.map((issue) => issue.questionId)).toEqual(['q2'])
  })

  test('one fact once across types (mixed): an mcq answer repeated as a blank is a duplicate', () => {
    const questions = [
      mcq('q1', 'Fotosentezin gerçekleştiği organel hangisidir?', ['Kloroplast', 'Mitokondri', 'Ribozom', 'Çekirdek']),
      fill('q2', 'Yeşil pigment taşıyan yapı ___ olarak adlandırılır.', 'kloroplast'),
    ]
    expect(checkQuizQuality(questions, { ...TR, optionsCount: '4' }).some((issue) => issue.questionId === 'q2' && issue.code === 'duplicate_answer')).toBe(true)
  })

  test('fill-in rules: missing acceptedAnswers, stop-word blank, answer in its own sentence, blank count', () => {
    const issues = checkQuizQuality(
      [
        fill('q1', 'Klorofil bir ___ pigmentidir.', 'klorofil', []),
        fill('q2', 'Su ___ topraktan emilir.', 've'),
        fill('q3', 'Bitkiler ___ ve ___ kullanır.', 'su'),
        fill('q4', 'Sadece bir cümle.', 'oksijen'),
      ],
      TR,
    )
    const codes = (id: string) => issues.filter((issue) => issue.questionId === id).map((issue) => issue.code)
    expect(codes('q1')).toEqual(expect.arrayContaining(['blank_no_accepted', 'answer_in_stem']))
    expect(codes('q2')).toContain('blank_stop_word')
    expect(codes('q3')).toContain('blank_count')
    expect(codes('q4')).toContain('blank_missing')
  })

  for (const count of [2, 3, 4, 5]) {
    test(`mcq with ${count} options: count, duplicates, containment, long correct, all-of-above`, () => {
      const good = Array.from({ length: count }, (_, index) => `Option ${'abcde'[index]} text`)
      const options: QualityCheckOptions = { language: 'en', difficulty: 'medium', optionsCount: String(count) }
      expect(checkQuizQuality([mcq('q1', 'Which organelle captures light energy?', good)], options)).toEqual([])
      const codes = (question: QuizQuestion) => checkQuizQuality([question], options).map((issue) => issue.code)
      expect(codes(mcq('q1', 'Which organelle captures light?', good.slice(0, count - 1).concat('x', 'y').slice(0, count + 1)))).toContain('mcq_option_count')
      expect(codes(mcq('q1', 'Which organelle captures light?', [...good.slice(0, count - 1), good[0]]))).toContain('mcq_duplicate_option')
      expect(codes(mcq('q1', 'Which organelle captures light?', [...good.slice(0, count - 1), `${good[0]} and more`], count - 1))).toContain('mcq_option_contains')
      expect(codes(mcq('q1', 'Which organelle captures light?', ['A very long and detailed correct option text here', ...good.slice(1)]))).toContain('mcq_long_correct')
      expect(codes(mcq('q1', 'Which organelle captures light?', [...good.slice(0, count - 1), 'All of the above']))).toContain('mcq_all_of_above')
    })
  }

  test('negative stems are flagged on easy only', () => {
    const question = mcq('q1', 'Which of these is NOT a pigment?', ['Glucose', 'Chlorophyll', 'Carotene', 'Xanthophyll'])
    expect(checkQuizQuality([question], { ...EN, difficulty: 'easy' }).map((issue) => issue.code)).toContain('negative_stem_easy')
    expect(checkQuizQuality([question], { ...EN, difficulty: 'hard' }).map((issue) => issue.code)).not.toContain('negative_stem_easy')
  })

  test('true/false balance: 40-60 % for 4+, both values for 2-3, giveaways and plain negation', () => {
    const allTrue = Array.from({ length: 6 }, (_, index) => tf(`q${index}`, `Statement number ${index} about leaves.`, true))
    const flagged = findTrueFalseImbalance(allTrue)
    expect(flagged).toHaveLength(3)
    expect(flagged.every((issue) => issue.wantBool === false)).toBe(true)
    expect(findTrueFalseImbalance([tf('a', 'One fact.', true), tf('b', 'Two fact.', false), tf('c', 'Three.', true), tf('d', 'Four.', false)])).toEqual([])
    expect(findTrueFalseImbalance([tf('a', 'One.', false), tf('b', 'Two.', false)])).toHaveLength(1)
    const codes = checkQuizQuality([tf('a', 'Plants always need sunlight to grow roots.', false), tf('b', 'Roots do not absorb water.', false)], EN)
    expect(codes.find((issue) => issue.questionId === 'a')?.code).toBe('tf_giveaway')
    expect(codes.find((issue) => issue.questionId === 'b')?.code).toBe('tf_plain_negation')
  })

  test('matching: one-to-one items and no shared giveaway word', () => {
    const matching = (pairs: [string, string][]): QuizQuestion => ({
      id: 'm1',
      type: 'matching',
      question: 'Match each structure with its role.',
      explanation: '',
      pairs: pairs.map(([left, right]) => ({ left, right })),
    })
    expect(checkQuizQuality([matching([['Stoma', 'Gas exchange'], ['Root', 'Water uptake'], ['Xylem', 'Water transport'], ['Phloem', 'Sugar transport']])], EN)).toEqual([])
    const dup = checkQuizQuality([matching([['Stoma', 'Gas exchange'], ['Root', 'Gas exchange'], ['Xylem', 'Transport'], ['Leaf', 'Light']])], EN)
    expect(dup.map((issue) => issue.code)).toContain('matching_duplicate')
    const giveaway = checkQuizQuality([matching([['Chlorophyll', 'Chlorophyll pigment role'], ['Root', 'Uptake'], ['Xylem', 'Transport'], ['Leaf', 'Light']])], EN)
    expect(giveaway.map((issue) => issue.code)).toContain('matching_giveaway')
  })

  test('matching: a pair repeated in another matching question, and a left item inside another right item', () => {
    const matching = (id: string, pairs: [string, string][]): QuizQuestion => ({ id, type: 'matching', question: 'Eşleştirin.', explanation: '', pairs: pairs.map(([left, right]) => ({ left, right })) })
    const first = matching('m1', [['Klorofil', 'Işığı soğuran pigment'], ['Stoma', 'Gaz alışverişi'], ['Kök', 'Su alımı'], ['Nişasta', 'Depo besin']])
    const second = matching('m2', [['Nişasta', 'Fazla glikozun depolanma biçimi'], ['Oksijen', 'Açığa çıkan gaz'], ['Enzim', 'Isıyla bozulan yapı'], ['Glikoz', 'Üretilen şeker']])
    expect(findDuplicates([first, second], 'tr').map((issue) => issue.questionId)).toEqual(['m2'])
    const cross = matching('m3', [['Kimyasal enerji', 'Fotosentezde oluşan enerji biçimi'], ['Işık enerjisi', 'Kimyasal enerjiye dönüşür'], ['Oksijen', 'Açığa çıkan gaz'], ['Su', 'Kökten alınır']])
    expect(checkQuizQuality([cross], TR).map((issue) => issue.code)).toContain('matching_giveaway')
  })

  test('checkAgainstOthers flags a regenerated question that leaks either way', () => {
    const others = [fill('o1', 'Yaprakta gaz alışverişini ___ sağlar.', 'stoma')]
    const leaksOut = fill('n1', 'Bitkinin ışığı soğuran pigmenti ___ olarak adlandırılır.', 'klorofil')
    expect(checkAgainstOthers(leaksOut, others, TR)).toEqual([])
    const leaksIn = fill('n2', 'Stomalardan giren gaz ___ olarak adlandırılır.', 'karbondioksit')
    expect(checkAgainstOthers(leaksIn, others, TR).map((issue) => issue.code)).toContain('leak')
  })
})

test.describe('facts plan and batching', () => {
  const facts = (count: number, focusEvery = 0): PlannedFact[] =>
    Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      label: `Topic ${index + 1}`,
      statement: `Fact ${index + 1}`,
      span: '',
      position: count > 1 ? index / (count - 1) : 0,
      importance: index % 3 === 0 ? ('core' as const) : ('supporting' as const),
      focus: focusEvery > 0 && index % focusEvery === 0,
      usedBefore: false,
    }))

  test('a manual count picks distinct facts spread over the whole source', () => {
    const plan = planSlots(facts(40), 'mcq', 10)
    const ids = plan.slots.flatMap((slot) => slot.factIds)
    expect(new Set(ids).size).toBe(10)
    const positions = ids.map((id) => (id - 1) / 39)
    expect(Math.min(...positions)).toBeLessThan(0.1)
    expect(Math.max(...positions)).toBeGreaterThan(0.9)
    expect(plan.uncoveredFactIds).toHaveLength(30)
  })

  test('fewer facts than questions: fewer slots, never padded', () => {
    expect(planSlots(facts(6), 'fill-blanks', 10).slots).toHaveLength(6)
    const matching = planSlots(facts(9), 'matching', 5)
    expect(matching.slots).toHaveLength(2)
    expect(new Set(matching.slots.flatMap((slot) => slot.factIds)).size).toBe(9)
  })

  test('about 70 % of the facts come from focus parts when focus exists', () => {
    const pool = facts(40, 3)
    const plan = planSlots(pool, 'mcq', 10)
    const focusCount = plan.slots.filter((slot) => pool[slot.factIds[0] - 1].focus).length
    expect(focusCount).toBe(7)
  })

  test('facts used by earlier quizzes come last', () => {
    const pool = facts(12).map((fact) => ({ ...fact, usedBefore: fact.id <= 6 }))
    const ids = planSlots(pool, 'mcq', 6).slots.flatMap((slot) => slot.factIds)
    expect(ids.every((id) => id > 6)).toBe(true)
  })

  test('mixed: balanced types, one distinct fact set per question across types', () => {
    const plan = planSlots(facts(30), 'mixed', 8)
    expect(plan.slots.slice(0, 6).map((slot) => slot.type).sort()).toEqual(['fill-blanks', 'matching', 'mcq', 'open-ended', 'short-answer', 'true-false'])
    const ids = plan.slots.flatMap((slot) => slot.factIds)
    expect(new Set(ids).size).toBe(ids.length)
    expect(plan.slots.find((slot) => slot.type === 'matching')?.factIds).toHaveLength(4)
  })

  test('large counts are split into batches of at most 10', () => {
    expect(planBatches(5)).toEqual([5])
    expect(planBatches(10)).toEqual([10])
    expect(planBatches(15)).toEqual([8, 7])
    expect(planBatches(20)).toEqual([10, 10])
    expect(planBatches(30)).toEqual([10, 10, 10])
    expect(batchSlots(Array.from({ length: 20 }, (_, index) => index)).map((batch) => batch.length)).toEqual([10, 10])
  })
})

test.describe('cross-quiz memory', () => {
  const entry = (id: string, createdAt: string, sourceText: string, stems: string[], withHash = true): ArchiveEntry => ({
    id,
    title: id,
    createdAt,
    source: 'text',
    questionType: 'mcq',
    difficulty: 'easy',
    questionCount: String(stems.length),
    optionsCount: '4',
    sourceText,
    ...(withHash ? { sourceHash: sourceTextHash(sourceText) } : {}),
    quiz: { title: id, questions: stems.map((stem, index) => tf(`${id}_${index}`, stem, true)) },
  })

  test('same normalized source → earlier stems, newest first, older entries without a hash included, capped', () => {
    const text = 'Fotosentez  bitkilerde\n olur.'
    const hash = sourceTextHash('fotosentez bitkilerde olur.')
    expect(sourceTextHash(text)).toBe(hash)
    const entries = [
      entry('old', '2026-01-01T00:00:00Z', text, ['A1', 'A2'], false),
      entry('new', '2026-02-01T00:00:00Z', text, ['B1', 'A1']),
      entry('other', '2026-03-01T00:00:00Z', 'Başka bir metin.', ['C1']),
    ]
    expect(previousStemsForSource(entries, hash)).toEqual(['B1', 'A1', 'A2'])
    const many = [entry('big', '2026-01-01T00:00:00Z', text, Array.from({ length: 60 }, (_, index) => `S${index}`))]
    expect(previousStemsForSource(many, hash)).toHaveLength(40)
  })
})
