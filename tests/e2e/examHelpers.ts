import type { Page } from '@playwright/test'

import type { ExamQuestion, ExamQuestionType, WrittenExam } from '../../src/lib/exam/types'

export const E2E_USER_ID = 'e2e-user'

export const EXAM_SOURCE =
  'Fotosentez, bitkilerin ışık enerjisini kimyasal enerjiye çevirdiği süreçtir. Kloroplastlarda gerçekleşir ve iki evreden oluşur: ışığa bağımlı evre tilakoit zarlarda, Calvin döngüsü ise stromada yapılır. Işığa bağımlı evrede su parçalanır, oksijen açığa çıkar ve ATP ile NADPH üretilir. Calvin döngüsünde karbondioksit glikoza dönüştürülür. Klorofil ışığı soğuran ana pigmenttir ve yapraklara yeşil rengini verir. Fotosentezin hızı ışık şiddetine, sıcaklığa ve karbondioksit derişimine bağlıdır.'

export interface ExamApiCall {
  mode: string
  type?: string
  count?: number
  [key: string]: unknown
}

/** A generated question as the server returns it: points 0, rubric weights in rubric[].points. */
/** Five words that belong to this question only, so near-duplicate checks never merge two generated questions. */
function distinctWords(tag: string): string {
  const n = [...tag].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1_000_003, 7)
  // Letters only and different in the first five characters: the duplicate check compares word beginnings.
  const word = (k: number) => {
    let x = k + 1_000_003
    let s = ''
    for (let i = 0; i < 6; i += 1) {
      s += String.fromCharCode(97 + (x % 26))
      x = Math.floor(x / 26)
    }
    return s
  }
  return [0, 1, 2, 3, 4].map((i) => word(n * 5 + i)).join(' ')
}

/** The facts a mocked plan returns: as many as asked for, each worded differently. */
export function fakeFacts(count: number): { fact: string; topic: string }[] {
  return Array.from({ length: count }, (_, index) => ({ fact: `${distinctWords(`fact${index}`)} olgusu`, topic: 'Fotosentez' }))
}

export function fakeQuestion(type: ExamQuestionType, tag: string): ExamQuestion {
  const base = { id: `gen-${type}-${tag}`, type, stem: `${distinctWords(`${type}${tag}`)} ile ilgili ${type} ${tag} ğüşıöçİ hangisidir?`, answer: `Cevap ${tag}`, rubric: [{ text: 'Doğru cevap', points: 2 }, { text: 'Gerekçe', points: 1 }], points: 0, topic: 'Fotosentez', difficulty: 'medium' as const, lines: 0 }
  if (type === 'mcq') return { ...base, options: [distinctWords(`opt${tag}`).split(' ')[0], 'Mitokondri', 'Ribozom', 'Çekirdek'], answerIndex: 0, rubric: [{ text: 'Doğru şık', points: 1 }] }
  if (type === 'true-false') {
    const answerBool = Number.parseInt(tag.replace(/\D/g, '') || '0', 10) % 2 === 0
    return { ...base, answerBool, answer: String(answerBool), rubric: [{ text: 'Doğru işaretleme', points: 1 }] }
  }
  if (type === 'matching') {
    return {
      ...base,
      pairs: ['Fotosentez', 'Solunum', 'Protein', 'Kalıtım'].map((right, index) => ({ left: distinctWords(`pair${tag}`).split(' ')[index], right })),
      rightOrder: [1, 2, 3, 0],
      rubric: [{ text: 'Eşleştirmeler', points: 1 }],
    }
  }
  if (type === 'open-ended') return { ...base, lines: 5 }
  if (type === 'short-answer') return { ...base, lines: 2 }
  return { ...base, stem: `${distinctWords(`${type}${tag}`)} için kullanılan terim ___ adını alır ${tag}.` }
}

interface MockExamApiOptions {
  /** HTTP status for every exam request (default 200). */
  status?: number
  /** Body for a failing status. */
  body?: string
  delayMs?: number
}

/** Mocks /api/generate for the exam modes; returns the recorded calls. Stems are unique per request so nothing dedupes. */
export async function mockExamApi(page: Page, options: MockExamApiOptions = {}): Promise<{ calls: () => ExamApiCall[] }> {
  const calls: ExamApiCall[] = []
  let serial = 0
  await page.route('**/api/generate', async (route) => {
    const payload = route.request().postDataJSON() as ExamApiCall
    calls.push(payload)
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    if (options.status && options.status !== 200) {
      await route.fulfill({ status: options.status, contentType: options.body ? 'text/plain' : 'application/json', body: options.body ?? '{"error":"upstream"}' })
      return
    }
    let body: unknown
    if (payload.mode === 'exam_section') {
      const type = payload.type as ExamQuestionType
      const facts = (payload.facts ?? []) as { fact: string }[]
      const questions = Array.from({ length: payload.count ?? 1 }, (_, index) => ({ ...fakeQuestion(type, `${(serial += 1)}`), ...(facts[index] ? { fact: facts[index].fact } : {}) }))
      body = { questions, provider: 'openai', fallbackUsed: false }
    } else if (payload.mode === 'exam_question') {
      body = { question: { ...fakeQuestion(payload.type as ExamQuestionType, `new${(serial += 1)}`), stem: `Yeniden üretilen soru ${serial}` }, provider: 'openai', fallbackUsed: false }
    } else if (payload.mode === 'exam_plan') {
      body = { facts: fakeFacts(Math.max(1, payload.count ?? 1)), provider: 'openai', fallbackUsed: false }
    } else if (payload.mode === 'exam_verify') {
      // The second reading of the answer keys agrees with every key, and no pair is about the same fact.
      body = { wrong: [], fixes: [], same: [], provider: 'openai', fallbackUsed: false }
    } else if (payload.mode === 'exam_rubric') {
      body = { rubric: [{ text: 'Birinci ölçüt', points: 2 }, { text: 'İkinci ölçüt', points: 1 }], provider: 'openai', fallbackUsed: false }
    } else {
      body = { error: 'not_supported' }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return { calls: () => calls.filter((call) => String(call.mode).startsWith('exam_')) }
}

/** Puts exams in the fake backend's store (before the page loads). */
export async function seedExams(page: Page, exams: WrittenExam[]): Promise<void> {
  await page.addInitScript((data) => {
    if (window.localStorage.getItem('quelio.exams.seeded') === '1') return
    window.localStorage.setItem('quelio.exams.v1', JSON.stringify(data))
    window.localStorage.setItem('quelio.exams.seeded', '1')
  }, exams)
}

export async function storedExams(page: Page): Promise<WrittenExam[]> {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem('quelio.exams.v1') ?? '[]') as WrittenExam[])
}
