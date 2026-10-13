import { expect, test } from '@playwright/test'

import { handleGenerateRequest } from '../../api/_lib/generate'
import { examVerifyPayload, parseVerifyResult } from '../../src/api/exam'
import { buildGroup } from '../../src/lib/exam/groups'
import { applyFix } from '../../src/lib/exam/generate'
import { matchingKey, rightColumn } from '../../src/lib/exam/paperText'
import type { ExamQuestion } from '../../src/lib/exam/types'
import { sampleExam } from '../fixtures/exam'

// A matching question saved with wrong pairs is corrected by the judge's blind reading of the source:
// pairs, answer and grading criteria follow it, the printed right column keeps its texts in its places.

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = globalThis.fetch

test.afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in ORIGINAL_ENV)) delete process.env[key]
  Object.assign(process.env, ORIGINAL_ENV)
  globalThis.fetch = ORIGINAL_FETCH
})

const SOURCE = `${Array.from({ length: 60 }, (_, i) => `Kelime${i}`).join(' ')} Ribozom protein sentezler. Çekirdek DNA taşır. Kloroplast fotosentez yapar. Mitokondri ATP üretir.`

const WRONG: ExamQuestion = {
  id: 'm1',
  type: 'matching',
  stem: 'Eşleştir.',
  pairs: [
    { left: 'Ribozom', right: 'ATP üretir' },
    { left: 'Çekirdek', right: 'DNA taşır' },
    { left: 'Kloroplast', right: 'Maddeleri denetler' },
    { left: 'Mitokondri', right: 'Protein sentezler' },
  ],
  extras: ['Fotosentez yapar', 'Dayanıklılık kazandırır'],
  rightOrder: [3, 0, 4, 5, 2, 1],
  answer: 'Ribozom = ATP üretir; Çekirdek = DNA taşır; Kloroplast = Maddeleri denetler; Mitokondri = Protein sentezler',
  rubric: [1, 2, 3, 4].map((n) => ({ text: `x${n}`, points: 1.25 })),
  points: 5,
  topic: 'T',
  difficulty: 'medium',
  lines: 0,
}

const TRUTH: Record<string, string> = { Ribozom: 'Protein sentezler', Çekirdek: 'DNA taşır', Kloroplast: 'Fotosentez yapar', Mitokondri: 'ATP üretir' }

async function judged(): Promise<ExamQuestion> {
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.LLM_PROVIDER_ORDER = 'openai'
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.VERCEL_ENV
  let prompt = ''
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    prompt = init?.body ?? ''
    // The judge reads the printed column: find the letter of each right item as the prompt lists it.
    const letters = (WRONG.pairs ?? []).map((pair) => {
      const found = new RegExp(`([A-J])\\) ${TRUTH[pair.left]}`).exec(prompt)
      return found ? found[1] : '?'
    })
    const reply = { answers: [], reviews: [{ id: 'm1', level: 1, difficulty: 'easy', copy: false }], matches: [{ id: 'm1', rights: letters }] }
    return new Response(JSON.stringify({ output_text: JSON.stringify(reply), usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 })
  }) as typeof fetch
  const { status, body } = await handleGenerateRequest(examVerifyPayload({ text: SOURCE, questions: [WRONG] }))
  expect(status, JSON.stringify(body)).toBe(200)
  const result = parseVerifyResult(body as unknown as Record<string, unknown>)
  expect(prompt).not.toContain('ATP üretir = ')
  return applyFix(WRONG, result)
}

test('wrong saved pairs follow the judge reading; the printed right column does not change; key right on A and B', async () => {
  const fixed = await judged()
  expect(fixed.pairs?.map((pair) => [pair.left, pair.right])).toEqual(Object.entries(TRUTH))
  expect([...(fixed.extras ?? [])].sort()).toEqual(['Dayanıklılık kazandırır', 'Maddeleri denetler'].sort())
  expect(fixed.answer).toBe('Ribozom = Protein sentezler; Çekirdek = DNA taşır; Kloroplast = Fotosentez yapar; Mitokondri = ATP üretir')
  expect(fixed.rubric.map((item) => item.text)).toEqual(Object.entries(TRUTH).map(([left, right]) => `${left} = ${right}`))
  expect(fixed.rubric.map((item) => item.points)).toEqual([1.25, 1.25, 1.25, 1.25])
  expect(rightColumn(fixed)).toEqual(rightColumn(WRONG))

  const exam = { ...sampleExam(), questions: [fixed] }
  for (const group of ['A', 'B'] as const) {
    const question = buildGroup(exam, group)[0]
    const column = rightColumn(question)
    matchingKey(question)
      .split(', ')
      .forEach((entry, index) => {
        const letter = entry.split('-')[1]
        expect(column[letter.charCodeAt(0) - 65]).toBe(TRUTH[(fixed.pairs ?? [])[index].left])
      })
  }
})

test('a question whose pairs already agree with the judge is left as it is', () => {
  const right = { ...WRONG, pairs: (WRONG.pairs ?? []).map((pair) => ({ ...pair, right: TRUTH[pair.left] })) }
  const same = applyFix(right, { wrong: [], same: [], reviews: [], fixes: [{ id: 'm1', matches: Object.values(TRUTH) }] })
  expect(same).toBe(right)
})
