import { apiFetch } from '../lib/auth/apiFetch'
import { EXAM_QUESTION_TYPES } from '../lib/exam/types'
import type { BloomLevel, ExamDifficulty, ExamLevel, ExamPair, ExamQuestion, ExamQuestionType, ExamRubricItem } from '../lib/exam/types'

export type ExamApiErrorCode =
  | 'too_short'
  | 'too_long'
  | 'not_supported'
  | 'upstream'
  | 'parse'
  | 'model'
  | 'network'
  | 'not_configured'
  | 'rate_limited'
  | 'unauthorized'
  /** The exam still broke a quality rule after the targeted rewrites; nothing is saved. */
  | 'quality'

const KNOWN_CODES: ReadonlySet<string> = new Set(['too_short', 'too_long', 'not_supported', 'upstream', 'parse', 'model', 'not_configured', 'rate_limited', 'unauthorized'])

export class ExamApiError extends Error {
  code: ExamApiErrorCode
  /** For `quality`: the rules still broken (diagnostics only, never shown to the user). */
  rules: string[]

  constructor(code: ExamApiErrorCode, rules: string[] = []) {
    super(code)
    this.code = code
    this.rules = rules
  }
}

interface ExamRequestBase {
  text: string
  type: ExamQuestionType
  level: ExamLevel
  outputLanguage: string
  contextBased: boolean
  optionsCount: 4 | 5
  topics: string[]
  /** Stems already on the exam (sent as data so nothing repeats). */
  avoidStems: string[]
  /** Correct answers already on the exam (sent as data); no new question may have one of them. */
  avoidAnswers?: string[]
  /** Subject words the exam already leans on; no new question may be built around them. */
  avoidTerms?: string[]
  /** True-false only: every new statement must have this answer. */
  trueFalseAnswer?: boolean
  /** True-false only: the answer of the statement on fact k (one per assigned fact). */
  trueFalseAnswers?: boolean[]
  /** The course the teacher typed ("Biyoloji"); decides the subject rules. */
  course?: string
  /** Everyday settings for the scenarios of this request. */
  variety?: string[]
  /** Facts already on the exam (a replacement question): the new question tests another fact. */
  avoidFacts?: string[]
  /** Cognitive level and difficulty the question must have (a replacement question). */
  slots?: { bloom: BloomLevel; difficulty: ExamDifficulty }[]
}

/** One statement of the source that a question tests. */
export interface ExamSectionFact {
  fact: string
  topic: string
  concept?: string
  /** Related facts of the same topic that a level 4-6 question may combine with this one. */
  related?: string[]
}

export interface ExamSectionRequest extends ExamRequestBase {
  /** 1 to 8 questions; larger sections are split into several requests. */
  count: number
  /** Difficulty counts for this request; they add up to `count`. */
  difficulty: Record<ExamDifficulty, number>
  /** This request draws mainly from part `partIndex` (0-based) of `partCount` of the source. */
  partIndex: number
  partCount: number
  /** The facts assigned to the questions of this request, in order (question k tests fact k). */
  facts?: ExamSectionFact[]
}

export interface ExamQuestionRequest extends ExamRequestBase {
  difficulty: ExamDifficulty
  /** The stem being replaced; the new question must not repeat it. */
  replaceStem?: string
}

export interface ExamRubricRequest {
  stem: string
  answer: string
  type: ExamQuestionType
  outputLanguage: string
  level: ExamLevel
}

/** A generated question has points 0 and the relative rubric weights in rubric[].points (the caller scales them to real points). */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normaliseRubric(value: unknown): ExamRubricItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((item) => ({ text: text(item.text).trim(), points: typeof item.points === 'number' && item.points > 0 ? Math.round(item.points) : 1 }))
    .filter((item) => item.text)
}

