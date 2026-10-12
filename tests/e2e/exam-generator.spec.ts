import { expect, test } from '@playwright/test'

import { ExamApiError } from '../../src/api/exam'
import type { ExamFact, ExamSectionRequest, ExamVerifyRequest, ExamVerifyResult } from '../../src/api/exam'
import { ExamShortSourceError, MAX_REPAIR_ROUNDS, generateExamQuestions, reduceCounts } from '../../src/lib/exam/generate'
import { checkExamQuality } from '../../src/lib/exam/quality'
import { defaultExamSettings } from '../../src/lib/exam/types'
import type { ExamQuestion, ExamQuestionType } from '../../src/lib/exam/types'
import { fakeFacts } from './examHelpers'

// The generator with its three calls replaced by a fake server (no browser, no network): plan, one question per fact,
// whole-exam check, judge, targeted rewrites with unused facts.

const SOURCE = 'Kaynak metin. '.repeat(40)

interface Fake {
  sections: ExamSectionRequest[]
  verifies: ExamVerifyRequest[]
  plans: number
  callSection: (request: ExamSectionRequest) => Promise<ExamQuestion[]>
  callVerify: (request: ExamVerifyRequest) => Promise<ExamVerifyResult>
  callPlan: (request: { count: number }) => Promise<ExamFact[]>
}

let serial = 0

function question(type: ExamQuestionType, fact: ExamFact, extra: Partial<ExamQuestion> = {}): ExamQuestion {
  serial += 1
  const base: ExamQuestion = {
    id: `g${serial}`,
    type,
    stem: `${fact.fact} hakkında ${type} sorusu ${serial}?`,
    answer: `Cevap ${fact.fact}`,
    rubric: [{ text: 'Doğru cevap', points: 1 }],
    points: 0,
    topic: fact.topic,
    difficulty: 'medium',
    lines: 0,
    fact: fact.fact,
  }
  if (type === 'mcq') return { ...base, options: [`Doğru ${fact.fact}`, 'Yanlış bir', 'Yanlış iki', 'Yanlış üç'], answerIndex: 0, answer: `Doğru ${fact.fact}`, ...extra }
  if (type === 'true-false') return { ...base, answerBool: true, answer: 'true', ...extra }
  return { ...base, lines: 2, ...extra }
}

/** A fake server. `shape` can change the question a fact produces (to plant a defect). */
function fake(options: { facts?: ExamFact[]; shape?: (q: ExamQuestion, request: ExamSectionRequest, index: number) => ExamQuestion; verify?: (request: ExamVerifyRequest) => ExamVerifyResult } = {}): Fake {
  const state: Fake = {
    sections: [],
    verifies: [],
    plans: 0,
    callPlan: async ({ count }) => {
      state.plans += 1
      return options.facts ?? fakeFacts(count)
    },
    callSection: async (request) => {
      state.sections.push(request)
      return (request.facts ?? []).map((entry, index) => {
        const answerBool = request.trueFalseAnswers?.[index] ?? request.trueFalseAnswer ?? index % 2 === 0
        const made = question(request.type, entry, request.type === 'true-false' ? { answerBool, answer: String(answerBool) } : {})
        return options.shape ? options.shape(made, request, index) : made
      })
    },
    callVerify: async (request) => {
      state.verifies.push(request)
      return options.verify ? options.verify(request) : { wrong: [], fixes: [], same: [] }
    },
  }
  return state
}

const run = (server: Fake, overrides: Partial<Parameters<typeof generateExamQuestions>[0]> = {}) =>
  generateExamQuestions({ settings: defaultExamSettings(new Date('2026-10-10')), text: SOURCE, state: { done: new Map() }, callSection: server.callSection, callVerify: server.callVerify, callPlan: server.callPlan, ...overrides })

test.describe('plan and facts', () => {
  test('asks for 30 % more facts than questions and gives every question its own fact', async () => {
    const server = fake()
    const questions = await run(server)
    expect(server.plans).toBe(1)
    expect(questions).toHaveLength(20)
    const facts = questions.map((entry) => entry.fact)
    expect(new Set(facts).size).toBe(20)
    expect(questions.reduce((sum, entry) => sum + entry.points, 0)).toBe(100)
    // The sections were handed exactly their facts, in plan order.
    const handed = server.sections.flatMap((request) => request.facts ?? [])
    expect(handed.length).toBe(20)
    expect(new Set(handed.map((entry) => entry.fact)).size).toBe(20)
  })

  test('the plan is asked for once, even across a retry', async () => {
    const server = fake()
    const state = { done: new Map<string, ExamQuestion[]>() }
    await run(server, { state })
    await run(server, { state })
    expect(server.plans).toBe(1)
  })

  test('a source with fewer distinct facts than questions stops with the number it can carry', async () => {
    const server = fake({ facts: fakeFacts(12) })
    const state = { done: new Map<string, ExamQuestion[]>() }
    const error = await run(server, { state }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ExamShortSourceError)
    expect((error as ExamShortSourceError).max).toBe(12)
    expect(server.sections).toHaveLength(0)
  })

  test('accepting the smaller exam uses the same plan and writes exactly that many questions', async () => {
    const server = fake({ facts: fakeFacts(12) })
    const settings = defaultExamSettings(new Date('2026-10-10'))
    settings.counts = reduceCounts(settings.counts, 12)
    expect(Object.values(settings.counts).reduce((sum, value) => sum + value, 0)).toBe(12)
    const questions = await run(server, { settings, acceptFewer: true })
    expect(questions).toHaveLength(12)
  })

  test('reduceCounts takes from the largest type first and never goes below one question', () => {
    const counts = { ...defaultExamSettings().counts, 'open-ended': 8, 'short-answer': 2, mcq: 2, 'true-false': 2 }
    const reduced = reduceCounts(counts, 9)
    expect(reduced['open-ended']).toBe(3)
    expect(reduceCounts(counts, 0)['open-ended'] + reduceCounts(counts, 0)['short-answer'] + reduceCounts(counts, 0).mcq + reduceCounts(counts, 0)['true-false']).toBeGreaterThanOrEqual(1)
  })
})

