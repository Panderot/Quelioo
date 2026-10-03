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

type CallKind = 'plan' | 'write' | 'review' | 'rewrite'

interface StubCall {
  kind: CallKind
  model: string
  text: string
}

function kindOf(text: string): CallKind {
  if (text.includes('You prepare a facts plan')) return 'plan'
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
  expect(calls.filter((call) => call.kind === 'plan')).toHaveLength(0) // 1-5 questions: no plan call
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

test('more than 5 questions: the facts plan runs first and a short text returns fewer questions with supportedCount', async () => {
  const facts = ['Fotosentez ışıkla besin üretimidir', 'Su köklerle emilir', 'Karbondioksit stomalardan girer', 'Klorofil ışığı soğurur'].map((text, index) => ({
    text,
    span: SOURCE_TR.split('.')[index].trim().split(' ').slice(0, 5).join(' '),
    importance: 3,
    focus: false,
    usedBefore: false,
  }))
  const calls = stubOpenAi((call) => {
    if (call.kind === 'plan') return { facts }
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
  expect((body as { questions: unknown[] }).questions).toHaveLength(4)
  const plan = calls.find((call) => call.kind === 'plan')!
  expect(plan.model).toBe('gpt-6-luna')
  expect(plan.text).toContain('<previous_questions>')
  const write = calls.find((call) => call.kind === 'write')!
  expect(write.text).toContain('<question_plan>')
  expect(calls.filter((call) => call.kind === 'write')).toHaveLength(1)
})

test('20 questions are written in two batches of 10 with distinct facts', async () => {
  const facts = Array.from({ length: 40 }, (_, index) => ({ text: `Fact ${index + 1}`, span: '', importance: 2, focus: false, usedBefore: false }))
  const calls = stubOpenAi((call) => {
    if (call.kind === 'plan') return { facts }
    if (call.kind === 'write') {
      const slots = [...call.text.matchAll(/type mcq — facts (\d+)/g)].map((match) => Number(match[1]))
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
  const { body } = await handleGenerateRequest({ ...basePayload, questionType: 'mcq', optionsCount: '4', outputLanguage: 'en', questionCount: '20' })
  expect((body as { questions: unknown[] }).questions).toHaveLength(20)
  expect(calls.filter((call) => call.kind === 'write')).toHaveLength(2)
  expect(calls.filter((call) => call.kind === 'review')).toHaveLength(1) // one review over the combined quiz
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
