import { checkMatchingAnswer, getRightOrder, letterFor } from './matching'
import { isFillBlankMatch, isLenientMatch, usesTurkishRules } from './answerCheck'
import { getAcceptableAnswers, getKeyPoints } from './quiz'
import type { QuizQuestion } from './quiz'
import { gradeAnswer } from '../api/gradeAnswer'

/** Study mode: the saved quiz is practised one question at a time. Everything here is pure data and
 * logic (no React, no network except the existing AI grader for short/open answers); the record of
 * past sessions lives in `quizzes.results` of the account. */

export type StudyKind = 'normal' | 'exam' | 'quick'
export type TimerMode = 'off' | 'total' | 'question'
export type Confidence = 'sure' | 'guess'

export interface TimerSetting {
  mode: TimerMode
  /** Whole quiz, in seconds (mode "total"). */
  totalSeconds: number
  /** Each question, in seconds (mode "question"). */
  questionSeconds: number
}

/** What the student has typed/picked for one question. mcq: option index, true-false: boolean,
 * fill/short/open: text, matching: one letter per left row ('' = not chosen). */
export type AnswerValue = number | boolean | string | string[] | null

export interface QuestionRecord {
  /** Checks made so far (normal mode). */
  attempts: number
  /** Right on the first check (in exam: right at all). This is what the score counts. */
  firstTry: boolean
  /** Ended right, on any try. */
  correct: boolean
  /** The answer was shown after two wrong checks (or a time-out). */
  revealed: boolean
  confidence?: Confidence
  flagged: boolean
  /** Active time spent on this question. */
  ms: number
  hints: number
  done: boolean
  timedOut?: boolean
  /** Exam: the answer given, graded when the session ends. */
  answer?: AnswerValue
}

export interface StudySession {
  id: string
  at: string
  kind: StudyKind
  /** "full": every question of the quiz; "subset": a wrong-only / flagged / quick round. Only full
   * sessions feed the chart, the best score and the Archive card. */
  scope: 'full' | 'subset'
  total: number
  /** Right on the first try (guessed answers included). */
  firstTry: number
  /** Right only on the second try. */
  secondTry: number
  ms: number
  wrongIds: string[]
  guessIds: string[]
  flaggedIds: string[]
  slowestId?: string
  timedOut?: boolean
}

export interface StudyResume {
  kind: StudyKind
  scope: 'full' | 'subset'
  qids: string[]
  index: number
  records: Record<string, QuestionRecord>
  elapsedMs: number
  timer: TimerSetting
  streak: number
  /** Wall-clock anchors (epoch ms): countdowns are computed from these, so they survive a reload and keep running while the page is closed. */
  totalStartAt?: number
  questionStartAt?: number
}

export interface StudyResults {
  v: 1
  sessions: StudySession[]
  /** Questions to repeat in "Hızlı tekrar": wrong, guessed or flagged the last time they were studied. */
  pool: string[]
  resume?: StudyResume
}

export const MAX_STORED_SESSIONS = 30
export const DEFAULT_EXAM_SECONDS_PER_QUESTION = 60
export const DEFAULT_QUESTION_SECONDS = 60

export const EMPTY_RESULTS: StudyResults = { v: 1, sessions: [], pool: [] }

export function defaultTimer(kind: StudyKind, questionCount: number): TimerSetting {
  return {
    mode: kind === 'exam' ? 'total' : 'off',
    totalSeconds: Math.max(60, questionCount * DEFAULT_EXAM_SECONDS_PER_QUESTION),
    questionSeconds: DEFAULT_QUESTION_SECONDS,
  }
}

export function newRecord(): QuestionRecord {
  return { attempts: 0, firstTry: false, correct: false, revealed: false, flagged: false, ms: 0, hints: 0, done: false }
}

const isRecordObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads whatever the account holds in `quizzes.results` defensively: a malformed value is an empty history. */
export function parseStudyResults(raw: unknown): StudyResults {
  if (!isRecordObject(raw) || raw.v !== 1) return EMPTY_RESULTS
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.filter(
        (session): session is StudySession =>
          isRecordObject(session) && typeof session.id === 'string' && typeof session.at === 'string' && typeof session.total === 'number' && typeof session.firstTry === 'number',
      )
    : []
  const pool = Array.isArray(raw.pool) ? raw.pool.filter((id): id is string => typeof id === 'string') : []
  const resume = isRecordObject(raw.resume) && Array.isArray(raw.resume.qids) && isRecordObject(raw.resume.records) ? (raw.resume as unknown as StudyResume) : undefined
  return { v: 1, sessions: sessions.slice(-MAX_STORED_SESSIONS), pool, ...(resume ? { resume } : {}) }
}

export function fullSessions(results: StudyResults): StudySession[] {
  return results.sessions.filter((session) => session.scope === 'full')
}

export function lastFullSession(results: StudyResults): StudySession | undefined {
  const sessions = fullSessions(results)
  return sessions[sessions.length - 1]
}

export function bestScore(results: StudyResults): StudySession | undefined {
  return fullSessions(results).reduce<StudySession | undefined>((best, session) => (!best || session.firstTry / session.total > best.firstTry / best.total ? session : best), undefined)
}

/** The questions of "Hızlı tekrar": the pool, in quiz order, limited to questions that still exist. */
export function quickPoolIds(results: StudyResults, questions: QuizQuestion[]): string[] {
  const pool = new Set(results.pool)
  return questions.filter((question) => pool.has(question.id)).map((question) => question.id)
}

/** A finished session: the score counts first-try answers (a guessed right answer still counts). */
export function buildSession(args: {
  id: string
  at: string
  kind: StudyKind
  scope: 'full' | 'subset'
  qids: string[]
  records: Record<string, QuestionRecord>
  ms: number
  timedOut?: boolean
}): StudySession {
  const { qids, records } = args
  const get = (id: string) => records[id] ?? newRecord()
  const wrongIds = qids.filter((id) => !get(id).firstTry)
  let slowestId: string | undefined
  let slowest = 0
  for (const id of qids) {
    if (get(id).ms > slowest) {
      slowest = get(id).ms
      slowestId = id
    }
  }
  return {
    id: args.id,
    at: args.at,
    kind: args.kind,
    scope: args.scope,
    total: qids.length,
    firstTry: qids.filter((id) => get(id).firstTry).length,
    secondTry: qids.filter((id) => !get(id).firstTry && get(id).correct).length,
    ms: Math.round(args.ms),
    wrongIds,
    guessIds: qids.filter((id) => get(id).firstTry && get(id).confidence === 'guess'),
    flaggedIds: qids.filter((id) => get(id).flagged),
    ...(slowestId ? { slowestId } : {}),
    ...(args.timedOut ? { timedOut: true } : {}),
  }
}

/** Adds the finished session and updates the repeat pool: wrong, guessed and flagged questions join it,
 * questions answered right, sure and unflagged leave it. */
export function withSession(results: StudyResults, session: StudySession, qids: string[]): StudyResults {
  const pool = new Set(results.pool)
  const needsWork = new Set([...session.wrongIds, ...session.guessIds, ...session.flaggedIds])
  for (const id of qids) {
    if (needsWork.has(id)) pool.add(id)
    else pool.delete(id)
  }
  return { v: 1, sessions: [...results.sessions, session].slice(-MAX_STORED_SESSIONS), pool: [...pool] }
}

// ---------------------------------------------------------------------------
// Answer checking
// ---------------------------------------------------------------------------

export interface EvalContext {
  outputLanguage: string
  /** Short answers of the other questions (a typo is never forgiven into one of them). */
  otherAnswers: string[]
}

export interface EvalOutcome {
  status: 'correct' | 'partial' | 'incorrect'
  feedback?: string
}

export function matchingText(value: string[]): string {
  return value.map((letter, index) => (letter ? `${index + 1}${letter}` : '')).join(' ')
}

export function emptyAnswer(question: QuizQuestion): AnswerValue {
  switch (question.type) {
    case 'mcq':
      return null
    case 'true-false':
      return null
    case 'matching':
      return question.pairs.map(() => '')
    default:
      return ''
  }
}

