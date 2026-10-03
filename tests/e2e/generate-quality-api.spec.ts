import { expect, test } from '@playwright/test'

import { handleGenerateRequest } from '../../api/_lib/generate'
import type { GenerateMetrics } from '../../api/_lib/generate'

// Server-side tests for /api/generate's facts plan and quality pass (no browser): OpenAI is stubbed at
// the fetch level and answers by call kind (plan, write, review, rewrite), so the real prompt
// building, deterministic checks, rewrite selection and fallbacks all run.

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = globalThis.fetch

test.afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in ORIGINAL_ENV)) delete process.env[key]
  Object.assign(process.env, ORIGINAL_ENV)
  globalThis.fetch = ORIGINAL_FETCH
})

type CallKind = 'plan' | 'write' | 'review' | 'rewrite' | 'coverage'

interface StubCall {
  kind: CallKind
  model: string
  text: string
}

function kindOf(text: string): CallKind {
  if (text.includes('You prepare the facts plan')) return 'plan'
  if (text.includes('You check which facts each quiz question really tests')) return 'coverage'
  if (text.includes('strict teacher reviewing')) return 'review'
  if (text.includes('Write exactly ONE new question')) return 'rewrite'
  return 'write'
}

/** OpenAI-only stub; `reply` returns the JSON for a call, or a number to answer with that HTTP status. */
function stubOpenAi(reply: (call: StubCall) => unknown): StubCall[] {
  const calls: StubCall[] = []
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.LLM_PROVIDER_ORDER = 'openai'
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.VERCEL_ENV
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as Record<string, unknown>
    const text = JSON.stringify(body)
    const call: StubCall = { kind: kindOf(text), model: body.model as string, text }
    calls.push(call)
    const answer = reply(call)
    if (typeof answer === 'number') return new Response('{}', { status: answer })
    return new Response(JSON.stringify({ output_text: JSON.stringify(answer), usage: { input_tokens: 1000, output_tokens: 300 } }), { status: 200 })
  }) as typeof fetch
  return calls
}

const SOURCE_TR =
  'Fotosentez, yeşil bitkilerin ışık enerjisini kullanarak besin üretmesidir. Bitki suyu kökleriyle topraktan emer. Karbondioksit yapraklardaki stomalardan girer. Klorofil, ışığı soğuran yeşil pigmenttir ve kloroplastlarda bulunur. Üretilen glikoz, bitkinin enerji kaynağıdır ve fazlası nişasta olarak depolanır. Bu süreçte oksijen açığa çıkar. Sıcaklık çok yükselirse enzimler bozulur ve fotosentez yavaşlar.'

const fill = (id: string, question: string, answer: string, factIds: number[] = []) => ({
  id,
  type: 'fill-blanks',
  question,
  answer,
  acceptableAnswers: [answer],
  explanation: '',
  estimatedSeconds: 20,
  factIds,
})

const basePayload = {
  mode: 'generate',
  text: SOURCE_TR,
  questionType: 'fill-blanks',
  difficulty: 'easy',
  outputLanguage: 'tr',
  includeHints: false,
  includeExplanations: false,
}

test('quality pass rewrites only the flagged questions (deterministic leak + model flag)', async () => {
  const calls = stubOpenAi((call) => {
    if (call.kind === 'write') {
      return {
        title: 'Fotosentez',
        questions: [
          fill('a', 'Bitkinin enerji kaynağı olan şeker ___ olarak adlandırılır.', 'glikoz'),
          fill('b', 'Klorofil en çok ___ soğurur.', 'ışık'),
          fill('c', 'Yapraktaki stomalardan giren gaz ___ olarak adlandırılır; bu gaz ışığın yardımıyla kullanılır.', 'karbondioksit'),
        ],
      }
    }
    if (call.kind === 'review') return { flags: [{ id: call.text.match(/q_[a-z0-9]+_0/)?.[0] ?? 'none', reason: 'The blank is ambiguous.' }] }
    if (call.kind === 'rewrite') {
      return call.text.includes('<previous_version>\\nBitkinin')
        ? { question: fill('x', 'Bitki fazla şekeri ___ olarak depolar.', 'nişasta') }
        : { question: fill('y', 'Fotosentez sırasında açığa çıkan gaz ___ olarak adlandırılır.', 'oksijen') }
    }
    return {}
  })
  let metrics: GenerateMetrics | undefined
  const { status, body } = await handleGenerateRequest({ ...basePayload, questionCount: '3' }, { onMetrics: (value) => (metrics = value) })
  expect(status).toBe(200)
  const answers = (body as { questions: { answer: string }[] }).questions.map((question) => question.answer)
  expect(answers).toEqual(['nişasta', 'oksijen', 'karbondioksit'])
  expect(calls.filter((call) => call.kind === 'rewrite')).toHaveLength(2)
  // The plan runs for every count; an unusable plan reply (here {}) falls back to writing without it.
  expect(calls.filter((call) => call.kind === 'plan')).toHaveLength(2)
  expect(body).not.toHaveProperty('coverage')
  expect(calls.find((call) => call.kind === 'review')?.model).toBe('gpt-6-luna')
  // The rewrite gets the rest of the quiz and the reasons as DATA.
  const rewrite = calls.find((call) => call.kind === 'rewrite')!.text
  expect(rewrite).toContain('<other_questions>')
  expect(rewrite).toContain('<rewrite_reasons>')
  expect(metrics).toMatchObject({ deterministicFlags: 1, modelFlags: 1, rewritten: 2, accepted: 2 })
})

