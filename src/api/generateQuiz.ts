import { isGeneratedQuiz, isQuizQuestion } from '../lib/quiz'
import type { GeneratedQuiz, QuizQuestion, QuizQuestionType } from '../lib/quiz'

export type GenerateErrorCode = 'too_short' | 'too_long' | 'too_long_chars' | 'not_supported' | 'upstream' | 'parse' | 'model' | 'network'

export interface GenerateQuizPayload {
  text: string
  questionType: string
  questionCount: string
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  uiLanguage: string
  avoidQuestions?: string[]
}

export interface GenerateQuizResult extends GeneratedQuiz {
  demo: boolean
  requestedCount: number
  incomplete: boolean
  /** Informational only — the UI never shows this. */
  provider?: 'anthropic' | 'openai' | 'demo'
  fallbackUsed?: boolean
}

export interface RegenerateOnePayload {
  text: string
  questionType: QuizQuestionType
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  uiLanguage: string
  avoidQuestions: string[]
}

export interface RegenerateOneResult {
  question: QuizQuestion
  demo: boolean
  /** Informational only — the UI never shows this. */
  provider?: 'anthropic' | 'openai' | 'demo'
  fallbackUsed?: boolean
}

export interface TopUpPayload {
  text: string
  questionType: string
  questionCount: string
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  uiLanguage: string
  avoidQuestions: string[]
}

export interface TopUpResult {
  questions: QuizQuestion[]
  demo: boolean
  provider?: 'anthropic' | 'openai' | 'demo'
  fallbackUsed?: boolean
}

export class GenerateApiError extends Error {
  code: GenerateErrorCode

  constructor(code: GenerateErrorCode) {
    super(code)
    this.code = code
  }
}

const ERROR_CODES: ReadonlySet<string> = new Set(['too_short', 'too_long', 'too_long_chars', 'not_supported', 'upstream', 'parse', 'model'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isErrorCode(value: unknown): value is GenerateErrorCode {
  return typeof value === 'string' && ERROR_CODES.has(value)
}

async function postGenerate(body: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new GenerateApiError('network')
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new GenerateApiError('parse')
  }

  if (isRecord(json) && 'error' in json) {
    const code = json.error
    throw new GenerateApiError(isErrorCode(code) ? code : 'upstream')
  }

  return json
}

function isResponseProvider(value: unknown): value is 'anthropic' | 'openai' | 'demo' {
  return value === 'anthropic' || value === 'openai' || value === 'demo'
}

export async function generateQuiz(payload: GenerateQuizPayload, signal?: AbortSignal): Promise<GenerateQuizResult> {
  const json = await postGenerate({ mode: 'generate', ...payload }, signal)
  if (!isRecord(json) || typeof json.demo !== 'boolean' || !isGeneratedQuiz(json)) {
    throw new GenerateApiError('parse')
  }
  return {
    title: json.title,
    questions: json.questions,
    demo: json.demo,
    requestedCount: typeof json.requestedCount === 'number' ? json.requestedCount : json.questions.length,
    incomplete: typeof json.incomplete === 'boolean' ? json.incomplete : false,
    provider: isResponseProvider(json.provider) ? json.provider : undefined,
    fallbackUsed: typeof json.fallbackUsed === 'boolean' ? json.fallbackUsed : undefined,
  }
}

export async function regenerateOneQuestion(payload: RegenerateOnePayload): Promise<RegenerateOneResult> {
  const json = await postGenerate({ mode: 'regenerate_one', ...payload })
  if (!isRecord(json) || typeof json.demo !== 'boolean' || !isQuizQuestion(json.question)) {
    throw new GenerateApiError('parse')
  }
  return {
    question: json.question,
    demo: json.demo,
    provider: isResponseProvider(json.provider) ? json.provider : undefined,
    fallbackUsed: typeof json.fallbackUsed === 'boolean' ? json.fallbackUsed : undefined,
  }
}

export async function topUpQuestions(payload: TopUpPayload): Promise<TopUpResult> {
  const json = await postGenerate({ mode: 'top_up', ...payload })
  if (!isRecord(json) || typeof json.demo !== 'boolean' || !Array.isArray(json.questions) || !json.questions.every(isQuizQuestion)) {
    throw new GenerateApiError('parse')
  }
  return {
    questions: json.questions,
    demo: json.demo,
    provider: isResponseProvider(json.provider) ? json.provider : undefined,
    fallbackUsed: typeof json.fallbackUsed === 'boolean' ? json.fallbackUsed : undefined,
  }
}
