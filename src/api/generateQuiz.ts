import { isGeneratedQuiz, isQuizQuestion } from '../lib/quiz'
import type { GeneratedQuiz, QuizQuestion, QuizQuestionType } from '../lib/quiz'

export type GenerateErrorCode = 'too_short' | 'too_long' | 'not_supported' | 'upstream' | 'parse' | 'network'

export interface GenerateQuizPayload {
  text: string
  questionType: string
  questionCount: string
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  uiLanguage: string
}

export interface GenerateQuizResult extends GeneratedQuiz {
  demo: boolean
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
}

export class GenerateApiError extends Error {
  code: GenerateErrorCode

  constructor(code: GenerateErrorCode) {
    super(code)
    this.code = code
  }
}

const ERROR_CODES: ReadonlySet<string> = new Set(['too_short', 'too_long', 'not_supported', 'upstream', 'parse'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isErrorCode(value: unknown): value is GenerateErrorCode {
  return typeof value === 'string' && ERROR_CODES.has(value)
}

async function postGenerate(body: unknown): Promise<unknown> {
  let response: Response
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
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

export async function generateQuiz(payload: GenerateQuizPayload): Promise<GenerateQuizResult> {
  const json = await postGenerate({ mode: 'generate', ...payload })
  if (!isRecord(json) || typeof json.demo !== 'boolean' || !isGeneratedQuiz(json)) {
    throw new GenerateApiError('parse')
  }
  return { title: json.title, questions: json.questions, demo: json.demo }
}

export async function regenerateOneQuestion(payload: RegenerateOnePayload): Promise<RegenerateOneResult> {
  const json = await postGenerate({ mode: 'regenerate_one', ...payload })
  if (!isRecord(json) || typeof json.demo !== 'boolean' || !isQuizQuestion(json.question)) {
    throw new GenerateApiError('parse')
  }
  return { question: json.question, demo: json.demo }
}