test('a rewrite that is not better keeps the original; a leak that survives its rewrite is removed', async () => {
  stubOpenAi((call) => {
    if (call.kind === 'write') {
      return {
        title: 'T',
        questions: [
          fill('a', 'Klorofil en çok ___ soğurur.', 'ışık'),
          fill('b', 'Fotosentez için ___ gerekir; ışık enerjisi kullanılır.', 'su'),
          fill('c', 'Fazla şeker bitkide ___ olarak depolanır.', 'nişasta'),
        ],
      }
    }
    if (call.kind === 'review') return { flags: [{ id: call.text.match(/q_[a-z0-9]+_2/)?.[0] ?? 'none', reason: 'Too easy.' }] }
    // Both rewrites are worse: "a" still leaks, and the rewrite of "c" repeats the answer of "b".
    return call.text.includes('<previous_version>\nKlorofil')
      ? { question: fill('x', 'Yeşil pigment en çok ___ soğurur.', 'ışığı') }
      : { question: fill('y', 'Bitkinin kökleriyle aldığı madde: ___', 'su') }
  })
  const { body } = await handleGenerateRequest({ ...basePayload, questionCount: '3' })
  expect((body as { questions: { answer: string }[] }).questions.map((question) => question.answer)).toEqual(['su', 'nişasta'])
  expect(body).toMatchObject({ incomplete: true })
})

test('the review call failing never fails the generation; deterministic fixes still apply', async () => {
  stubOpenAi((call) => {
    if (call.kind === 'write') return { title: 'T', questions: [{ ...fill('a', 'Bitkinin enerji kaynağı ___ olarak adlandırılır.', 'glikoz'), acceptableAnswers: [] }] }
    if (call.kind === 'review') return 500
    return 500
  })
  const { status, body } = await handleGenerateRequest({ ...basePayload, questionCount: '1' })
  expect(status).toBe(200)
  const [question] = (body as { questions: { acceptableAnswers: string[] }[] }).questions
  expect(question.acceptableAnswers).toEqual(['glikoz'])
})

const plannedFact = (label: string, statement: string, sentence: number, items?: string[]) => ({ label, statement, s: [sentence], importance: 'core', ...(items ? { items } : {}) })

test('a manual count larger than the facts: the plan runs first, fewer questions with supportedCount and the coverage', async () => {
  const facts = [
    plannedFact('Tanım', 'Fotosentez ışıkla besin üretimidir', 1),
    plannedFact('Su alımı', 'Su köklerle emilir', 2),
    plannedFact('Gaz girişi', 'Karbondioksit stomalardan girer', 3),
    plannedFact('Pigment', 'Klorofil ışığı soğurur', 4),
  ]
  const calls = stubOpenAi((call) => {
    if (call.kind === 'plan') return { facts, noTestable: [5, 6, 7] }
    if (call.kind === 'write') {
      return {
        title: 'T',
        questions: [
          fill('1', 'Bitkilerin ışıkla besin üretmesi sürecine ___ denir.', 'fotosentez', [1]),
          fill('2', 'Bitki suyu topraktan ___ yardımıyla alır.', 'kök', [2]),
          fill('3', 'Stomalardan giren gaz ___ olarak adlandırılır.', 'karbondioksit', [3]),
          fill('4', 'Işığı soğuran yeşil pigment ___ olarak adlandırılır.', 'klorofil', [4]),
        ],
      }
    }
    if (call.kind === 'review') return { flags: [] }
    return 500
  })
  const { status, body } = await handleGenerateRequest({ ...basePayload, questionCount: '10', avoidQuestions: ['Eski soru?'] })
  expect(status).toBe(200)
  expect(body).toMatchObject({ supportedCount: 4, requestedCount: 10, incomplete: false })
  const result = body as { questions: { factIds: number[] }[]; coverage: { facts: { label: string }[] } }
  expect(result.questions.map((question) => question.factIds)).toEqual([[1], [2], [3], [4]])
  expect(result.coverage.facts.map((fact) => fact.label)).toEqual(['Tanım', 'Su alımı', 'Gaz girişi', 'Pigment'])
  const plan = calls.find((call) => call.kind === 'plan')!
  expect(plan.model).toBe('gpt-6-luna')
  // The source goes to the planner as numbered sentences inside its DATA tag; the avoid list is matched deterministically.
  expect(plan.text).toContain('<source_sentences>')
  expect(plan.text).not.toContain('Eski soru')
  const write = calls.find((call) => call.kind === 'write')!
  expect(write.text).toContain('<question_plan>')
  expect(calls.filter((call) => call.kind === 'write')).toHaveLength(1)
  expect(calls.filter((call) => call.kind === 'plan')).toHaveLength(1) // every sentence linked or marked: no gap rerun
})