function normaliseQuestion(value: unknown): ExamQuestion | null {
  if (!isRecord(value)) return null
  const type = value.type
  if (typeof type !== 'string' || !EXAM_QUESTION_TYPES.includes(type as ExamQuestionType)) return null
  const stem = text(value.stem).trim()
  const id = text(value.id)
  if (!stem || !id) return null
  const difficulty: ExamDifficulty = value.difficulty === 'easy' || value.difficulty === 'hard' ? value.difficulty : 'medium'
  const rubric = normaliseRubric(value.rubric)
  const question: ExamQuestion = {
    id,
    type: type as ExamQuestionType,
    stem,
    answer: text(value.answer),
    rubric,
    points: typeof value.points === 'number' ? value.points : 0,
    topic: text(value.topic),
    difficulty,
    lines: typeof value.lines === 'number' && value.lines >= 0 ? Math.min(12, Math.round(value.lines)) : 0,
  }
  const fact = text(value.fact).trim()
  if (fact) question.fact = fact
  const concept = text(value.concept).trim()
  if (concept) question.concept = concept
  const bloom = typeof value.bloomLevel === 'number' ? Math.round(value.bloomLevel) : 0
  if (bloom >= 1 && bloom <= 6) question.bloomLevel = bloom as BloomLevel
  const context = text(value.context).trim()
  if (context) question.context = context
  if (question.type === 'mcq') {
    const options = Array.isArray(value.options) ? value.options.filter((option): option is string => typeof option === 'string') : []
    if (options.length < 2 || typeof value.answerIndex !== 'number' || !Number.isInteger(value.answerIndex) || value.answerIndex < 0 || value.answerIndex >= options.length) return null
    question.options = options
    question.answerIndex = value.answerIndex
  } else if (question.type === 'true-false') {
    if (typeof value.answerBool !== 'boolean') return null
    question.answerBool = value.answerBool
  } else if (question.type === 'matching') {
    const pairs: ExamPair[] = Array.isArray(value.pairs)
      ? value.pairs.filter(isRecord).map((pair) => ({ left: text(pair.left), right: text(pair.right) }))
      : []
    if (pairs.length < 2 || pairs.some((pair) => !pair.left || !pair.right)) return null
    question.pairs = pairs
    const extras = Array.isArray(value.extras) ? value.extras.filter((extra): extra is string => typeof extra === 'string' && extra.trim().length > 0) : []
    if (extras.length > 0) question.extras = extras
    const size = pairs.length + extras.length
    const order = value.rightOrder
    if (Array.isArray(order) && order.length === size && order.every((entry) => Number.isInteger(entry) && entry >= 0 && entry < size)) question.rightOrder = order as number[]
  }
  if (Array.isArray(value.acceptableAnswers)) {
    const acceptable = value.acceptableAnswers.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    if (acceptable.length > 0) question.acceptableAnswers = acceptable
  }
  if (question.rubric.length === 0) question.rubric = [{ text: question.answer || stem, points: 1 }]
  return question
}

async function post(payload: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await apiFetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ExamApiError('network')
  }
  if (response.status === 401) throw new ExamApiError('unauthorized')
  if (response.status === 429) throw new ExamApiError('rate_limited')
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ExamApiError(response.ok ? 'parse' : 'upstream')
  }
  if (!isRecord(body)) throw new ExamApiError('parse')
  if ('error' in body) {
    const code = typeof body.error === 'string' && KNOWN_CODES.has(body.error) ? (body.error as ExamApiErrorCode) : 'upstream'
    throw new ExamApiError(code)
  }
  if (!response.ok) throw new ExamApiError('upstream')
  return body
}

export async function generateExamSection(request: ExamSectionRequest, signal?: AbortSignal): Promise<ExamQuestion[]> {
  const body = await post({ mode: 'exam_section', ...request }, signal)
  const questions = Array.isArray(body.questions) ? body.questions.map(normaliseQuestion).filter((question): question is ExamQuestion => question !== null) : []
  if (questions.length === 0) throw new ExamApiError('parse')
  return questions
}

export async function regenerateExamQuestion(request: ExamQuestionRequest, signal?: AbortSignal): Promise<ExamQuestion> {
  const body = await post({ mode: 'exam_question', ...request }, signal)
  const question = normaliseQuestion(body.question)
  if (!question) throw new ExamApiError('parse')
  return question
}

export async function generateExamRubric(request: ExamRubricRequest, signal?: AbortSignal): Promise<ExamRubricItem[]> {
  const body = await post({ mode: 'exam_rubric', ...request }, signal)
  const rubric = normaliseRubric(body.rubric)
  if (rubric.length === 0) throw new ExamApiError('parse')
  return rubric
}

export interface ExamVerifyRequest {
  text: string
  /** The questions the judge reads (at most 12 per request): multiple-choice and true-false keys are checked, every question is classified. */
  questions: ExamQuestion[]
  /** Pairs of questions the judge says are about the same fact or not (at most 10 per request). */
  pairs?: { id: string; a: string; b: string }[]
  /** Only ask whether the scenario or the stem gives the correct option away: the correct option is shown to the judge, no key is checked. */
  copyOnly?: boolean
}

export interface ExamKeyFix {
  id: string
  answerBool?: boolean
  answerIndex?: number
}

/** The judge's blind reading of one question. */
export interface ExamReview {
  id: string
  /** The answer can be copied from the stem or the scenario. */
  copy: boolean
  level: BloomLevel
  difficulty: ExamDifficulty
  /** The judge's own result of a calculation. */
  solved?: string
}