test.describe('same fact asked three times', () => {
  const mete: ExamFact[] = [
    { fact: 'Mete Han orduyu onlu sisteme göre düzenledi', topic: 'Hunlar' },
    { fact: 'Hun ordusunda onlu sistem uygulandı Mete Han tarafından', topic: 'Hunlar' },
    { fact: "Mete Han'ın onlu sistemi askerî birlikleri yüzlük binlik birliklere ayırdı", topic: 'Hunlar' },
  ]

  test('the judge is asked about close pairs and the repeats are rewritten with unused facts', async () => {
    const facts = [...mete, ...fakeFacts(30).map((entry, index) => ({ fact: `${entry.fact} ${index}`, topic: entry.topic }))]
    const server = fake({
      facts,
      // The three Mete Han questions are worded alike; the judge says they are the same fact.
      shape: (made) => (made.fact?.includes('Mete Han') || made.fact?.includes('Hun ordusunda') ? { ...made, stem: 'Mete Han onlu sistem ordu birlik düzen nedir?', answer: `Onlu sistem ${made.id}` } : made),
      verify: (request) => ({ wrong: [], fixes: [], same: (request.pairs ?? []).map((pair) => pair.id) }),
    })
    const questions = await run(server)
    expect(server.verifies.some((request) => (request.pairs ?? []).length > 0)).toBe(true)
    // After the rewrites no two questions share a fact and the Mete Han fact appears at most once.
    const facts20 = questions.map((entry) => entry.fact)
    expect(new Set(facts20).size).toBe(20)
    expect(facts20.filter((fact) => fact?.includes('Mete Han') || fact?.includes('Hun ordusunda')).length).toBeLessThanOrEqual(1)
    // The rewritten questions were asked on facts nobody had used.
    const firstCall = server.sections.slice(0, 4).flatMap((request) => request.facts ?? []).map((entry) => entry.fact)
    const rewrites = server.sections.slice(4).flatMap((request) => request.facts ?? []).map((entry) => entry.fact)
    expect(rewrites.length).toBeGreaterThan(0)
    for (const fact of rewrites) expect(firstCall).not.toContain(fact)
  })
})

test.describe('answer keys', () => {
  test('a key the second reading contradicts is corrected from that reading', async () => {
    let flagged: string | null = null
    let corrected: boolean | null = null
    const server = fake({
      verify: (request) => {
        const target = request.questions.find((entry) => entry.type === 'true-false' && flagged === null)
        if (!target) return { wrong: [], fixes: [], same: [] }
        flagged = target.id
        corrected = !target.answerBool
        return { wrong: [target.id], fixes: [{ id: target.id, answerBool: !target.answerBool }], same: [] }
      },
    })
    const questions = await run(server)
    expect(flagged).not.toBeNull()
    const fixed = questions.find((entry) => entry.id === flagged)
    // The flipped statement may be rewritten again by the balance rule; if it stayed, its key is the corrected one.
    if (fixed) expect(fixed.answerBool).toBe(corrected)
    const trueFalse = questions.filter((entry) => entry.type === 'true-false')
    const trues = trueFalse.filter((entry) => entry.answerBool === true).length
    expect(trues).toBeGreaterThanOrEqual(2)
    expect(trues).toBeLessThanOrEqual(3)
  })

  test('a failed check does not stop the exam', async () => {
    const server = fake()
    server.callVerify = async () => {
      throw new ExamApiError('upstream')
    }
    expect(await run(server)).toHaveLength(20)
  })
})

test.describe('rewrite rounds', () => {
  test('a defect that keeps coming back stops the exam after the last round, with a quality error', async () => {
    // Every multiple-choice question reaches the reference rule: it never passes.
    const server = fake({ shape: (made) => (made.type === 'mcq' ? { ...made, stem: 'Bu modele göre hangi şık doğrudur?' } : made) })
    const error = await run(server).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ExamApiError)
    expect((error as ExamApiError).code).toBe('quality')
    // First pass: 4 sections; then at most MAX_REPAIR_ROUNDS rewrites of the 5 broken questions (one call each).
    expect(server.sections.length).toBeLessThanOrEqual(4 + MAX_REPAIR_ROUNDS * 2)
  })

  test('a question that breaks a rule once is replaced on another fact and the exam is saved', async () => {
    let broken = false
    const server = fake({
      shape: (made) => {
        if (made.type === 'mcq' && !broken) {
          broken = true
          return { ...made, stem: 'Bu modele göre hangi şık doğrudur?' }
        }
        return made
      },
    })
    const questions = await run(server)
    expect(questions).toHaveLength(20)
    expect(checkExamQuality(questions, defaultExamSettings().counts).filter((issue) => issue.rule !== 'term-repeat')).toEqual([])
    expect(new Set(questions.map((entry) => entry.fact)).size).toBe(20)
  })
})