test('20 questions are written in two batches of 10 with distinct facts', async () => {
  const sentences = Array.from({ length: 40 }, (_, index) => `Fact number ${index + 1} is here.`).join(' ')
  const facts = Array.from({ length: 40 }, (_, index) => plannedFact(`Topic ${index + 1}`, `Fact ${index + 1}`, index + 1))
  const calls = stubOpenAi((call) => {
    if (call.kind === 'plan') return { facts, noTestable: [] }
    if (call.kind === 'write') {
      const slots = [...call.text.matchAll(/type mcq — fact (\d+)/g)].map((match) => Number(match[1]))
      return {
        title: 'T',
        questions: slots.map((fact) => ({
          id: `m${fact}`,
          type: 'mcq',
          question: `Question about topic${fact} number ${fact}?`,
          options: [`Ans${fact}a`, `Opt${fact}b`, `Opt${fact}c`, `Opt${fact}d`],
          answerIndex: 0,
          explanation: '',
          factIds: [fact],
        })),
      }
    }
    if (call.kind === 'review') return { flags: [] }
    return 500
  })
  const { body } = await handleGenerateRequest({ ...basePayload, text: sentences, questionType: 'mcq', optionsCount: '4', outputLanguage: 'en', questionCount: '20' })
  expect((body as { questions: unknown[] }).questions).toHaveLength(20)
  expect(calls.filter((call) => call.kind === 'write')).toHaveLength(2)
  expect(calls.filter((call) => call.kind === 'review')).toHaveLength(1) // one review over the combined quiz
})

test('Auto: every list item gets a question; a missed item is written by the missing-facts pass', async () => {
  const facts = [plannedFact('Tanım', 'Fotosentez ışıkla besin üretimidir', 1), plannedFact('Girdiler', 'Fotosentez su, karbondioksit ve ışık ister', 2, ['su', 'karbondioksit', 'ışık'])]
  const text = 'Fotosentez, yeşil bitkilerin ışık enerjisini kullanarak kendi besinlerini üretmesidir. Fotosentez için su, karbondioksit ve ışık gerekir; bu üç girdiden biri eksik olursa süreç durur. Bu konu çok önemlidir ve her öğrenci bunu dikkatle, sabırla ve tekrar ederek öğrenmelidir.'
  let writes = 0
  const calls = stubOpenAi((call) => {
    if (call.kind === 'plan') return { facts, noTestable: [3] }
    if (call.kind === 'write') {
      writes += 1
      if (writes === 1) {
        // The first batch misses the last slot ("ışık").
        return {
          title: 'T',
          questions: [
            fill('1', 'Yeşil bitkilerin besin üretme sürecine ___ denir.', 'fotosentez', [1]),
            fill('2', 'Bitkinin topraktan aldığı sıvı girdi ___ olarak adlandırılır.', 'su', [2]),
            fill('3', 'Havadan alınan gaz girdi ___ olarak adlandırılır.', 'karbondioksit', [2]),
          ],
        }
      }
      if (writes <= 3) return { title: 'T', questions: [] } // the in-batch retry fails too
      return { title: 'T', questions: [fill('4', 'Güneşten gelen ve besin üretimi için gereken girdi ___ olarak adlandırılır.', 'ışık', [2])] }
    }
    if (call.kind === 'review') return { flags: [] }
    return 500 // coverage verification unavailable: the claims stay
  })
  let metrics: GenerateMetrics | undefined
  const { status, body } = await handleGenerateRequest({ ...basePayload, text, questionCount: 'auto' }, { onMetrics: (value) => (metrics = value) })
  expect(status).toBe(200)
  const result = body as { questions: { answer: string; factIds: number[]; factItems?: Record<string, number[]> }[]; coverage: { facts: unknown[] } }
  expect(result.questions.map((question) => question.answer)).toEqual(['fotosentez', 'su', 'karbondioksit', 'ışık'])
  expect(result.questions.map((question) => question.factItems ?? null)).toEqual([null, { 2: [0] }, { 2: [1] }, { 2: [2] }])
  expect(result.coverage.facts).toHaveLength(2)
  expect(metrics).toMatchObject({ facts: 2, coveredBefore: 1, coveredAfter: 2, missingAdded: 1 })
  // The first write asked for one question per item, each told not to name the other items.
  const first = calls.find((call) => call.kind === 'write')!.text
  expect(first).toContain('only item 3:')
  expect(first).toContain('never names the list')
})