export interface ExamVerifyResult {
  /** Questions whose key a second, blind reading of the source contradicts. */
  wrong: string[]
  /** What that second reading says the key is. */
  fixes: ExamKeyFix[]
  /** Pair ids the judge says test the same fact. */
  same: string[]
  reviews: ExamReview[]
}

const NUMERIC_ANSWER = /^[-−+]?[0-9]/

function correctOptionText(question: ExamQuestion): string {
  return question.type === 'mcq' && question.options && question.answerIndex !== undefined ? (question.options[question.answerIndex] ?? question.answer) : question.answer
}

/** The request body of the judge: keys of true-false / multiple choice, repeats, and a blind reading of every question. */
export function examVerifyPayload(request: ExamVerifyRequest): Record<string, unknown> {
  const items = request.questions.map((question) => {
    const written = question.type === 'open-ended' || question.type === 'short-answer' || question.type === 'fill-blanks'
    return {
      id: question.id,
      type: question.type,
      stem: question.stem,
      ...(question.context ? { context: question.context } : {}),
      ...(question.options ? { options: question.options, ...(request.copyOnly ? {} : { answerIndex: question.answerIndex }) } : {}),
      ...(question.answerBool === undefined ? {} : { answerBool: question.answerBool }),
      ...(written || request.copyOnly ? { expected: (request.copyOnly ? correctOptionText(question) : question.answer).slice(0, 400) } : {}),
      // A calculation: the judge works it out blind and the result is compared with the key.
      ...((question.type === 'short-answer' || question.type === 'fill-blanks') && NUMERIC_ANSWER.test(question.answer.trim()) ? { solve: true } : {}),
    }
  })
  return { mode: 'exam_verify', text: request.text, items, pairs: request.pairs ?? [] }
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

export async function verifyExamKeys(request: ExamVerifyRequest, signal?: AbortSignal): Promise<ExamVerifyResult> {
  return parseVerifyResult(await post(examVerifyPayload(request), signal))
}

/** The body of a verify reply as a result (shared with the accuracy script, which calls the server code directly). */
export function parseVerifyResult(body: Record<string, unknown>): ExamVerifyResult {
  const fixes: ExamKeyFix[] = []
  if (Array.isArray(body.fixes)) {
    for (const entry of body.fixes) {
      if (!isRecord(entry) || typeof entry.id !== 'string') continue
      fixes.push({
        id: entry.id,
        ...(typeof entry.answerBool === 'boolean' ? { answerBool: entry.answerBool } : {}),
        ...(typeof entry.answerIndex === 'number' ? { answerIndex: entry.answerIndex } : {}),
      })
    }
  }
  const reviews: ExamReview[] = []
  if (Array.isArray(body.reviews)) {
    for (const entry of body.reviews) {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.level !== 'number') continue
      const level = Math.min(6, Math.max(1, Math.round(entry.level))) as BloomLevel
      const difficulty: ExamDifficulty = entry.difficulty === 'easy' || entry.difficulty === 'hard' ? entry.difficulty : 'medium'
      reviews.push({ id: entry.id, copy: entry.copy === true, level, difficulty, ...(typeof entry.solved === 'string' && entry.solved ? { solved: entry.solved } : {}) })
    }
  }
  return { wrong: ids(body.wrong), fixes, same: ids(body.same), reviews }
}

export interface ExamFact {
  fact: string
  topic: string
  /** The skill or rule the fact belongs to (applications of one formula share it). */
  concept?: string
  /** Related facts of the same topic that a level 4-6 question may combine with this one. */
  related?: string[]
}

export interface ExamPlanRequest {
  text: string
  level: ExamLevel
  outputLanguage: string
  topics: string[]
  /** How many distinct facts to look for. */
  count: number
  /** The teacher's own rows: every fact's topic is copied exactly from `topics`. */
  strictTopics?: boolean
}

/** The distinct, testable facts of the source (fewer than asked when the source holds fewer). */
export async function planExamFacts(request: ExamPlanRequest, signal?: AbortSignal): Promise<ExamFact[]> {
  const body = await post({ mode: 'exam_plan', text: request.text, level: request.level, outputLanguage: request.outputLanguage, topics: request.topics, count: request.count, ...(request.strictTopics ? { strictTopics: true } : {}) }, signal)
  const facts = Array.isArray(body.facts)
    ? body.facts.filter(isRecord).map((entry) => ({ fact: text(entry.fact).trim(), topic: text(entry.topic).trim(), ...(text(entry.concept).trim() ? { concept: text(entry.concept).trim() } : {}) })).filter((entry) => entry.fact)
    : []
  if (facts.length === 0) throw new ExamApiError('parse')
  return facts
}
