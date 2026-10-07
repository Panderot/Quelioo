import { answerSummary, isGeneratedQuiz, isQuizQuestion } from '../lib/quiz'
import type { GeneratedQuiz, QuizQuestion, QuizQuestionType } from '../lib/quiz'
import { deepMathToPlain } from '../lib/mathPlain'
import { parseQuizCoverage } from '../lib/factCoverage'
import type { CoverageFact, FactEntry } from '../lib/factCoverage'
import { apiFetch } from '../lib/auth/apiFetch'

export type GenerateErrorCode =
  | 'too_short'
  | 'too_long'
  | 'too_long_chars'
  | 'not_supported'
  | 'upstream'
  | 'parse'
  | 'model'
  | 'network'
  | 'not_configured'

/** Another question of the quiz, sent as DATA (with its facts, so a new question on a different fact
 * may share a word with its answer). */
export interface OtherQuestion {
  question: string
  answer: string
  type: QuizQuestionType
  factIds?: number[]
  factItems?: Record<string, number[]>
  /** Lets the server return a reworded version of this question (never one the student edited). */
  id?: string
  edited?: boolean
}

export function otherQuestionOf(question: QuizQuestion): OtherQuestion {
  return {
    question: question.question,
    answer: answerSummary(question),
    type: question.type,
    ...(question.factIds ? { factIds: question.factIds } : {}),
    ...(question.factItems ? { factItems: question.factItems } : {}),
    id: question.id,
    ...(question.edited ? { edited: true } : {}),
  }
}

export interface GenerateQuizPayload {
  text: string
  questionType: string
  /** A number, or "auto" (every fact of the source, up to the maximum count). */
  questionCount: string
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  avoidQuestions?: string[]
  title?: string
  includeExplanations?: boolean
  shuffleOptions?: boolean
  includeHints?: boolean
  focusSnippets?: string[]
  /** Cached facts plan of the same source (Archive) — the server skips the extraction. */
  plan?: CoverageFact[]
  /** Only these facts of `plan` (a second quiz for the facts the first one had no room for). */
  onlyFactIds?: number[]
}

export interface GenerateQuizResult extends GeneratedQuiz {
  requestedCount: number
  incomplete: boolean
  /** Set when the source supports fewer good questions than requested (the quiz is not padded). */
  supportedCount?: number
  /** Informational only — the UI never shows this. */
  provider?: 'anthropic' | 'openai'
  fallbackUsed?: boolean
}

export interface RegenerateOnePayload {
  text: string
  questionType: QuizQuestionType
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  avoidQuestions: string[]
  /** The rest of the quiz (question + short answer) so the new question never leaks or repeats. */
  otherQuestions?: OtherQuestion[]
  includeExplanations?: boolean
  includeHints?: boolean
  focusSnippets?: string[]
  /** The facts the question tests (kept by the new one and verified again), with their plan entries. */
  factIds?: number[]
  factItems?: Record<string, number[]>
  plan?: CoverageFact[]
}

export interface RegenerateOneResult {
  question: QuizQuestion
  /** Informational only — the UI never shows this. */
  provider?: 'anthropic' | 'openai'
  fallbackUsed?: boolean
}

export interface TopUpPayload {
  text: string
  questionType: string
  questionCount: string
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  avoidQuestions: string[]
  includeExplanations?: boolean
  includeHints?: boolean
  focusSnippets?: string[]
}

export interface CoverMissingPayload {
  text: string
  questionType: string
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  avoidQuestions: string[]
  otherQuestions: OtherQuestion[]
  existingCount: number
  plan: CoverageFact[]
  missing: { id: number; items?: number[] }[]
  includeExplanations?: boolean
  includeHints?: boolean
  focusSnippets?: string[]
}

export function missingPayloadEntries(entries: FactEntry[]): { id: number; items?: number[] }[] {
  return entries.map((entry) => (entry.items ? { id: entry.fact.id, items: entry.items } : { id: entry.fact.id }))
}

