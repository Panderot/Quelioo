import { expect, test } from '@playwright/test'

import { handleGenerateRequest } from '../../api/_lib/generate'
import { examVerifyPayload, parseVerifyResult } from '../../src/api/exam'
import type { ExamVerifyRequest, ExamVerifyResult } from '../../src/api/exam'
import { judgeKeys } from '../../src/lib/exam/generate'
import { numericValue, numbersDiffer } from '../../src/lib/exam/numeric'
import type { ExamQuestion } from '../../src/lib/exam/types'
import { EDEBIYAT_SHORT, KIMYA_MCQ, MATEMATIK_SHORT } from '../fixtures/exam-wrong-keys'

// The blind key check on every closed question type, with the three wrong keys of the real-AI audit as fixed data.
// The judge is a scripted fake behind the real server code (prompt, parsing): no real AI is called.

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = globalThis.fetch

test.afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in ORIGINAL_ENV)) delete process.env[key]
  Object.assign(process.env, ORIGINAL_ENV)
  globalThis.fetch = ORIGINAL_FETCH
})

/** What the scripted judge answers per question id, as an honest judge reading the source would. */
interface Script {
  mcq?: Record<string, string>
  solved?: Record<string, string>
  blind?: Record<string, { answer: string; multiple?: boolean }>
}

const SCRIPT: Script = {
  mcq: { [KIMYA_MCQ.question.id]: 'D' },
  solved: { [MATEMATIK_SHORT.question.id]: '\\frac{161}{289}', 'c-fraction': '12 m/s' },
  blind: {
    [EDEBIYAT_SHORT.question.id]: { answer: 'düğünlerde ve köy odalarında', multiple: true },
    'c-same': { answer: 'Yedi heceli' },
    'c-abdest': { answer: 'Abdest almak' },
  },
}

function promptOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(promptOf).join('\n')
  if (value && typeof value === 'object') return Object.values(value).map(promptOf).join('\n')
  return ''
}

/** The judge: finds the items in the prompt exactly as the server wrote them and answers from the script. */
function judgeServer(script: Script): { prompts: string[]; call: (request: ExamVerifyRequest) => Promise<ExamVerifyResult> } {
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.LLM_PROVIDER_ORDER = 'openai'
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.VERCEL_ENV
  const prompts: string[] = []
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const prompt = promptOf(JSON.parse(init?.body ?? '{}'))
    prompts.push(prompt)
    const items = [...prompt.matchAll(/<item id="([^"]+)" type="([^"]+)"( solve="yes")?>/g)].map((match) => ({ id: match[1], type: match[2], solve: Boolean(match[3]) }))
    const reply = prompt.includes('BLIND ANSWER')
      ? { blind: items.map((item) => ({ id: item.id, answer: script.blind?.[item.id]?.answer ?? 'unknown', multiple: script.blind?.[item.id]?.multiple ?? false })) }
      : {
          answers: items.filter((item) => item.type === 'mcq').map((item) => ({ id: item.id, answer: script.mcq?.[item.id] ?? 'unknown' })),
          reviews: items.map((item) => ({ id: item.id, level: 1, difficulty: 'easy', copy: false, ...(item.solve ? { solved: script.solved?.[item.id] ?? 'unknown' } : {}) })),
        }
    return new Response(JSON.stringify({ output_text: JSON.stringify(reply), usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 })
  }) as typeof fetch
  return {
    prompts,
    call: async (request) => {
      const { status, body } = await handleGenerateRequest(examVerifyPayload(request))
      expect(status, JSON.stringify(body)).toBe(200)
      return parseVerifyResult(body as unknown as Record<string, unknown>)
    },
  }
}

function written(id: string, type: 'short-answer' | 'fill-blanks', stem: string, answer: string, acceptable: string[] = []): ExamQuestion {
  return { id, type, stem, answer, ...(acceptable.length > 0 ? { acceptableAnswers: acceptable } : {}), rubric: [{ text: answer, points: 4 }], points: 4, topic: 'T', difficulty: 'easy', lines: 1 }
}

test.describe('numeric answers', () => {
  test('LaTeX, signs, dollars and decimal comma or point are read as numbers', () => {
    const cases: [string, number][] = [
      ['97', 97],
      ['-4', -4],
      ['−4', -4],
      ['0,007 mm', 0.007],
      ['3.5', 3.5],
      ['\\frac{97}{289}', 97 / 289],
      ['$\\dfrac{97}{289}$', 97 / 289],
      ['$-\\frac{4}{3}$', -4 / 3],
      ['-\\dfrac{4}{3}', -4 / 3],
      ['97/289', 97 / 289],
      ['\\sqrt{2}', Math.SQRT2],
      ['$2\\sqrt{3}$', 2 * Math.sqrt(3)],
      ['\\frac{\\sqrt{3}}{2}', Math.sqrt(3) / 2],
      ['$12\\ \\mathrm{m/s}$', 12],
      ['5,0·10⁻⁹ mol/L', 5e-9],
      ['$2{,}0\\cdot10^{-6}$', 2e-6],
      ['3 4/5', 3.8],
    ]
    for (const [text, value] of cases) expect(numericValue(text), text).toBeCloseTo(value, 9)
    for (const text of ['Ayin ve sohbetlerde', 'x = 5', '', '\\frac{a}{b}', 'unknown']) expect(numericValue(text), text).toBeNull()
  })

  test('161/289 and 97/289 differ in any spelling; a rounded value of the same number does not', () => {
    expect(numbersDiffer('\\frac{97}{289}', '161/289')).toBe(true)
    expect(numbersDiffer('$\\frac{97}{289}$', '\\dfrac{161}{289}')).toBe(true)
    expect(numbersDiffer('\\frac{161}{289}', '0,557')).toBe(false)
    expect(numbersDiffer('0,007 mm', '0,007 milimetre')).toBe(false)
    expect(numbersDiffer('5,0·10⁻⁹', '2,0·10⁻⁸')).toBe(true)
    expect(numbersDiffer('abdest', '12')).toBe(false)
  })

  test('a LaTeX key is sent to the judge as a calculation to work out blind, a word key is not', () => {
    for (const type of ['short-answer', 'fill-blanks'] as const) {
      for (const key of ['\\frac{97}{289}', '$-\\dfrac{4}{3}$', '\\sqrt{2}', '-3,5', '3.5', '0,007 mm']) {
        const item = (examVerifyPayload({ text: 'x', questions: [written('q', type, 'Soru?', key)] }).items as { solve?: boolean }[])[0]
        expect(item.solve, `${type} ${key}`).toBe(true)
      }
      const word = (examVerifyPayload({ text: 'x', questions: [written('q', type, 'Soru?', 'Ayin ve sohbetlerde')] }).items as { solve?: boolean }[])[0]
      expect(word.solve).toBeUndefined()
    }
  })
})

