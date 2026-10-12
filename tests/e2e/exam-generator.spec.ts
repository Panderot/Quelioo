import { expect, test } from '@playwright/test'

import { ExamApiError } from '../../src/api/exam'
import type { ExamFact, ExamSectionRequest, ExamVerifyRequest, ExamVerifyResult } from '../../src/api/exam'
import { ExamShortSourceError, MAX_FILL_ROUNDS, MAX_REPAIR_ROUNDS, generateExamQuestions, reduceCounts } from '../../src/lib/exam/generate'
import type { ExamGenerationState } from '../../src/lib/exam/generate'
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
  /** Extra plan calls for more facts (they carry `existing`). */
  extensions: { existing: string[]; focusTopics: string[] }[]
  callSection: (request: ExamSectionRequest) => Promise<ExamQuestion[]>
  callVerify: (request: ExamVerifyRequest) => Promise<ExamVerifyResult>
  callPlan: (request: { count: number; existing?: string[]; focusTopics?: string[] }) => Promise<ExamFact[]>
}

let serial = 0

function question(type: ExamQuestionType, fact: ExamFact, extra: Partial<ExamQuestion> = {}): ExamQuestion {
  serial += 1
  const base: ExamQuestion = {
    id: `g${serial}`,
    type,
    stem: `${fact.fact} hakkında ${type} sorusu ${serial}?`,
    answer: type === 'short-answer' ? `terim${serial}` : `Cevap ${fact.fact}`,
    rubric: type === 'open-ended' ? [{ text: 'Birinci ölçüt açıkça yazılır', points: 1 }, { text: 'İkinci bağımsız ölçüt belirtilir', points: 1 }] : [{ text: 'Doğru cevap', points: 1 }],
    points: 0,
    topic: fact.topic,
    difficulty: 'medium',
    lines: 0,
    fact: fact.fact,
    ...(fact.id ? { factId: fact.id } : {}),
  }
  if (type === 'mcq') {
    // The correct option is not the longest and sits in a different place from question to question.
    const answerIndex = serial % 4
    const options = [`Yanlış ${fact.fact}`, `Eksik ${fact.fact}`, `Başka ${fact.fact}`, `Hatalı ${fact.fact}`]
    options[answerIndex] = `Doğru ${fact.fact}`
    return { ...base, options, answerIndex, answer: options[answerIndex], ...extra }
  }
  if (type === 'true-false') return { ...base, answerBool: true, answer: 'true', ...extra }
  return { ...base, lines: 2, ...extra }
}

/** A fake server. `shape` can change the question a fact produces (to plant a defect). */
function fake(options: { facts?: ExamFact[]; noMoreFacts?: boolean; shape?: (q: ExamQuestion, request: ExamSectionRequest, index: number) => ExamQuestion; verify?: (request: ExamVerifyRequest) => ExamVerifyResult } = {}): Fake {
  const state: Fake = {
    sections: [],
    verifies: [],
    plans: 0,
    extensions: [],
    callPlan: async ({ count, existing, focusTopics }) => {
      if (existing && existing.length > 0) {
        state.extensions.push({ existing, focusTopics: focusTopics ?? [] })
        if (options.noMoreFacts) throw new ExamApiError('parse')
        return fakeFacts(existing.length + count).slice(existing.length)
      }
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
      return options.verify ? options.verify(request) : { wrong: [], fixes: [], same: [], reviews: [] }
    },
  }
  return state
}

const runResult = (server: Fake, overrides: Partial<Parameters<typeof generateExamQuestions>[0]> = {}) =>
  generateExamQuestions({ settings: defaultExamSettings(new Date('2026-10-10')), text: SOURCE, state: { done: new Map() }, callSection: server.callSection, callVerify: server.callVerify, callPlan: server.callPlan, ...overrides })