export interface TopUpResult {
  questions: QuizQuestion[]
  provider?: 'anthropic' | 'openai'
  fallbackUsed?: boolean
}

export class GenerateApiError extends Error {
  code: GenerateErrorCode

  constructor(code: GenerateErrorCode) {
    super(code)
    this.code = code
  }
}

const ERROR_CODES: ReadonlySet<string> = new Set([
  'too_short',
  'too_long',
  'too_long_chars',
  'not_supported',
  'upstream',
  'parse',
  'model',
  'not_configured',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isErrorCode(value: unknown): value is GenerateErrorCode {
  return typeof value === 'string' && ERROR_CODES.has(value)
}

async function postGenerate(body: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await apiFetch('/api/generate', {
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

function isResponseProvider(value: unknown): value is 'anthropic' | 'openai' {
  return value === 'anthropic' || value === 'openai'
}

export async function generateQuiz(payload: GenerateQuizPayload, signal?: AbortSignal): Promise<GenerateQuizResult> {
  const json = await postGenerate({ mode: 'generate', ...payload }, signal)
  if (!isRecord(json) || !isGeneratedQuiz(json)) {
    throw new GenerateApiError('parse')
  }
  const coverage = parseQuizCoverage(json.coverage)
  return {
    title: json.title,
    questions: deepMathToPlain(json.questions),
    ...(coverage ? { coverage } : {}),
    requestedCount: typeof json.requestedCount === 'number' ? json.requestedCount : json.questions.length,
    incomplete: typeof json.incomplete === 'boolean' ? json.incomplete : false,
    supportedCount: typeof json.supportedCount === 'number' ? json.supportedCount : undefined,
    provider: isResponseProvider(json.provider) ? json.provider : undefined,
    fallbackUsed: typeof json.fallbackUsed === 'boolean' ? json.fallbackUsed : undefined,
  }
}

export async function regenerateOneQuestion(payload: RegenerateOnePayload): Promise<RegenerateOneResult> {
  const json = await postGenerate({ mode: 'regenerate_one', ...payload })
  if (!isRecord(json) || !isQuizQuestion(json.question)) {
    throw new GenerateApiError('parse')
  }
  return {
    question: json.question,
    provider: isResponseProvider(json.provider) ? json.provider : undefined,
    fallbackUsed: typeof json.fallbackUsed === 'boolean' ? json.fallbackUsed : undefined,
  }
}

export async function topUpQuestions(payload: TopUpPayload): Promise<TopUpResult> {
  const json = await postGenerate({ mode: 'top_up', ...payload })
  if (!isRecord(json) || !Array.isArray(json.questions) || !json.questions.every(isQuizQuestion)) {
    throw new GenerateApiError('parse')
  }
  return {
    questions: deepMathToPlain(json.questions),
    provider: isResponseProvider(json.provider) ? json.provider : undefined,
    fallbackUsed: typeof json.fallbackUsed === 'boolean' ? json.fallbackUsed : undefined,
  }
}

/** Questions for the facts (and list items) the quiz does not cover yet; `replaced` are existing
 * questions reworded (same fact and answer) so that a new answer is not written in them. */
export async function coverMissingFacts(payload: CoverMissingPayload): Promise<TopUpResult & { replaced: QuizQuestion[] }> {
  const json = await postGenerate({ mode: 'cover_missing', ...payload })
  if (!isRecord(json) || !Array.isArray(json.questions) || !json.questions.every(isQuizQuestion)) {
    throw new GenerateApiError('parse')
  }
  return {
    replaced: Array.isArray(json.replaced) ? json.replaced.filter(isQuizQuestion) : [],
    questions: deepMathToPlain(json.questions),
    provider: isResponseProvider(json.provider) ? json.provider : undefined,
    fallbackUsed: typeof json.fallbackUsed === 'boolean' ? json.fallbackUsed : undefined,
  }
}