/** True when there is something to check. */
export function hasAnswer(question: QuizQuestion, value: AnswerValue): boolean {
  switch (question.type) {
    case 'mcq':
      return typeof value === 'number'
    case 'true-false':
      return typeof value === 'boolean'
    case 'matching':
      return Array.isArray(value) && value.length === question.pairs.length && value.every(Boolean)
    default:
      return typeof value === 'string' && value.trim().length > 0
  }
}

/** The checks that need no AI; null means the answer needs the AI grader (short/open answers that the
 * lenient local comparison did not accept). */
export function evaluateLocal(question: QuizQuestion, value: AnswerValue, context: EvalContext): EvalOutcome | null {
  if (!hasAnswer(question, value)) return { status: 'incorrect' }
  switch (question.type) {
    case 'mcq':
      return { status: value === question.answerIndex ? 'correct' : 'incorrect' }
    case 'true-false':
      return { status: value === question.answerBool ? 'correct' : 'incorrect' }
    case 'fill-blanks':
      return {
        status: isFillBlankMatch(value as string, [question.answer, ...getAcceptableAnswers(question)], {
          turkish: usesTurkishRules(context.outputLanguage, `${question.question} ${question.answer}`),
          otherAnswers: context.otherAnswers,
        })
          ? 'correct'
          : 'incorrect',
      }
    case 'short-answer':
      return isLenientMatch(value as string, [question.answer, ...getAcceptableAnswers(question)]) ? { status: 'correct' } : null
    case 'open-ended':
      return null
    case 'matching': {
      const outcome = checkMatchingAnswer(matchingText(value as string[]), question.pairs.length, getRightOrder(question))
      return { status: outcome.status === 'checked' && outcome.allCorrect ? 'correct' : 'incorrect' }
    }
  }
}

/** Local check first; the existing AI grader only for short/open answers the local check did not accept. */
export async function evaluateAnswer(question: QuizQuestion, value: AnswerValue, context: EvalContext): Promise<EvalOutcome> {
  const local = evaluateLocal(question, value, context)
  if (local) return local
  if (question.type !== 'short-answer' && question.type !== 'open-ended') return { status: 'incorrect' }
  const graded = await gradeAnswer({
    type: question.type,
    question: question.question,
    modelAnswer: question.answer,
    keyPoints: question.type === 'open-ended' ? getKeyPoints(question) : [question.answer],
    evidence: question.evidence ?? '',
    studentAnswer: (value as string).trim(),
    language: context.outputLanguage,
  })
  return { status: graded.verdict, feedback: graded.feedback }
}

/** Letters of a matching question's right column that belong to each left row — the answer key. */
export function matchingKey(question: Extract<QuizQuestion, { type: 'matching' }>): string[] {
  const rightOrder = getRightOrder(question)
  const letters: string[] = []
  rightOrder.forEach((pairIndex, position) => {
    letters[pairIndex] = letterFor(position)
  })
  return letters
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Seconds until a point in time → "m:ss" for the on-screen clock. */
export function formatClock(ms: number): string {
  return formatDuration(Math.max(0, Math.ceil(ms / 1000) * 1000))
}

export function percent(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0
}

export function newSessionId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** BCP-47 tag for the browser's speech voices, from the quiz language (or the interface language when the quiz is "auto"). */
export function speechLanguage(outputLanguage: string, interfaceLanguage: string, sample: string): string {
  const code = outputLanguage && outputLanguage !== 'auto' ? outputLanguage : usesTurkishRules(undefined, sample) ? 'tr' : interfaceLanguage
  const base = code.toLowerCase().split('-')[0]
  if (base === 'tr') return 'tr-TR'
  if (base === 'en') return 'en-US'
  if (base === 'hyw' || base === 'hy') return 'hy'
  return code
}

/** Whole calendar days between a past moment and now (0 = today). */
export function daysAgo(iso: string, now = Date.now()): number {
  const at = new Date(iso)
  const today = new Date(now)
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.max(0, Math.round((startOf(today) - startOf(at)) / 86_400_000))
}