/** The questions of a complete exam. */
const run = async (server: Fake, overrides: Partial<Parameters<typeof generateExamQuestions>[0]> = {}) => (await runResult(server, overrides)).questions

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
      verify: (request) => ({ wrong: [], fixes: [], same: (request.pairs ?? []).map((pair) => pair.id), reviews: [] }),
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
        if (!target) return { wrong: [], fixes: [], same: [], reviews: [] }
        flagged = target.id
        corrected = !target.answerBool
        return { wrong: [target.id], fixes: [{ id: target.id, answerBool: !target.answerBool }], same: [], reviews: [] }
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
  test('a question that failed for how it was written is regenerated on a NEW unused fact, never on the one that failed', async () => {
    let planted: string | null = null
    const server = fake({
      shape: (made, request) => {
        if (request.type === 'short-answer' && planted === null) {
          planted = made.fact ?? ''
          return { ...made, answer: 'Bu çok uzun bir cevap cümlesidir ve yalnızca bir kelime olmalıydı' }
        }
        return made
      },
    })
    const questions = await run(server)
    expect(questions).toHaveLength(20)
    const rewrite = server.sections.find((request) => request.avoidAnswers !== undefined && request.type === 'short-answer')
    expect(rewrite?.facts).toHaveLength(1)
    expect(rewrite?.facts?.[0].fact).not.toBe(planted)
    const firstPass = server.sections.filter((request) => request.avoidAnswers === undefined).flatMap((request) => (request.facts ?? []).map((entry) => entry.fact))
    expect(firstPass).not.toContain(rewrite?.facts?.[0].fact)
    // The regenerated slot is told which facts and concepts are used up.
    expect(rewrite?.avoidConcepts?.length).toBeGreaterThan(0)
  })

  test('a writer that keeps answering with a fact that is already used does not fill the slot: the slot gets another fact and the exam completes', async () => {
    let usedFact: ExamFact | null = null
    let calls = 0
    const server = fake({
      shape: (made, request) => {
        // The first short answer is too long (so it is regenerated); the first two replies for the regenerated slot ignore the new fact and give back the old, used one.
        if (request.type === 'short-answer' && request.avoidAnswers === undefined && usedFact === null) {
          usedFact = { id: made.factId, fact: made.fact ?? '', topic: made.topic }
          return { ...made, answer: 'Bu çok uzun bir cevap cümlesidir ve yalnızca bir kelime olmalıydı' }
        }
        if (request.type === 'short-answer' && request.avoidAnswers !== undefined && calls < 2 && usedFact) {
          calls += 1
          return { ...made, fact: usedFact.fact, factId: usedFact.id }
        }
        return made
      },
    })
    const result = await runResult(server)
    expect(calls).toBeGreaterThan(0)
    expect(result.missing).toBe(0)
    expect(result.questions).toHaveLength(20)
    // No fact tests two questions.
    const facts = result.questions.map((entry) => entry.factId)
    expect(new Set(facts).size).toBe(facts.length)
  })

  test('no unused fact and no more facts in the source: a fact whose question failed gets one more try, and the exam still completes', async () => {
    let planted = 0
    const server = fake({
      facts: fakeFacts(20),
      noMoreFacts: true,
      shape: (made, request) => {
        if (request.type === 'short-answer' && request.avoidAnswers === undefined && planted < 2) {
          planted += 1
          return { ...made, answer: 'Bu çok uzun bir cevap cümlesidir ve yalnızca bir kelime olmalıydı' }
        }
        return made
      },
    })
    const result = await runResult(server)
    expect(server.extensions.length).toBeGreaterThanOrEqual(1)
    expect(result.missing).toBe(0)
    expect(result.questions).toHaveLength(20)
    const facts = result.questions.map((entry) => entry.factId)
    expect(new Set(facts).size).toBe(facts.length)
  })

  test('when the spare facts run out, one extra plan call brings more distinct facts and the exam completes', async () => {
    let planted = 0
    const server = fake({
      facts: fakeFacts(21),
      shape: (made, request) => {
        if (request.type === 'short-answer' && request.avoidAnswers === undefined && planted < 3) {
          planted += 1
          return { ...made, answer: 'Bu çok uzun bir cevap cümlesidir ve yalnızca bir kelime olmalıydı' }
        }
        return made
      },
    })
    const result = await runResult(server, { acceptFewer: true })
    expect(server.extensions.length).toBeGreaterThanOrEqual(1)
    expect(server.extensions[0].existing).toHaveLength(21)
    expect(result.missing).toBe(0)
    expect(result.questions).toHaveLength(20)
  })

  test('a scenario question whose correct option the scenario gives away is written again (the judge sees the option in a separate call)', async () => {
    let planted: string | null = null
    let flagged = false
    const server = fake({
      shape: (made, request) => {
        if (request.type === 'mcq' && planted === null) {
          planted = made.id
          return { ...made, context: 'Elif okulda bir etkinliğe katılıyor ve gördüğü yapının adını öğreniyor.' }
        }
        return made
      },
      verify: (request) => {
        const reviews = request.copyOnly && !flagged ? request.questions.map((entry) => ({ id: entry.id, copy: true, level: 3 as const, difficulty: 'medium' as const })) : []
        if (request.copyOnly) flagged = true
        return { wrong: [], fixes: [], same: [], reviews }
      },
    })
    const questions = await run(server)
    expect(questions).toHaveLength(20)
    expect(server.verifies.some((request) => request.copyOnly === true)).toBe(true)
    // Copy-only requests carry the scenario questions only, and never ask for a key.
    expect(server.verifies.filter((request) => request.copyOnly).every((request) => request.questions.every((entry) => entry.type === 'mcq' && Boolean(entry.context)))).toBe(true)
    expect(questions.some((entry) => entry.id === planted)).toBe(false)
  })

  test('levels 4 to 6 get related facts of their topic to combine; lower levels do not', async () => {
    const server = fake({ facts: fakeFacts(30).map((entry, index) => ({ ...entry, topic: Math.floor(index / 3) % 2 === 0 ? 'Organeller' : 'Mitoz bölünme', concept: `kavram ${Math.floor(index / 3)}` })) })
    await run(server)
    const asked = server.sections.slice(0, 4).flatMap((request) => (request.slots ?? []).map((slot, index) => ({ slot, fact: request.facts?.[index] })))
    const high = asked.filter((entry) => entry.slot.bloom >= 4)
    const low = asked.filter((entry) => entry.slot.bloom < 4)
    expect(high.length).toBeGreaterThan(0)
    expect(high.every((entry) => (entry.fact?.related?.length ?? 0) > 0)).toBe(true)
    expect(low.every((entry) => entry.fact?.related === undefined)).toBe(true)
    // A related fact belongs to the same topic and is not the fact of another question.
    const used = new Set(asked.map((entry) => entry.fact?.fact))
    for (const entry of high) for (const related of entry.fact?.related ?? []) expect(used.has(related)).toBe(false)
  })
  test('a defect that keeps coming back leaves those questions out; the rest is kept with exactly 100 points', async () => {
    // Every multiple-choice question reaches the reference rule: it never passes.
    const server = fake({ shape: (made) => (made.type === 'mcq' ? { ...made, stem: 'Bu modele göre hangi şık doğrudur?' } : made) })
    const state: ExamGenerationState = { done: new Map() }
    const result = await runResult(server, { state })
    expect(result.requested).toBe(20)
    expect(result.missing).toBe(5)
    expect(result.questions).toHaveLength(15)
    // No failing question is shown or saved; the type mix of the others is untouched.
    expect(result.questions.some((entry) => entry.type === 'mcq')).toBe(false)
    expect(result.questions.filter((entry) => entry.type === 'true-false')).toHaveLength(5)
    expect(result.questions.every((entry) => Number.isInteger(entry.points) && entry.points >= 1)).toBe(true)
    expect(result.questions.reduce((sum, entry) => sum + entry.points, 0)).toBe(100)
    expect(state.partial).toBe(true)
    // First pass: 4 sections; then at most MAX_REPAIR_ROUNDS rewrites of the 5 broken questions (one call each).
    expect(server.sections.length).toBeLessThanOrEqual(4 + (MAX_REPAIR_ROUNDS + MAX_FILL_ROUNDS) * 2)
  })

  test('retrying the missing questions asks for only those, on facts never used, and keeps what passed', async () => {
    let broken = true
    const server = fake({ facts: fakeFacts(60), shape: (made) => (broken && made.type === 'mcq' ? { ...made, stem: 'Bu modele göre hangi şık doğrudur?' } : made) })
    const state: ExamGenerationState = { done: new Map() }
    const first = await runResult(server, { state })
    expect(first.missing).toBe(5)
    const usedBefore = new Set(server.sections.flatMap((request) => (request.facts ?? []).map((entry) => entry.fact)))
    const keptIds = new Set(first.questions.map((entry) => entry.id))
    const callsBefore = server.sections.length
    broken = false
    const second = await runResult(server, { state })
    expect(second.missing).toBe(0)
    expect(second.questions).toHaveLength(20)
    // Everything that passed is still there, untouched.
    for (const id of keptIds) expect(second.questions.some((entry) => entry.id === id)).toBe(true)
    // Only the five missing questions were asked for, on facts nobody had been given.
    const retryRequests = server.sections.slice(callsBefore)
    expect(retryRequests.reduce((sum, request) => sum + request.count, 0)).toBe(5)
    for (const request of retryRequests) for (const entry of request.facts ?? []) expect(usedBefore.has(entry.fact)).toBe(false)
    expect(second.questions.reduce((sum, entry) => sum + entry.points, 0)).toBe(100)
  })

  test('a technical failure keeps the plan and what is written: trying again repeats none of it', async () => {
    const server = fake({ shape: (made) => (made.type === 'mcq' ? { ...made, stem: 'Bu modele göre hangi şık doğrudur?' } : made) })
    const state: ExamGenerationState = { done: new Map() }
    const realSection = server.callSection
    let outage = true
    server.callSection = async (request) => {
      // The first pass works; the rewrites run into an outage.
      if (outage && (request.facts ?? []).length > 0 && server.sections.length >= 4) throw new ExamApiError('upstream')
      return realSection(request)
    }
    const error = await runResult(server, { state }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ExamApiError)
    expect((error as ExamApiError).code).toBe('upstream')
    expect(state.plan).toBeDefined()
    expect(state.current?.length).toBe(20)
    const plans = server.plans
    const written = server.sections.length
    outage = false
    const result = await runResult(server, { state })
    expect(server.plans).toBe(plans)
    // The first-pass sections were not asked again; only rewrites ran.
    expect(server.sections.slice(written).every((request) => request.type === 'mcq')).toBe(true)
    expect(result.questions.length).toBeGreaterThanOrEqual(15)
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

test.describe('concepts', () => {
  const withConcepts = (perConcept: number[]): ExamFact[] => {
    const facts: ExamFact[] = []
    perConcept.forEach((count, concept) => {
      for (let index = 0; index < count; index += 1) facts.push({ fact: `${fakeFacts(1)[0].fact.split(' ')[0]}${concept}x${index} uygulaması`, topic: 'Konu', concept: `Beceri numarası ${concept}` })
    })
    return facts
  }

  test('a plan of ten applications of three skills carries six questions, so the exam stops before anything is written', async () => {
    const server = fake({ facts: withConcepts([4, 3, 3]) })
    const settings = defaultExamSettings(new Date('2026-10-10'))
    settings.counts = { ...settings.counts, 'open-ended': 2, 'short-answer': 2, 'true-false': 2, mcq: 2 }
    const error = await run(server, { settings }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ExamShortSourceError)
    expect((error as ExamShortSourceError).max).toBe(6)
    expect(server.sections).toHaveLength(0)
  })

  test('questions are given facts of at most two per concept, in plan order', async () => {
    // Ten applications of one skill come first, then thirty different facts: only two of the ten may be used.
    const all = fakeFacts(40)
    const facts = [...all.slice(0, 10).map((entry) => ({ ...entry, concept: 'Beceri numarası 0' })), ...all.slice(10).map((entry, index) => ({ ...entry, concept: `Başka beceri ${index}` }))]
    const server = fake({ facts })
    const questions = await run(server)
    expect(questions).toHaveLength(20)
    expect(questions.filter((entry) => entry.concept === 'Beceri numarası 0').length).toBeLessThanOrEqual(2)
  })
})