test('cover_missing: only the missing questions, and an existing question that contains the new answer is reworded', async () => {
  const plan = [
    { id: 1, label: 'Tanım', statement: 'Fotosentez ışıkla besin üretimidir', span: 'x', importance: 'core', position: 0 },
    { id: 2, label: 'Girdiler', statement: 'Fotosentez su ve ışık ister', span: 'y', importance: 'core', position: 0.5, items: ['su', 'ışık'] },
  ]
  const calls = stubOpenAi((call) => {
    if (call.kind === 'write') return { title: 'T', questions: [fill('n', 'Bitkinin topraktan aldığı sıvı girdi ___ olarak adlandırılır.', 'su', [2])] }
    if (call.kind === 'rewrite') return { question: fill('r', 'Yeşil bitkilerin kendi besinini üretme sürecine ___ denir.', 'fotosentez') }
    return 500
  })
  const { status, body } = await handleGenerateRequest({
    ...basePayload,
    mode: 'cover_missing',
    plan,
    missing: [{ id: 2, items: [0] }, { id: 99 }],
    existingCount: 2,
    otherQuestions: [
      { id: 'q1', question: 'Bitkiler su ve ışıkla besin üretir; bu sürece ___ denir.', answer: 'fotosentez', type: 'fill-blanks', factIds: [1] },
      { id: 'q2', question: 'Besin üretimi için güneşten gelen girdi ___ olarak adlandırılır.', answer: 'ışık', type: 'fill-blanks', factIds: [2], factItems: { 2: [1] } },
    ],
  })
  expect(status).toBe(200)
  const result = body as {
    questions: { answer: string; factIds: number[]; factItems: Record<string, number[]> }[]
    replaced: { id: string; question: string; factIds: number[] }[]
  }
  expect(result.questions).toHaveLength(1)
  expect(result.questions[0]).toMatchObject({ answer: 'su', factIds: [2], factItems: { 2: [0] } })
  expect(result.replaced).toHaveLength(1)
  expect(result.replaced[0]).toMatchObject({ id: 'q1', factIds: [1] })
  expect(result.replaced[0].question).not.toContain(' su ')
  const reword = calls.find((call) => call.kind === 'rewrite')!.text
  expect(reword).toContain('which is the answer of another question')
  expect(calls.filter((call) => call.kind === 'write')).toHaveLength(1)
})

test('regenerate-one sends the rest of the quiz (questions and answers) as DATA and retries once on a leak', async () => {
  let rewriteCount = 0
  const calls = stubOpenAi((call) => {
    if (call.kind !== 'rewrite') return 500
    rewriteCount += 1
    return rewriteCount === 1
      ? { question: fill('x', 'Stomalardan giren gaz ___ olarak adlandırılır.', 'karbondioksit') }
      : { question: fill('y', 'Fazla şeker bitkide ___ olarak depolanır.', 'nişasta') }
  })
  const { status, body } = await handleGenerateRequest({
    ...basePayload,
    mode: 'regenerate_one',
    avoidQuestions: ['Yaprakta gaz alışverişini ___ sağlar.'],
    otherQuestions: [{ question: 'Yaprakta gaz alışverişini ___ sağlar.', answer: 'stoma', type: 'fill-blanks' }],
  })
  expect(status).toBe(200)
  expect((body as { question: { answer: string } }).question.answer).toBe('nişasta')
  expect(calls).toHaveLength(2)
  expect(calls[0].text).toContain('<other_questions>')
  expect(calls[0].text).toContain('A: stoma')
})
