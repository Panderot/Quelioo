import type { IncomingMessage, ServerResponse } from 'node:http'

import { callAnthropicMessages, extractJson, isRecord, readRequestBody, resolveModel } from './anthropic.js'

export type SolveErrorCode = 'not_math' | 'too_large' | 'bad_type' | 'upstream' | 'parse'

export interface SolveSuccess {
  topic: string
  question: string
  steps: string[]
  answer: string
  tip: string
  demo: boolean
}

export interface SolveError {
  error: SolveErrorCode
}

export type SolveResponseBody = SolveSuccess | SolveError

const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
// Base64 adds ~33% overhead on top of the raw image, plus JSON framing —
// cap the raw request stream well above MAX_IMAGE_BYTES so a valid image
// never gets truncated before the size check below can return a clean error.
const MAX_REQUEST_BYTES = 8 * 1024 * 1024
const SUPPORTED_LANGUAGES = new Set(['en', 'tr', 'hyw'])

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  tr: 'Turkish',
  hyw: 'Western Armenian (classical orthography)',
}

interface DemoContent {
  topic: string
  question: string
  steps: string[]
  answer: string
  tip: string
}

const DEMO_CONTENT: Record<string, DemoContent> = {
  en: {
    topic: 'Linear Equations',
    question: 'Solve for $x$: $2x + 3 = 11$',
    steps: [
      'Start with the equation $2x + 3 = 11$.',
      'Subtract 3 from both sides so the term with $x$ is alone: $2x = 11 - 3 = 8$.',
      'Divide both sides by 2 to isolate $x$: $x = \\dfrac{8}{2} = 4$.',
    ],
    answer: '$x = 4$',
    tip: 'Undo addition and subtraction before multiplication and division — work the order of operations backwards.',
  },
  tr: {
    topic: 'Doğrusal Denklemler',
    question: '$x$ için çöz: $2x + 3 = 11$',
    steps: [
      'Denklemle başla: $2x + 3 = 11$.',
      "$x$'li terimi yalnız bırakmak için her iki taraftan 3 çıkar: $2x = 11 - 3 = 8$.",
      "$x$'i yalnız bırakmak için her iki tarafı 2'ye böl: $x = \\dfrac{8}{2} = 4$.",
    ],
    answer: '$x = 4$',
    tip: 'Toplama ve çıkarmayı, çarpma ve bölmeden önce geri al — işlem sırasını tersten uygula.',
  },
  hyw: {
    topic: 'Գծային հաւասարումներ',
    question: 'Լուծէ $x$-ը՝ $2x + 3 = 11$',
    steps: [
      'Սկսէ հաւասարումէն՝ $2x + 3 = 11$.',
      'Երկու կողմերէն հանէ 3՝ որպէսզի $x$ ունեցող անդամը մինակ մնայ. $2x = 11 - 3 = 8$.',
      'Երկու կողմերը բաժնէ 2-ի՝ $x$-ը մեկուսացնելու համար. $x = \\dfrac{8}{2} = 4$.',
    ],
    answer: '$x = 4$',
    tip: 'Միշտ նախ չեղարկէ գումարումն ու հանումը, ապա՝ բազմապատկումն ու բաժանումը՝ գործողութիւններու կարգը հակառակ ուղղութեամբ կիրարկելով։',
  },
}

function demoResult(language: string): SolveSuccess {
  const content = DEMO_CONTENT[language] ?? DEMO_CONTENT.en
  return { ...content, demo: true }
}

function isSolveSuccessShape(value: unknown): value is Omit<SolveSuccess, 'demo'> {
  if (!isRecord(value)) return false
  return (
    typeof value.topic === 'string' &&
    typeof value.question === 'string' &&
    Array.isArray(value.steps) &&
    value.steps.length > 0 &&
    value.steps.every((step) => typeof step === 'string') &&
    typeof value.answer === 'string' &&
    typeof value.tip === 'string'
  )
}

function isNotMathShape(value: unknown): boolean {
  return isRecord(value) && value.error === 'not_math'
}

async function callAnthropic(params: {
  apiKey: string
  model: string
  mimeType: string
  base64Data: string
  language: string
}): Promise<SolveResponseBody> {
  const languageName = LANGUAGE_NAMES[params.language] ?? LANGUAGE_NAMES.en
  const systemPrompt = [
    'You are a patient math teacher. Read the math question in the photo and solve it step by step,',
    'explaining at each step what is done and why, like a teacher walking a student through it.',
    `Respond only in ${languageName}.`,
    'Write all math notation in LaTeX: $...$ for inline math and $$...$$ for block math.',
    'Respond with ONLY a single JSON object and nothing else — no markdown code fences, no commentary —',
    'matching exactly this shape: {"topic": string, "question": string, "steps": string[], "answer": string, "tip": string}.',
    'If the photo does not contain a readable math question, respond with exactly {"error": "not_math"}.',
  ].join(' ')

  const text = await callAnthropicMessages({
    apiKey: params.apiKey,
    model: params.model,
    maxTokens: 1200,
    system: systemPrompt,
    content: [
      { type: 'image', source: { type: 'base64', media_type: params.mimeType, data: params.base64Data } },
      { type: 'text', text: 'Solve the math question in this photo.' },
    ],
  })
  if (text === null) return { error: 'upstream' }

  const parsed = extractJson(text)
  if (parsed === null) return { error: 'parse' }

  if (isNotMathShape(parsed)) return { error: 'not_math' }
  if (!isSolveSuccessShape(parsed)) return { error: 'parse' }

  return { ...parsed, demo: false }
}

export async function solveRequestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const respond = (status: number, body: SolveResponseBody) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }

  if (req.method !== 'POST') {
    respond(405, { error: 'bad_type' })
    return
  }

  let rawBody: string
  try {
    rawBody = await readRequestBody(req, MAX_REQUEST_BYTES)
  } catch {
    respond(400, { error: 'too_large' })
    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    respond(400, { error: 'bad_type' })
    return
  }

  if (!isRecord(payload)) {
    respond(400, { error: 'bad_type' })
    return
  }

  const { imageBase64, mimeType, language } = payload

  if (typeof mimeType !== 'string' || !ACCEPTED_MIME_TYPES.has(mimeType)) {
    respond(400, { error: 'bad_type' })
    return
  }

  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    respond(400, { error: 'bad_type' })
    return
  }

  const base64Data = imageBase64.includes(',') ? imageBase64.slice(imageBase64.indexOf(',') + 1) : imageBase64
  const byteLength = Math.floor((base64Data.length * 3) / 4)
  if (byteLength > MAX_IMAGE_BYTES) {
    respond(400, { error: 'too_large' })
    return
  }

  const resolvedLanguage = typeof language === 'string' && SUPPORTED_LANGUAGES.has(language) ? language : 'en'

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    respond(200, demoResult(resolvedLanguage))
    return
  }

  const model = resolveModel()

  let result: SolveResponseBody
  try {
    result = await callAnthropic({ apiKey, model, mimeType, base64Data, language: resolvedLanguage })
  } catch (error) {
    console.error('solve: upstream call failed', error instanceof Error ? error.message : 'unknown error')
    result = { error: 'upstream' }
  }

  if ('error' in result) {
    const status = result.error === 'not_math' ? 422 : result.error === 'upstream' || result.error === 'parse' ? 502 : 400
    respond(status, result)
    return
  }

  respond(200, result)
}