test.describe('the three wrong keys of the audit', () => {
  test('Kimya 11 S19 (mcq): the key is corrected from the blind reading', async () => {
    const judge = judgeServer(SCRIPT)
    const result = await judgeKeys([KIMYA_MCQ.question], KIMYA_MCQ.source, judge.call)
    expect(result.questions[0].answerIndex).toBe(3)
    expect(result.questions[0].answer).toBe(KIMYA_MCQ.question.options?.[3])
    expect(result.rewrite).toEqual([])
    expect(judge.prompts.join('\n')).not.toContain('Expected answer')
  })

  test('Matematik 11 S6 (short answer, \\frac key): the judge works it out blind and the 161/289 result catches the key', async () => {
    const judge = judgeServer(SCRIPT)
    const result = await judgeKeys([MATEMATIK_SHORT.question], MATEMATIK_SHORT.source, judge.call)
    expect(result.rewrite).toEqual([MATEMATIK_SHORT.question.id])
    // Blind: the key is in no prompt.
    expect(judge.prompts.join('\n')).not.toContain('97')
  })

  test('Edebiyat 10 S7 (short answer, words): the blind answer differs and the question has more than one defensible answer', async () => {
    const judge = judgeServer(SCRIPT)
    const result = await judgeKeys([EDEBIYAT_SHORT.question], EDEBIYAT_SHORT.source, judge.call)
    expect(result.rewrite).toEqual([EDEBIYAT_SHORT.question.id])
    // The blind reading never sees the key.
    const blindPrompts = judge.prompts.filter((prompt) => prompt.includes('BLIND ANSWER'))
    expect(blindPrompts.length).toBeGreaterThan(0)
    for (const prompt of blindPrompts) expect(prompt.toLowerCase()).not.toContain('ayin ve sohbet')
  })

  test('the same three questions with the right keys pass', async () => {
    const judge = judgeServer(SCRIPT)
    const right: ExamQuestion[] = [
      { ...MATEMATIK_SHORT.question, answer: '\\frac{161}{289}', acceptableAnswers: ['\\frac{161}{289}'], rubric: [{ text: '\\frac{161}{289}', points: 5 }] },
      { ...KIMYA_MCQ.question, answerIndex: 3, answer: KIMYA_MCQ.question.options?.[3] ?? '' },
    ]
    const result = await judgeKeys(right, MATEMATIK_SHORT.source, judge.call)
    expect(result.rewrite).toEqual([])
    expect(result.questions[1].answerIndex).toBe(3)
  })
})

test.describe('written keys that are right', () => {
  test('the same answer in another wording, or with a unit, is not flagged', async () => {
    const judge = judgeServer(SCRIPT)
    const list = [
      written('c-same', 'short-answer', 'Mâni kaç heceli yazılır?', 'Yedi hece'),
      written('c-abdest', 'fill-blanks', 'Namazdan önce yapılan temizliğe ____ denir.', 'abdest', ['Abdest']),
      written('c-fraction', 'short-answer', 'Hız kaçtır?', '12 m/s'),
    ]
    const result = await judgeKeys(list, EDEBIYAT_SHORT.source, judge.call)
    expect(result.rewrite).toEqual([])
  })

  test('an answer the judge cannot decide ("unknown") never blocks a question', async () => {
    const judge = judgeServer({})
    const result = await judgeKeys([written('u1', 'short-answer', 'Mâni kaç heceli yazılır?', 'Yedi hece'), written('u2', 'short-answer', 'x?', '\\frac{1}{2}')], EDEBIYAT_SHORT.source, judge.call)
    expect(result.rewrite).toEqual([])
  })

  test('a wrong word key is caught for fill-blanks too', async () => {
    const judge = judgeServer({ blind: { f1: { answer: 'Yunus Emre' } } })
    const result = await judgeKeys([written('f1', 'fill-blanks', 'Tekke edebiyatının en büyük temsilcisi ____ idi.', 'Karacaoğlan')], EDEBIYAT_SHORT.source, judge.call)
    expect(result.rewrite).toEqual(['f1'])
  })
})
